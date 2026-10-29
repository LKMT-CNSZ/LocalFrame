'use strict';

const http = require('node:http');
const https = require('node:https');

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const LOCAL_PROVIDER_CANDIDATES = [
  { id: 'freetoken', label: 'FreeToken', baseUrl: 'http://127.0.0.1:1919', endpointMode: 'chat-completions' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234', endpointMode: 'chat-completions' },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://127.0.0.1:11434', endpointMode: 'ollama' },
  { id: 'vllm', label: 'vLLM / LocalAI', baseUrl: 'http://127.0.0.1:8000', endpointMode: 'chat-completions' },
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://127.0.0.1:8080', endpointMode: 'chat-completions' },
];

function normalizeBaseUrl(value) {
  let text = String(value || '').trim();
  if (!text) throw new Error('请输入 API 地址');
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  const url = new URL(text);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址只支持 HTTP 或 HTTPS');
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

function stripKnownEndpoint(pathname) {
  return pathname
    .replace(/\/v1\/(?:chat\/completions|responses|models)$/i, '/v1')
    .replace(/\/api\/(?:chat|generate|tags)$/i, '')
    .replace(/\/+$/, '');
}

function resolveEndpoint(baseUrl, endpointMode = 'chat-completions') {
  const normalized = normalizeBaseUrl(baseUrl);
  const url = new URL(normalized);
  const path = stripKnownEndpoint(url.pathname);
  if (endpointMode === 'auto') endpointMode = inferEndpointMode(normalized);
  if (endpointMode === 'ollama') {
    url.pathname = `${path}/api/chat`.replace(/\/+/g, '/');
    return url.toString();
  }
  if (endpointMode === 'responses') {
    url.pathname = `${path}${/\/v1$/i.test(path) ? '' : '/v1'}/responses`.replace(/\/+/g, '/');
    return url.toString();
  }
  url.pathname = `${path}${/\/v1$/i.test(path) ? '' : '/v1'}/chat/completions`.replace(/\/+/g, '/');
  return url.toString();
}

function inferEndpointMode(baseUrl) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  const path = url.pathname.replace(/\/+$/, '');
  if (/\/api\/(chat|generate)$/i.test(path) || url.port === '11434') return 'ollama';
  if (/\/responses$/i.test(path)) return 'responses';
  return 'chat-completions';
}

function inferProviderId(baseUrl) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  if (url.port === '1919') return 'freetoken';
  if (url.port === '1234') return 'lmstudio';
  if (url.port === '11434') return 'ollama';
  if (url.port === '8000') return 'vllm';
  if (url.port === '8080') return 'llamacpp';
  if (/api\.openai\.com$/i.test(url.hostname)) return 'openai';
  if (/api\.deepseek\.com$/i.test(url.hostname)) return 'deepseek';
  return 'custom';
}

function isSameDeviceProvider(config = {}) {
  if (!config.enabled || !config.baseUrl) return false;
  try {
    const hostname = new URL(normalizeBaseUrl(config.baseUrl)).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  } catch { return false; }
}

function resolveModelsEndpoint(baseUrl, endpointMode = 'chat-completions') {
  const normalized = normalizeBaseUrl(baseUrl);
  const url = new URL(normalized);
  if (endpointMode === 'auto') endpointMode = inferEndpointMode(normalized);
  const path = stripKnownEndpoint(url.pathname);
  if (endpointMode === 'ollama') {
    url.pathname = `${path}/api/tags`.replace(/\/+/g, '/');
    return url.toString();
  }
  if (/\/v1$/i.test(path)) url.pathname = `${path}/models`;
  else url.pathname = `${path}/v1/models`.replace(/\/+/g, '/');
  return url.toString();
}

function publicConfig(config = {}) {
  const hasApiKey = Boolean(config.apiKey);
  return {
    enabled: config.enabled === true,
    configured: config.enabled === true && Boolean(config.baseUrl && config.model),
    type: 'openai-compatible',
    providerId: config.providerId || (config.baseUrl ? inferProviderId(config.baseUrl) : 'custom'),
    baseUrl: config.baseUrl || '',
    model: config.model || '',
    endpointMode: config.endpointMode || 'chat-completions',
    authMode: config.authMode || (hasApiKey ? 'bearer' : 'none'),
    hasApiKey,
    needsApiKey: config.enabled === true && config.authMode !== 'none' && !hasApiKey,
  };
}

function buildHeaders(config) {
  if (!config.apiKey || config.authMode === 'none') return {};
  if (config.authMode === 'x-api-key') return { 'x-api-key': config.apiKey };
  return { Authorization: `Bearer ${config.apiKey}` };
}

function requestJson(targetUrl, headers, payload, timeoutMs = 90000, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const body = Buffer.from(JSON.stringify(payload));
    const request = transport.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Content-Length': body.length, ...headers },
      timeout: timeoutMs,
    }, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location && redirectCount < 2) {
        response.resume();
        const redirected = new URL(response.headers.location, url).toString();
        requestJson(redirected, headers, payload, timeoutMs, redirectCount + 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) response.destroy(new Error('API 返回内容过大'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return reject(new Error(`API 未返回 JSON：${raw.slice(0, 160) || '空响应'}`)); }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = parsed.error?.message || parsed.message || raw.slice(0, 200) || `HTTP ${response.statusCode}`;
          return reject(new Error(`API 请求失败（${response.statusCode}）：${message}`));
        }
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy(new Error(`API 连接超时（${Math.round(timeoutMs / 1000)} 秒）`)));
    request.on('error', (error) => reject(new Error(`无法连接 API：${error.message}`)));
    request.end(body);
  });
}

function getJson(targetUrl, headers = {}, timeoutMs = 1600, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      method: 'GET', headers: { Accept: 'application/json', ...headers }, timeout: timeoutMs,
    }, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location && redirectCount < 2) {
        response.resume();
        return getJson(new URL(response.headers.location, url).toString(), headers, timeoutMs, redirectCount + 1).then(resolve, reject);
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) response.destroy(new Error('API 返回内容过大'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return reject(new Error('服务未返回 JSON')); }
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy(new Error('连接超时')));
    request.on('error', reject);
    request.end();
  });
}

function modelsFromDiscovery(result, endpointMode) {
  const source = endpointMode === 'ollama' ? result.models : result.data;
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map((item) => String(item?.id || item?.model || item?.name || '').trim()).filter(Boolean))].slice(0, 100);
}

async function discoverProviderAt(candidate, options = {}) {
  const baseUrl = normalizeBaseUrl(candidate.baseUrl);
  const endpointMode = candidate.endpointMode === 'auto' || !candidate.endpointMode ? inferEndpointMode(baseUrl) : candidate.endpointMode;
  const startedAt = Date.now();
  const result = await getJson(resolveModelsEndpoint(baseUrl, endpointMode), buildHeaders(options), options.timeoutMs || 1600);
  const models = modelsFromDiscovery(result, endpointMode);
  if (!models.length) throw new Error('服务可访问，但没有发现已加载模型');
  const providerId = candidate.id && candidate.id !== 'custom' ? candidate.id : inferProviderId(baseUrl);
  return {
    id: providerId,
    label: candidate.label || ({ freetoken: 'FreeToken', lmstudio: 'LM Studio', ollama: 'Ollama', vllm: 'vLLM / LocalAI', llamacpp: 'llama.cpp' }[providerId] || 'OpenAI 兼容服务'),
    baseUrl,
    endpointMode,
    authMode: options.apiKey ? (options.authMode || 'bearer') : 'none',
    model: models[0],
    models,
    latencyMs: Date.now() - startedAt,
  };
}

async function detectLocalProviders(input = {}) {
  const candidates = [...LOCAL_PROVIDER_CANDIDATES];
  if (input.baseUrl) {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    if (!candidates.some((item) => normalizeBaseUrl(item.baseUrl) === baseUrl)) {
      candidates.unshift({ id: inferProviderId(baseUrl), label: '输入的 API 地址', baseUrl, endpointMode: input.endpointMode || 'auto', useInputAuth: true });
    }
  }
  const settled = await Promise.allSettled(candidates.map((candidate) => discoverProviderAt(candidate, {
    apiKey: candidate.useInputAuth ? (input.apiKey || '') : '',
    authMode: candidate.useInputAuth ? (input.authMode || 'bearer') : 'none',
    timeoutMs: 1800,
  })));
  const services = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
  services.sort((a, b) => {
    const priority = { freetoken: 0, lmstudio: 1, ollama: 2, vllm: 3, llamacpp: 4 };
    return (priority[a.id] ?? 10) - (priority[b.id] ?? 10) || a.latencyMs - b.latencyMs;
  });
  return { services, recommended: services[0] || null, scanned: candidates.length };
}

function extractText(result, endpointMode) {
  if (endpointMode === 'responses') {
    if (typeof result.output_text === 'string') return result.output_text.trim();
    const texts = (result.output || []).flatMap((item) => item.content || []).filter((item) => item.type === 'output_text').map((item) => item.text);
    return texts.join('\n').trim();
  }
  if (endpointMode === 'ollama') return String(result.message?.content || result.response || '').trim();
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((item) => item.text || item.content || '').join('').trim();
  return '';
}

async function chat(config, messages, options = {}) {
  const endpointMode = config.endpointMode === 'auto' ? inferEndpointMode(config.baseUrl) : (config.endpointMode || 'chat-completions');
  const endpoint = resolveEndpoint(config.baseUrl, endpointMode);
  let payload;
  if (endpointMode === 'responses') {
    payload = { model: config.model, input: messages, max_output_tokens: options.maxTokens || 1800 };
  } else if (endpointMode === 'ollama') {
    payload = { model: config.model, messages, stream: false, options: { temperature: options.temperature ?? 0.5 } };
  } else {
    payload = { model: config.model, messages, temperature: options.temperature ?? 0.5, stream: false };
    if (options.maxTokens) payload.max_tokens = options.maxTokens;
  }
  const result = await requestJson(endpoint, buildHeaders(config), payload, options.timeoutMs || 90000);
  const text = extractText(result, endpointMode);
  if (!text) throw new Error('API 已连接，但没有返回可用文本；请检查模型名称和接口模式');
  return { text, endpoint, raw: result };
}

async function releaseLocalModel(config = {}, options = {}) {
  if (!isSameDeviceProvider(config)) return { local: false, attempted: false, released: false, reason: 'remote-provider' };
  const endpointMode = config.endpointMode === 'auto' ? inferEndpointMode(config.baseUrl) : config.endpointMode;
  const providerId = config.providerId || inferProviderId(config.baseUrl);
  if (endpointMode !== 'ollama' && providerId !== 'ollama') {
    return { local: true, attempted: false, released: false, reason: 'no-standard-unload-api' };
  }
  const endpoint = resolveEndpoint(config.baseUrl, 'ollama').replace(/\/api\/chat$/i, '/api/generate');
  try {
    await requestJson(endpoint, buildHeaders(config), { model: config.model, keep_alive: 0 }, options.timeoutMs || 30000);
    return { local: true, attempted: true, released: true, providerId: 'ollama', endpoint };
  } catch (error) {
    return { local: true, attempted: true, released: false, providerId: 'ollama', endpoint, reason: error.message };
  }
}

function sanitizeConfig(input = {}, previous = {}) {
  const baseUrl = normalizeBaseUrl(input.baseUrl || previous.baseUrl || '');
  const model = String(input.model || '').trim();
  if (!model) throw new Error('请输入模型名称');
  const endpointMode = ['auto', 'chat-completions', 'responses', 'ollama'].includes(input.endpointMode) ? input.endpointMode : inferEndpointMode(baseUrl);
  const authMode = ['bearer', 'x-api-key', 'none'].includes(input.authMode) ? input.authMode : 'bearer';
  const apiKey = input.apiKey === undefined || input.apiKey === '' ? (previous.apiKey || '') : String(input.apiKey).trim();
  const providerId = String(input.providerId || inferProviderId(baseUrl));
  return { enabled: input.enabled !== false, type: 'openai-compatible', providerId, baseUrl, model, endpointMode, authMode, apiKey };
}

module.exports = {
  LOCAL_PROVIDER_CANDIDATES, normalizeBaseUrl, resolveEndpoint, resolveModelsEndpoint, inferEndpointMode, inferProviderId,
  isSameDeviceProvider, publicConfig, sanitizeConfig, requestJson, getJson, extractText, discoverProviderAt, detectLocalProviders,
  chat, releaseLocalModel,
};
