'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');

const REPO = 'unsloth/Qwen-Image-2.1-GGUF';
const REVISION = '2c31ccd392b367a6637841a143813320a02dff55';
const VARIANTS = ['Q2_K', 'Q3_K_M', 'Q3_K_S', 'Q3_K_XL', 'Q4_K_M', 'Q4_K_S', 'Q5_K_M', 'Q5_K_S', 'Q6_K', 'Q6_K_XL', 'Q8_0'];
const Q6_SHA256 = '2ead1ee665e8ebc5fec517d287a167f5c6a7e985acbf3b1b93143437a04616ac';
const Q6_SIZE = 6271551200;
const fileName = variant => `qwen-image-2.1-${variant}.gguf`;
const modelDir = comfyDir => path.join(comfyDir, 'models', 'diffusion_models');
const modelPath = (comfyDir, variant) => path.join(modelDir(comfyDir), fileName(variant));
const needed = ['qwen3vl_8b_int8_convrot.safetensors', 'qwen_image_2.1_vae_bf16.safetensors'];

function installed(comfyDir) {
  return VARIANTS.filter(v => { try { return fs.statSync(modelPath(comfyDir, v)).size > 100000000; } catch { return false; } });
}
function components(comfyDir) {
  const detector = path.join(comfyDir, 'custom_nodes', 'ComfyUI-GGUF', 'tools', 'convert.py');
  let ggufNode = false;
  try { ggufNode = fs.readFileSync(detector, 'utf8').includes('ModelQwenImage21'); } catch {}
  return {
    encoder: fs.existsSync(path.join(comfyDir, 'models', 'text_encoders', needed[0])),
    vae: fs.existsSync(path.join(comfyDir, 'models', 'vae', needed[1])),
    ggufNode,
  };
}
function graph(config) {
  return {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: fileName(config.variant) } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: needed[0], type: 'qwen_image', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: needed[1] } },
    '4': { class_type: 'TextEncodeQwenImage21', inputs: { clip: ['2', 0], prompt: config.prompt, negative_prompt: config.negative || '', resolution: 1024 } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: config.width, height: config.height, batch_size: 1 } },
    '6': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['4', 1], latent_image: ['5', 0], seed: config.seed, steps: config.steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    '7': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['3', 0] } },
    '8': { class_type: 'SaveImage', inputs: { images: ['7', 0], filename_prefix: 'LocalFrame-Qwen-Image-2.1' } },
  };
}
function get(url, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`模型仓库 HTTP ${res.statusCode}`)); }
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > maxBytes) req.destroy(new Error('模型元数据过大')); else chunks.push(chunk); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('模型仓库连接超时')));
    req.on('error', reject);
  });
}
async function metadata(variant) {
  if (!VARIANTS.includes(variant)) throw new Error('不支持的 Qwen Image 2.1 量化版本');
  if (variant === 'Q6_K') return { size: Q6_SIZE, sha256: Q6_SHA256 };
  const data = JSON.parse((await get(`https://hf-mirror.com/api/models/${REPO}/tree/${REVISION}?recursive=true&expand=true`, 3 * 1024 * 1024)).toString('utf8'));
  const entry = data.find(item => item.path === fileName(variant));
  if (!entry || !/^[a-f0-9]{64}$/.test(entry.lfs?.oid || '') || !Number.isSafeInteger(entry.size)) throw new Error('模型仓库缺少可信的文件元数据');
  return { size: entry.size, sha256: entry.lfs.oid };
}
async function download(variant, comfyDir, onProgress) {
  const meta = await metadata(variant);
  return new Promise((resolve, reject) => {
    const destination = modelPath(comfyDir, variant), partial = `${destination}.part`;
    fs.mkdirSync(modelDir(comfyDir), { recursive: true });
    if (fs.existsSync(destination)) return reject(new Error('该版本已经下载'));
    const url = `https://hf-mirror.com/${REPO}/resolve/${REVISION}/${fileName(variant)}`;
    let count = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
    if (count > meta.size) return reject(new Error('未完成的下载文件超过仓库记录大小'));
    let hash = crypto.createHash('sha256');
    const request = (target, redirects = 0) => {
      if (redirects > 3) return reject(new Error('模型下载重定向过多'));
      const parsed = new URL(target);
      if (parsed.protocol !== 'https:' || !['hf-mirror.com', 'cas-bridge.xethub.hf.co'].includes(parsed.hostname)) return reject(new Error('模型下载跳转到非预期站点'));
      const req = https.get(parsed, { timeout: 60000, headers: count ? { Range: `bytes=${count}-` } : {} }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) { res.resume(); return request(new URL(res.headers.location, parsed).toString(), redirects + 1); }
        if (![200, 206].includes(res.statusCode)) { res.resume(); return reject(new Error(`模型下载 HTTP ${res.statusCode}`)); }
        if (res.statusCode === 206 && !String(res.headers['content-range'] || '').startsWith(`bytes ${count}-`)) { res.resume(); return reject(new Error('模型续传范围与本地文件不匹配')); }
        const append = count > 0 && res.statusCode === 206;
        if (!append) { count = 0; hash = crypto.createHash('sha256'); }
        const out = fs.createWriteStream(partial, { flags: append ? 'a' : 'w' });
        res.on('data', chunk => { count += chunk.length; hash.update(chunk); onProgress(count, meta.size); if (count > meta.size) req.destroy(new Error('模型文件超过预期大小')); });
        res.on('error', reject); out.on('error', reject);
        out.on('finish', () => {
          if (count !== meta.size || hash.digest('hex') !== meta.sha256) return reject(new Error('模型大小或 SHA-256 校验失败；请删除 .part 后重试'));
          fs.renameSync(partial, destination); resolve({ file: destination, size: count, sha256: meta.sha256 });
        });
        res.pipe(out);
      });
      req.on('timeout', () => req.destroy(new Error('模型下载超时'))); req.on('error', reject);
    };
    if (count) {
      const input = fs.createReadStream(partial);
      input.on('data', chunk => hash.update(chunk)); input.on('error', reject);
      input.on('end', () => {
        if (count === meta.size) {
          if (hash.digest('hex') !== meta.sha256) return reject(new Error('未完成模型文件 SHA-256 不匹配'));
          fs.renameSync(partial, destination); resolve({ file: destination, size: count, sha256: meta.sha256 });
        } else request(url);
      });
    } else request(url);
  });
}
module.exports = { VARIANTS, Q6_SHA256, Q6_SIZE, installed, components, graph, metadata, download, modelPath };
