'use strict';
const http = require('node:http');
const https = require('node:https');
const { decodePng } = require('./white-model');

function endpoint(value) {
  const url = new URL(String(value || '').trim());
  if (url.username || url.password || url.search || url.hash) throw new Error('API 地址不能包含凭据、查询参数或片段');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('远程 API 必须使用 HTTPS');
  url.pathname = `${url.pathname.replace(/\/+$/, '').replace(/\/images\/generations$/, '').replace(/\/v1$/, '')}/v1/images/generations`;
  return url;
}
async function generate(input) {
  if (input.confirmed !== true) throw new Error('请先确认提示词将发送到第三方服务，并可能产生费用');
  const url = endpoint(input.baseUrl);
  const model = String(input.model || '').trim(), prompt = String(input.prompt || '').trim(), key = String(input.apiKey || '').trim();
  if (!model || model.length > 200 || /[\r\n\0]/.test(model)) throw new Error('请输入有效的 API 模型 ID');
  if (!prompt || prompt.length > 2000) throw new Error('提示词长度应为 1 至 2000 字');
  if (key.length > 4096 || /[\r\n\0]/.test(key)) throw new Error('API Key 格式无效');
  const width = Number(input.width), height = Number(input.height);
  if (![512, 768, 1024].includes(width) || ![512, 768, 1024].includes(height) || width * height > 1024 * 1024) throw new Error('图片尺寸无效');
  const body = Buffer.from(JSON.stringify({ model, prompt, size: `${width}x${height}`, n: 1, response_format: 'b64_json' }));
  const response = await new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, { method: 'POST', timeout: 180000, headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, ...(key ? { Authorization: `Bearer ${key}` } : {}) } }, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(new Error(`生图 API 返回 HTTP ${res.statusCode}；未自动重试，以免重复计费`)); }
      const chunks = []; let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 30 * 1024 * 1024) req.destroy(new Error('生图 API 响应过大')); else chunks.push(chunk); });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('生图 API 请求超时；请先检查服务商记录，勿立即重复提交')));
    req.on('error', reject); req.end(body);
  });
  let data; try { data = JSON.parse(response); } catch { throw new Error('生图 API 未返回 JSON'); }
  if (!data.data?.[0]?.b64_json) throw new Error('接口未返回 data[0].b64_json；当前仅支持直接返回 PNG Base64');
  const image = decodePng(data.data[0].b64_json);
  return { image: `data:image/png;base64,${image.buffer.toString('base64')}`, model };
}
module.exports = { endpoint, generate };
