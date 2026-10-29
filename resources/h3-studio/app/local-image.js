'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const qwen = require('./qwen-image');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function checkpoints(comfyDir) {
  const folder = path.join(comfyDir, 'models', 'checkpoints');
  try { return fs.readdirSync(folder, { withFileTypes: true })
    .filter(item => item.isFile() && /\.(safetensors|ckpt)$/i.test(item.name) && fs.statSync(path.join(folder, item.name)).size > 100 * 1024 * 1024)
    .map(item => item.name); } catch { return []; }
}
function settings(input, available) {
  const model = String(input.model || '');
  if (!available.includes(model)) throw new Error('请选择已安装的本地图像检查点模型');
  const prompt = String(input.prompt || '').trim();
  if (!prompt || prompt.length > 2000) throw new Error('提示词长度应为 1 至 2000 字');
  const width = Number(input.width || 768), height = Number(input.height || 768);
  if (![512, 768, 1024].includes(width) || ![512, 768, 1024].includes(height) || width * height > 1024 * 1024) throw new Error('图片尺寸无效');
  const steps = Number(input.steps || 20);
  if (!Number.isInteger(steps) || steps < 4 || steps > 40) throw new Error('采样步数须为 4 至 40');
  return { model, prompt, negative: String(input.negative || '').slice(0, 1000), width, height, steps,
    seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : Math.floor(Math.random() * 2 ** 32) };
}
function workflow(config) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: config.model } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: config.prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: config.negative, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: config.width, height: config.height, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: config.seed, steps: config.steps, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'LocalFrame-image' } },
  };
}
function editWorkflow(config, uploadedName, strength, prefix) {
  const result = workflow(config);
  result['4'] = { class_type: 'LoadImage', inputs: { image: uploadedName } };
  result['8'] = { class_type: 'VAEEncode', inputs: { pixels: ['4', 0], vae: ['1', 2] } };
  result['5'].inputs.latent_image = ['8', 0];
  result['5'].inputs.denoise = strength;
  result['7'].inputs.filename_prefix = prefix;
  return result;
}
function request(baseUrl, pathname, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(new URL(pathname, baseUrl), { method, timeout: 30000,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {} }, res => {
      const chunks = []; let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 20 * 1024 * 1024) req.destroy(new Error('ComfyUI 响应过大')); else chunks.push(chunk); });
      res.on('end', () => { try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (res.statusCode >= 300) reject(new Error(data.error?.message || `ComfyUI HTTP ${res.statusCode}`)); else resolve(data); } catch (error) { reject(error); } });
    });
    req.on('timeout', () => req.destroy(new Error('ComfyUI 请求超时'))); req.on('error', reject); req.end(payload);
  });
}
async function connectProgress(baseUrl, clientId, onProgress) {
  if (typeof WebSocket !== 'function' || !onProgress) return { setPromptId() {}, close() {} };
  const url = new URL('/ws', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('clientId', clientId);
  let socket;
  let promptId = '';
  try {
    socket = new WebSocket(url);
    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string') return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      const data = message.data || {};
      if (!promptId || data.prompt_id !== promptId) return;
      if (message.type === 'progress' && Number.isFinite(data.value) && Number.isFinite(data.max) && data.max > 0) {
        onProgress({ phase: '正在采样', step: Math.min(data.max, data.value), total: data.max });
      } else if (message.type === 'executing' && data.node) {
        onProgress({ phase: '正在处理图像' });
      }
    });
    await Promise.race([
      new Promise(resolve => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', resolve, { once: true }); }),
      wait(1500),
    ]);
  } catch { return { setPromptId() {}, close() {} }; }
  return { setPromptId(id) { promptId = id; }, close() { try { socket.close(); } catch {} } };
}
async function generate(input, comfy, comfyDir, onProgress) {
  const isQwen = input.engine === 'qwen-image-2.1';
  const config = isQwen ? settings({ ...input, model: input.variant }, qwen.installed(comfyDir)) : settings(input, checkpoints(comfyDir));
  if (isQwen) {
    const ready = qwen.components(comfyDir);
    if (!ready.encoder || !ready.vae || !ready.ggufNode) throw new Error('Qwen 2.1 还需要官方文本编码器、VAE 和 ComfyUI-GGUF 节点；请先安装配套组件');
    config.variant = config.model;
  }
  if (comfy.isBusy()) throw new Error('视频生成正在使用 ComfyUI，请等待完成');
  onProgress?.({ phase: '正在启动本机生成环境' });
  await comfy.ensureServer(null, { mode: 'professional' });
  const queue = await request(comfy.baseUrl, '/queue');
  if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI 队列已有任务，请等待完成');
  const clientId = `localframe-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const progress = await connectProgress(comfy.baseUrl, clientId, onProgress);
  try {
    const queued = await request(comfy.baseUrl, '/prompt', 'POST', { prompt: isQwen ? qwen.graph(config) : workflow(config), client_id: clientId });
    if (!queued.prompt_id) throw new Error(queued.error?.message || 'ComfyUI 未接受图片任务');
    progress.setPromptId(queued.prompt_id);
    onProgress?.({ phase: '任务已提交，等待采样', promptId: queued.prompt_id });
    const deadline = Date.now() + 20 * 60 * 1000;
    while (Date.now() < deadline) {
      const history = await request(comfy.baseUrl, `/history/${encodeURIComponent(queued.prompt_id)}`);
      const item = history[queued.prompt_id];
      if (item?.status?.status_str === 'error') throw new Error('本地图片生成失败，请查看 ComfyUI 运行日志');
      const image = item?.outputs?.[isQwen ? '8' : '7']?.images?.[0];
      if (image) {
        onProgress?.({ phase: '正在保存图片' });
        const file = path.resolve(comfy.outputDir, String(image.subfolder || ''), path.basename(String(image.filename || '')));
        if (!file.startsWith(path.resolve(comfy.outputDir) + path.sep) || !fs.existsSync(file)) throw new Error('ComfyUI 输出路径无效');
        const png = fs.readFileSync(file);
        if (png.length > 20 * 1024 * 1024 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('ComfyUI 未输出有效 PNG');
        return { buffer: png, sourceName: path.basename(file), model: config.model, seed: config.seed };
      }
      await wait(1500);
    }
    throw new Error('本地图片生成等待超时；任务可能仍在 ComfyUI 中运行，请先检查队列');
  } finally { progress.close(); }
}
async function queueImage(workflowValue, comfy) {
  const queued = await request(comfy.baseUrl, '/prompt', 'POST', { prompt: workflowValue, client_id: `localframe-frame-${Date.now()}` });
  if (!queued.prompt_id) throw new Error(queued.error?.message || 'ComfyUI 未接受视频帧任务');
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const history = await request(comfy.baseUrl, `/history/${encodeURIComponent(queued.prompt_id)}`);
    const item = history[queued.prompt_id];
    if (item?.status?.status_str === 'error') throw new Error('帧渲染失败，请查看 ComfyUI 日志');
    const image = item?.outputs?.['7']?.images?.[0];
    if (image) return comfy.resolveComfyOutput(image);
    await wait(1500);
  }
  throw new Error('帧渲染等待超时；请检查 ComfyUI 队列');
}
module.exports = { checkpoints, settings, workflow, editWorkflow, generate, queueImage, request };
