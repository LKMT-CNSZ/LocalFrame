'use strict';
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

function endpoint(value) {
  const url = new URL(String(value || '').trim());
  if (url.username || url.password || url.search || url.hash) throw new Error('API 地址不能含凭据、查询参数或片段');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('远程 API 必须使用 HTTPS；HTTP 仅用于本机服务');
  }
  let pathname = url.pathname.replace(/\/+$/, '').replace(/\/images\/edits$/, '');
  if (!/\/v1$/.test(pathname)) pathname += '/v1';
  url.pathname = `${pathname}/images/edits`;
  return url;
}
function pngInfo(buffer) {
  if (buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buffer.subarray(12,16).toString() !== 'IHDR') throw new Error('接口需要返回有效的 PNG 图像');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192) throw new Error('PNG 图像尺寸超出安全范围');
  return { width, height };
}
function decodePng(data, max = 20 * 1024 * 1024) {
  const text = String(data || '').replace(/^data:image\/png;base64,/, '');
  if (!text || text.length > Math.ceil(max * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error('PNG 图像编码无效或过大');
  const buffer = Buffer.from(text, 'base64');
  if (buffer.length > max) throw new Error('PNG 图像超过大小限制');
  return { buffer, ...pngInfo(buffer) };
}
function makeRequest(input) {
  if (input.confirmed !== true) throw new Error('尚未确认上传画面和 API 费用');
  const url = endpoint(input.baseUrl);
  const model = String(input.model || '').trim();
  const prompt = String(input.prompt || '').trim();
  const apiKey = String(input.apiKey || '').trim();
  if (!model || model.length > 200 || /[\r\n\0]/.test(model)) throw new Error('请填写有效的图像编辑模型 ID');
  if (!prompt || prompt.length > 3000) throw new Error('效果描述长度应为 1 至 3000 字');
  if (apiKey.length > 4096 || /[\r\n\0]/.test(apiKey)) throw new Error('API Key 格式无效');
  const image = decodePng(input.image, 8 * 1024 * 1024);
  const boundary = `LocalFrame${crypto.randomBytes(18).toString('hex')}`;
  const chunks = [];
  for (const [key, value] of Object.entries({ model, prompt: `Preserve the reference camera, silhouette, geometry and openings. Render materials and lighting only. ${prompt}`, size: '1024x1024', n: '1' })) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="white-model.png"\r\nContent-Type: image/png\r\n\r\n`), image.buffer, Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  return { url, body, headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length, ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) } };
}
async function renderWhiteModel(input) {
  const request = makeRequest(input);
  const text = await new Promise((resolve, reject) => {
    const transport = request.url.protocol === 'https:' ? https : http;
    const req = transport.request(request.url, { method: 'POST', headers: request.headers }, res => {
      // Never forward image or credentials through a redirect.
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); reject(new Error(`图像编辑 API 返回 HTTP ${res.statusCode}；请检查地址、凭据、模型和接口权限。未自动重试，避免重复计费。`)); return;
      }
      const chunks = []; let length = 0;
      res.on('data', chunk => { length += chunk.length; if (length > 30 * 1024 * 1024) req.destroy(new Error('AI 响应超过 30MB 限制')); else chunks.push(chunk); });
      res.on('error', reject); res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    const timer = setTimeout(() => req.destroy(new Error('AI 请求超时；服务商可能仍在处理。请先检查服务商记录，勿立即重复提交。')), 180000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', error => reject(new Error(error.message.includes('AI ') ? error.message : '无法连接图像编辑服务；未自动重试。')));
    req.end(request.body);
  });
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('图像编辑服务未返回 JSON'); }
  if (!data.data?.[0]?.b64_json) throw new Error('服务未返回 data[0].b64_json；当前仅支持直接返回 PNG Base64 的图像编辑接口，不自动访问外部图片链接。');
  const result = decodePng(data.data[0].b64_json);
  return { image: `data:image/png;base64,${result.buffer.toString('base64')}`, width: result.width, height: result.height };
}
module.exports = { endpoint, pngInfo, decodePng, makeRequest, renderWhiteModel };
