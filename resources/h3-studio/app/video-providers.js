'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const REMOTE_PROVIDER_IDS = ['minimax', 'kling', 'jimeng', 'doubao'];
const PLATFORM_PROVIDER_IDS = ['kling-platform', 'jimeng-platform'];

const RESOLUTION_SPECS = Object.freeze({
  '720P': { id: '720P', label: '720p', landscape: [1280, 720], portrait: [720, 1280] },
  '768P': { id: '768P', label: '768p', landscape: [1366, 768], portrait: [768, 1366] },
  '1080P': { id: '1080P', label: '1080p', landscape: [1920, 1080], portrait: [1080, 1920] },
});

function cloudCapabilities(overrides = {}) {
  return {
    textToVideo: true, imageToVideo: true, firstFrame: true, lastFrame: false,
    nativeAudio: false, remoteCancel: false, minDuration: 5, maxDuration: 10,
    durations: [5, 10], resolutions: ['720P'], ratios: ['16:9', '9:16'],
    ...overrides,
  };
}

const PROVIDER_MODEL_CATALOG = Object.freeze({
  minimax: [
    { id: 'MiniMax-Hailuo-02', label: 'MiniMax Hailuo 02', capabilities: cloudCapabilities({ durations: [6, 10], minDuration: 6, resolutions: ['768P', '1080P'] }) },
    { id: 'video-01', label: 'MiniMax Video 01', capabilities: cloudCapabilities({ durations: [6], minDuration: 6, maxDuration: 6, resolutions: ['768P'] }) },
    { id: 'video-01-live2', label: 'MiniMax Video 01 Live2', capabilities: cloudCapabilities({ durations: [6], minDuration: 6, maxDuration: 6, resolutions: ['768P'] }) },
  ],
  kling: [
    { id: 'kling-v2-1', label: 'Kling v2.1', capabilities: cloudCapabilities({ lastFrame: true, resolutions: ['720P', '1080P'] }) },
    { id: 'kling-v2-master', label: 'Kling v2 Master', capabilities: cloudCapabilities({ lastFrame: true, resolutions: ['720P', '1080P'] }) },
  ],
  jimeng: [
    { id: 'jimeng_t2v_v30', label: 'Jimeng T2V v3.0', capabilities: cloudCapabilities({ imageToVideo: false, firstFrame: false, resolutions: ['720P', '1080P'] }) },
    { id: 'jimeng_i2v_v30', label: 'Jimeng I2V v3.0', capabilities: cloudCapabilities({ textToVideo: false, lastFrame: true, resolutions: ['720P', '1080P'] }) },
  ],
  doubao: [
    { id: 'doubao-seedance-1-5-pro-250528', label: 'Doubao Seedance 1.5 Pro', capabilities: cloudCapabilities({ lastFrame: true, nativeAudio: true, resolutions: ['720P', '1080P'] }) },
  ],
});

const PROVIDER_PRESETS = Object.freeze({
  'local-h3-int8': {
    id: 'local-h3-int8', label: '本地 H3 高质量', kind: 'local', model: 'MiniMax H3 INT8',
    capabilities: { textToVideo: true, imageToVideo: true, firstFrame: true, lastFrame: true, nativeAudio: true, remoteCancel: true, minDuration: 1, maxDuration: 900, durations: [], resolutions: ['960x544', '1152x640', '1344x768', '544x960', '640x1152', '768x1344'] },
  },
  'local-h3-q2': {
    id: 'local-h3-q2', label: '本地 H3 兼容预览', kind: 'local', model: 'MiniMax H3 Q2',
    capabilities: { textToVideo: true, imageToVideo: true, firstFrame: true, lastFrame: true, nativeAudio: true, remoteCancel: true, minDuration: 1, maxDuration: 10, durations: [], resolutions: ['960x544', '1152x640', '544x960', '640x1152'] },
  },
  'kling-platform': {
    id: 'kling-platform', label: '可灵 AI 平台协作', kind: 'platform', model: '可灵网页版', platformUrl: 'https://klingai.kuaishou.com/', credentialFields: [],
    capabilities: { textToVideo: true, imageToVideo: true, firstFrame: true, lastFrame: true, nativeAudio: false, remoteCancel: false, minDuration: 5, maxDuration: 10, durations: [5, 10], resolutions: ['720P', '1080P'] },
  },
  'jimeng-platform': {
    id: 'jimeng-platform', label: '即梦 AI 平台协作', kind: 'platform', model: '即梦网页版', platformUrl: 'https://jimeng.jianying.com/ai-tool/home', credentialFields: [],
    capabilities: { textToVideo: true, imageToVideo: true, firstFrame: true, lastFrame: true, nativeAudio: false, remoteCancel: false, minDuration: 5, maxDuration: 10, durations: [5, 10], resolutions: ['720P', '1080P'] },
  },
  minimax: {
    id: 'minimax', label: 'MiniMax 海螺', kind: 'cloud', baseUrl: 'https://api.minimax.io', model: 'MiniMax-Hailuo-02', credentialFields: ['apiKey'],
    capabilities: cloudCapabilities({ durations: [6, 10], minDuration: 6, resolutions: ['768P', '1080P'] }),
  },
  kling: {
    id: 'kling', label: '可灵 AI', kind: 'cloud', baseUrl: 'https://api.klingai.com', model: 'kling-v2-1', credentialFields: ['accessKey', 'secretKey'],
    capabilities: cloudCapabilities({ lastFrame: true, resolutions: ['720P', '1080P'] }),
  },
  jimeng: {
    id: 'jimeng', label: '即梦 AI', kind: 'cloud', baseUrl: 'https://visual.volcengineapi.com', model: 'jimeng_t2v_v30', credentialFields: ['accessKey', 'secretKey'],
    capabilities: cloudCapabilities({ lastFrame: true, resolutions: ['720P', '1080P'] }),
  },
  doubao: {
    id: 'doubao', label: '豆包视频', kind: 'cloud', baseUrl: 'https://ark.cn-beijing.volces.com', model: 'doubao-seedance-1-5-pro-250528', credentialFields: ['apiKey'],
    capabilities: cloudCapabilities({ lastFrame: true, nativeAudio: true, resolutions: ['720P', '1080P'] }),
  },
});

function catalogModels(providerId) {
  return (PROVIDER_MODEL_CATALOG[providerId] || []).map((item) => ({
    id: item.id,
    label: item.label || item.id,
    available: null,
    source: 'maintained-catalog',
    verified: false,
    capabilities: { ...item.capabilities },
    nativeResolutions: (item.capabilities.resolutions || []).map((id) => ({ ...RESOLUTION_SPECS[id] })).filter((item) => item.id),
  }));
}

function modelDescriptor(providerId, modelId, options = {}) {
  const id = cleanString(modelId, 180);
  const catalog = (PROVIDER_MODEL_CATALOG[providerId] || []).find((item) => item.id.toLowerCase() === id.toLowerCase());
  const preset = providerPreset(providerId);
  const capabilities = { ...(catalog?.capabilities || preset.capabilities) };
  return {
    id,
    label: catalog?.label || id,
    available: options.available ?? null,
    source: options.source || (catalog ? 'maintained-catalog' : 'provider-response'),
    verified: Boolean(options.verified),
    capabilitiesVerified: Boolean(options.capabilitiesVerified),
    capabilities,
    nativeResolutions: (capabilities.resolutions || []).map((resolutionId) => ({ ...RESOLUTION_SPECS[resolutionId] })).filter((item) => item.id),
  };
}

function capabilitiesForModel(providerId, modelId) {
  return modelDescriptor(providerId, modelId || providerPreset(providerId).model).capabilities;
}

function cleanString(value, max = 2000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function ensureHttpUrl(value, fallback) {
  const url = new URL(cleanString(value, 2048) || fallback);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址仅支持 HTTP 或 HTTPS');
  if (url.username || url.password || url.search || url.hash) throw new Error('API 地址不能包含账号、密码、查询参数或片段');
  url.pathname = url.pathname.replace(/\/(?:v1|api\/v3)\/?$/i, '') || '/';
  return url.toString().replace(/\/$/, '');
}

function providerPreset(id) {
  const preset = PROVIDER_PRESETS[id];
  if (!preset) throw new Error(`不支持的视频提供商：${id}`);
  return preset;
}

function sanitizeProviderConfig(id, input = {}, previous = {}) {
  const preset = providerPreset(id);
  if (preset.kind !== 'cloud') throw new Error('本地引擎不需要云端凭据');
  const result = {
    providerId: id,
    enabled: input.enabled !== false,
    baseUrl: ensureHttpUrl(input.baseUrl, previous.baseUrl || preset.baseUrl),
    model: cleanString(input.model || previous.model || preset.model, 180),
    nativeResolution: cleanString(input.nativeResolution || previous.nativeResolution || preset.capabilities.resolutions?.[0], 32),
  };
  const capabilities = capabilitiesForModel(id, result.model);
  if (!capabilities.resolutions.includes(result.nativeResolution)) result.nativeResolution = capabilities.resolutions[0] || '';
  for (const field of preset.credentialFields) {
    const incoming = cleanString(input[field], 4096);
    const sameOrigin = !previous.baseUrl || new URL(previous.baseUrl).origin === new URL(result.baseUrl).origin;
    result[field] = incoming || (sameOrigin ? cleanString(previous[field], 4096) : '');
  }
  return result;
}

function credentialState(id, config = {}) {
  const preset = providerPreset(id);
  const fields = Object.fromEntries((preset.credentialFields || []).map((field) => [field, Boolean(config[field])]));
  return { fields, complete: Object.values(fields).every(Boolean) };
}

function publicProviderConfig(id, config = {}) {
  const preset = providerPreset(id);
  const credentials = credentialState(id, config);
  const credentialFree = preset.kind !== 'cloud';
  const selectedModel = config.model || preset.model;
  const models = preset.kind === 'cloud' ? catalogModels(id) : [];
  if (preset.kind === 'cloud' && selectedModel && !models.some((item) => item.id === selectedModel)) models.unshift(modelDescriptor(id, selectedModel));
  const capabilities = preset.kind === 'cloud' ? capabilitiesForModel(id, selectedModel) : { ...preset.capabilities };
  return {
    id,
    label: preset.label,
    kind: preset.kind,
    enabled: credentialFree ? true : config.enabled !== false,
    configured: credentialFree ? true : credentials.complete,
    baseUrl: preset.kind === 'cloud' ? (config.baseUrl || preset.baseUrl) : '',
    model: selectedModel,
    models,
    nativeResolution: config.nativeResolution || capabilities.resolutions?.[0] || '',
    platformUrl: preset.kind === 'platform' ? preset.platformUrl : '',
    credentials,
    capabilities,
  };
}

class VideoProviderConfigStore {
  constructor(file) { this.file = file; this.discoveries = new Map(); }

  rememberDiscovery(config, discovery) {
    this.discoveries.set(config.providerId, { fingerprint: sha256(JSON.stringify(config)), discovery });
  }

  load() {
    let parsed = {};
    try { parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    const providers = {};
    for (const id of REMOTE_PROVIDER_IDS) {
      try { providers[id] = sanitizeProviderConfig(id, parsed.providers?.[id] || {}, {}); }
      catch { providers[id] = sanitizeProviderConfig(id, {}, {}); }
    }
    const selectedProviderId = PROVIDER_PRESETS[parsed.selectedProviderId] ? parsed.selectedProviderId : 'local-h3-int8';
    return { version: 1, selectedProviderId, providers };
  }

  saveProvider(id, input = {}) {
    const state = this.load();
    state.providers[id] = sanitizeProviderConfig(id, input, state.providers[id]);
    if (input.select === true) state.selectedProviderId = id;
    this.write(state);
    return state;
  }

  select(id) {
    providerPreset(id);
    const state = this.load();
    state.selectedProviderId = id;
    this.write(state);
    return state;
  }

  write(state) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(temp, 0o600); } catch {}
    fs.renameSync(temp, this.file);
  }

  publicState() {
    const state = this.load();
    return {
      selectedProviderId: state.selectedProviderId,
      providers: Object.values(PROVIDER_PRESETS).map((preset) => {
        const config = state.providers[preset.id] || {};
        const result = publicProviderConfig(preset.id, config);
        const cached = this.discoveries.get(preset.id);
        if (cached?.fingerprint === sha256(JSON.stringify(config))) result.models = cached.discovery.models;
        return result;
      }),
    };
  }
}

function encodeBase64Url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function createKlingJwt(accessKey, secretKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = encodeBase64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeBase64Url({ iss: accessKey, exp: nowSeconds + 1800, nbf: nowSeconds - 5 });
  const signature = crypto.createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function hmac(key, value, encoding) { return crypto.createHmac('sha256', key).update(value).digest(encoding); }
function rfc3986(value) { return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`); }

function createVolcSignature({ accessKey, secretKey, url, method = 'POST', body = {}, now = new Date(), region = 'cn-north-1', service = 'cv' }) {
  const target = new URL(url);
  const dateTime = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = dateTime.slice(0, 8);
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const payloadHash = sha256(payload);
  const canonicalQuery = [...target.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join('&');
  const canonicalHeaders = `content-type:application/json\nhost:${target.host}\nx-content-sha256:${payloadHash}\nx-date:${dateTime}\n`;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequest = `${method}\n${target.pathname || '/'}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = `HMAC-SHA256\n${dateTime}\n${scope}\n${sha256(canonicalRequest)}`;
  const dateKey = hmac(Buffer.from(secretKey, 'utf8'), shortDate);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, 'request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  return {
    payload,
    headers: {
      'Content-Type': 'application/json',
      Host: target.host,
      'X-Date': dateTime,
      'X-Content-Sha256': payloadHash,
      Authorization: `HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function requestBuffer(urlValue, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const transport = url.protocol === 'https:' ? https : http;
    const body = options.body == null ? null : Buffer.from(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    const request = transport.request(url, {
      method: options.method || 'GET',
      timeout: options.timeoutMs || 30000,
      headers: { ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}), ...(options.headers || {}) },
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 5) {
        response.resume();
        const target = new URL(response.headers.location, url);
        if (target.origin !== url.origin) { reject(new Error('拒绝向不同来源重定向 API 凭据')); return; }
        resolve(requestBuffer(new URL(response.headers.location, url).toString(), options, redirects + 1));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > (options.maxBytes || 1024 * 1024)) request.destroy(new Error('提供商响应超过安全大小限制'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on('timeout', () => request.destroy(new Error('视频提供商请求超时')));
    request.on('error', reject);
    if (body) request.end(body); else request.end();
  });
}

async function requestJson(url, options = {}) {
  const response = await requestBuffer(url, options);
  const raw = response.body.toString('utf8');
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`提供商返回了无效 JSON（HTTP ${response.statusCode}）`); }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const detail = data.base_resp?.status_msg || data.error?.message || data.message || data.error || `HTTP ${response.statusCode}`;
    throw new Error(`视频提供商请求失败（HTTP ${response.statusCode}）：${detail}`);
  }
  return data;
}

function inferVideoProviderId(baseUrl, hint = '') {
  let host = '';
  try { host = new URL(baseUrl).hostname.toLowerCase(); } catch {}
  const belongsTo = (domain) => host === domain || host.endsWith(`.${domain}`);
  if (belongsTo('minimax.io') || belongsTo('minimaxi.com')) return 'minimax';
  if (belongsTo('klingai.com')) return 'kling';
  if (host === 'visual.volcengineapi.com') return 'jimeng';
  if (host.startsWith('ark.') && belongsTo('volces.com')) return 'doubao';
  return REMOTE_PROVIDER_IDS.includes(hint) ? hint : '';
}

function appendEndpoint(baseUrl, suffix) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function modelListCandidates(providerId, baseUrl) {
  const url = new URL(baseUrl);
  const pathName = url.pathname.replace(/\/$/, '');
  const candidates = [];
  const add = (value) => { if (!candidates.includes(value)) candidates.push(value); };
  if (/\/api\/v3$/i.test(pathName)) add(appendEndpoint(baseUrl, '/models'));
  else if (/\/v1$/i.test(pathName)) add(appendEndpoint(baseUrl, '/models'));
  else {
    if (providerId === 'doubao') add(appendEndpoint(baseUrl, '/api/v3/models'));
    add(appendEndpoint(baseUrl, '/v1/models'));
  }
  return candidates;
}

function extractModelIds(data) {
  const values = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data?.items) ? data.items : [];
  return [...new Set(values.map((item) => cleanString(typeof item === 'string' ? item : item?.id || item?.model || item?.name, 180)).filter(Boolean))];
}

async function discoverProviderModels(config, options = {}) {
  const providerId = inferVideoProviderId(config.baseUrl, options.providerHint || config.providerId);
  if (!providerId) throw new Error('无法从 API 地址识别视频服务，请先选择厂商类型');
  const normalized = sanitizeProviderConfig(providerId, { ...config, providerId }, options.previous || {});
  const adapter = createCloudAdapter(providerId, normalized);
  adapter.validateConfiguration();
  const headers = providerId === 'minimax' || providerId === 'doubao'
    ? { Authorization: `Bearer ${normalized.apiKey}` }
    : providerId === 'kling'
      ? { Authorization: `Bearer ${createKlingJwt(normalized.accessKey, normalized.secretKey)}` }
      : {};
  let lastError = null;
  for (const endpoint of modelListCandidates(providerId, normalized.baseUrl)) {
    try {
      const data = await requestJson(endpoint, { headers, timeoutMs: options.timeoutMs || 12000 });
      const ids = extractModelIds(data);
      if (!ids.length) throw new Error('模型接口已连接，但没有返回任何模型 ID');
      return {
        ok: true,
        providerId,
        label: providerPreset(providerId).label,
        baseUrl: normalized.baseUrl,
        source: endpoint,
        enumerated: true,
        models: ids.map((id) => modelDescriptor(providerId, id, {
          available: null, source: 'provider-api', verified: true,
          capabilitiesVerified: false,
        })),
        message: `已读取 ${providerPreset(providerId).label} 的 ${ids.length} 个模型 ID；生成权限和画质尚未实测，未创建生成任务`,
      };
    } catch (error) {
      lastError = error;
      if (!/HTTP 404|HTTP 405/.test(error.message)) break;
    }
  }
  if (/HTTP 404|HTTP 405/.test(lastError?.message || '')) {
    return {
      ok: true,
      providerId,
      label: providerPreset(providerId).label,
      baseUrl: normalized.baseUrl,
      source: 'maintained-catalog',
      enumerated: false,
      models: catalogModels(providerId),
      message: `${providerPreset(providerId).label} 的模型枚举接口不可用；以下为本机参考清单，连接、权限与能力均未验证`,
    };
  }
  throw new Error(`已识别 ${providerPreset(providerId).label}，但无法读取可调用模型：${lastError?.message || '模型接口不可用'}`);
}

function dataImage(value) {
  if (!value) return '';
  const match = /^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(value));
  if (!match) throw new Error('云端参考图必须是 PNG、JPEG 或 WebP');
  return String(value);
}

function bareImage(value) {
  const image = dataImage(value);
  return image ? image.slice(image.indexOf(',') + 1) : '';
}

function mapStatus(value) {
  const status = cleanString(value, 80).toLowerCase();
  if (['success', 'succeed', 'succeeded', 'completed', 'done'].includes(status)) return 'completed';
  if (['fail', 'failed', 'error', 'cancelled', 'canceled'].includes(status)) return status.startsWith('cancel') ? 'cancelled' : 'failed';
  if (['submitted', 'queued', 'pending', 'created'].includes(status)) return 'queued';
  return 'running';
}

class BaseCloudVideoAdapter {
  constructor(config) {
    this.config = config;
    this.preset = providerPreset(config.providerId);
    this.id = config.providerId;
    this.kind = 'cloud';
  }

  detectCapabilities() { return { ...capabilitiesForModel(this.id, this.config.model) }; }

  validateConfiguration() {
    const credentials = credentialState(this.id, this.config);
    if (!this.config.enabled) throw new Error(`${this.preset.label} 已停用`);
    if (!credentials.complete) throw new Error(`${this.preset.label} 凭据不完整`);
    if (!this.config.model) throw new Error(`${this.preset.label} 尚未填写模型 ID`);
    return { ok: true, providerId: this.id, message: '配置格式有效；未调用生成接口，不会产生费用', capabilities: this.detectCapabilities() };
  }

  validateSettings(settings) {
    this.validateConfiguration();
    const cap = this.detectCapabilities();
    if (!settings.firstImage && cap.textToVideo === false) throw new Error('所选模型需要首帧图片');
    if (!Number.isFinite(settings.duration)) throw new Error('视频时长无效');
    if (settings.firstImage && !cap.firstFrame) throw new Error(`${this.preset.label} 当前模型不支持首帧参考`);
    if (settings.lastImage && !cap.lastFrame) throw new Error(`${this.preset.label} 当前模型不支持尾帧参考`);
    if (settings.lastImage && !settings.firstImage) throw new Error('使用尾帧时必须同时提供首帧');
    const nativeResolution = cleanString(settings.nativeResolution, 32) || this.config.nativeResolution || cap.resolutions[0];
    if (!cap.resolutions.includes(nativeResolution)) {
      throw new Error(`${this.preset.label} 当前模型不支持 ${nativeResolution || '所选'} 原生画质；可选 ${cap.resolutions.join('、')}`);
    }
    if (settings.duration < cap.minDuration || settings.duration > cap.maxDuration || (cap.durations.length && !cap.durations.includes(settings.duration))) {
      throw new Error(`${this.preset.label} 当前仅支持 ${cap.durations.join('、')} 秒视频`);
    }
    if (this.id === 'minimax' && this.config.model === 'MiniMax-Hailuo-02' && nativeResolution === '1080P' && settings.duration !== 6) {
      throw new Error('MiniMax Hailuo 02 的 1080P 档仅支持 6 秒');
    }
    return { capabilities: cap, nativeResolution };
  }

  async cancelTask() {
    return { cancelled: false, message: '厂商未提供可靠的远程取消接口；已停止本地轮询，云端任务可能继续计费' };
  }

  async downloadResult(task, targetFile, options = {}) {
    if (!task?.resultUrl) throw new Error(`${this.preset.label}尚未返回视频下载地址`);
    return downloadVideo(task.resultUrl, targetFile, options);
  }
}

class MiniMaxAdapter extends BaseCloudVideoAdapter {
  headers() { return { Authorization: `Bearer ${this.config.apiKey}` }; }

  async createTask(settings) {
    const validated = this.validateSettings(settings);
    const payload = { model: this.config.model, prompt: settings.prompt, duration: settings.duration, resolution: validated.nativeResolution, prompt_optimizer: true };
    if (settings.firstImage) payload.first_frame_image = dataImage(settings.firstImage);
    const data = await requestJson(`${this.config.baseUrl}/v1/video_generation`, { method: 'POST', headers: this.headers(), body: payload });
    const taskId = data.task_id || data.data?.task_id;
    if (!taskId) throw new Error('MiniMax 未返回任务 ID');
    return { taskId: String(taskId), status: 'queued', rawStatus: data.status || 'submitted' };
  }

  async getTask(taskId) {
    const data = await requestJson(`${this.config.baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, { headers: this.headers() });
    const status = mapStatus(data.status || data.data?.status);
    const error = data.base_resp?.status_msg || data.error?.message || '';
    let resultUrl = data.download_url || data.data?.download_url || '';
    const fileId = data.file_id || data.data?.file_id;
    if (status === 'completed' && !resultUrl && fileId) {
      const file = await requestJson(`${this.config.baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`, { headers: this.headers() });
      resultUrl = file.file?.download_url || file.data?.download_url || file.download_url || '';
    }
    return { taskId, status, rawStatus: data.status || data.data?.status || '', progress: status === 'completed' ? 100 : undefined, resultUrl, error };
  }
}

class KlingAdapter extends BaseCloudVideoAdapter {
  headers() { return { Authorization: `Bearer ${createKlingJwt(this.config.accessKey, this.config.secretKey)}` }; }

  endpoint(settings) { return settings.firstImage ? '/v1/videos/image2video' : '/v1/videos/text2video'; }

  async createTask(settings) {
    const validated = this.validateSettings(settings);
    const payload = { model_name: this.config.model, prompt: settings.prompt, duration: String(settings.duration), mode: validated.nativeResolution === '1080P' ? 'pro' : 'std' };
    if (settings.firstImage) payload.image = bareImage(settings.firstImage);
    if (settings.lastImage) payload.tail_image = bareImage(settings.lastImage);
    const endpoint = this.endpoint(settings);
    const data = await requestJson(`${this.config.baseUrl}${endpoint}`, { method: 'POST', headers: this.headers(), body: payload });
    const taskId = data.data?.task_id || data.task_id;
    if (!taskId) throw new Error('可灵未返回任务 ID');
    return { taskId: String(taskId), status: 'queued', queryPath: `${endpoint}/${encodeURIComponent(taskId)}` };
  }

  async getTask(taskId, remote = {}) {
    const queryPath = remote.queryPath || `/v1/videos/text2video/${encodeURIComponent(taskId)}`;
    const data = await requestJson(`${this.config.baseUrl}${queryPath}`, { headers: this.headers() });
    const item = data.data || data;
    const status = mapStatus(item.task_status || item.status);
    const video = item.task_result?.videos?.[0] || item.videos?.[0] || {};
    return { taskId, status, rawStatus: item.task_status || item.status || '', progress: status === 'completed' ? 100 : undefined, resultUrl: video.url || video.video_url || '', error: item.task_status_msg || item.message || '' };
  }
}

class JimengAdapter extends BaseCloudVideoAdapter {
  async signedRequest(action, body) {
    const url = `${this.config.baseUrl}/?Action=${encodeURIComponent(action)}&Version=2022-08-31`;
    const signed = createVolcSignature({ accessKey: this.config.accessKey, secretKey: this.config.secretKey, url, body });
    return requestJson(url, { method: 'POST', headers: signed.headers, body: signed.payload });
  }

  async createTask(settings) {
    const validated = this.validateSettings(settings);
    const payload = { req_key: this.config.model, prompt: settings.prompt, duration: settings.duration, aspect_ratio: settings.ratio || '16:9', resolution: validated.nativeResolution };
    if (settings.firstImage) payload.image_urls = [dataImage(settings.firstImage)];
    if (settings.lastImage) payload.end_image_url = dataImage(settings.lastImage);
    const response = await this.signedRequest('CVSync2AsyncSubmitTask', payload);
    const taskId = response.data?.task_id || response.task_id;
    if (!taskId) throw new Error('即梦未返回任务 ID');
    return { taskId: String(taskId), status: 'queued' };
  }

  async getTask(taskId) {
    const response = await this.signedRequest('CVSync2AsyncGetResult', { req_key: this.config.model, task_id: taskId });
    const data = response.data || response;
    let result = data;
    if (typeof data.resp_data === 'string') {
      try { result = { ...data, ...JSON.parse(data.resp_data) }; } catch {}
    }
    const status = mapStatus(result.status || result.task_status);
    const resultUrl = result.video_url || result.video_urls?.[0] || result.output?.video_url || '';
    return { taskId, status, rawStatus: result.status || result.task_status || '', progress: Number(result.progress) || (status === 'completed' ? 100 : undefined), resultUrl, error: result.message || response.message || '' };
  }
}

class ArkVideoAdapter extends BaseCloudVideoAdapter {
  headers() { return { Authorization: `Bearer ${this.config.apiKey}` }; }

  async createTask(settings) {
    const validated = this.validateSettings(settings);
    const content = [{ type: 'text', text: settings.prompt }];
    if (settings.firstImage) content.push({ type: 'image_url', image_url: { url: dataImage(settings.firstImage) }, role: 'first_frame' });
    if (settings.lastImage) content.push({ type: 'image_url', image_url: { url: dataImage(settings.lastImage) }, role: 'last_frame' });
    const payload = { model: this.config.model, content, duration: settings.duration, ratio: settings.ratio || '16:9', resolution: validated.nativeResolution, generate_audio: Boolean(settings.generateAudio && validated.capabilities.nativeAudio) };
    const data = await requestJson(`${this.config.baseUrl}/api/v3/contents/generations/tasks`, { method: 'POST', headers: this.headers(), body: payload });
    const taskId = data.id || data.task_id || data.data?.id;
    if (!taskId) throw new Error(`${this.preset.label}未返回任务 ID`);
    return { taskId: String(taskId), status: 'queued' };
  }

  async getTask(taskId) {
    const data = await requestJson(`${this.config.baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`, { headers: this.headers() });
    const item = data.data || data;
    const status = mapStatus(item.status);
    const resultUrl = item.content?.video_url || item.content?.[0]?.video_url || item.video_url || item.output?.video_url || '';
    return { taskId, status, rawStatus: item.status || '', progress: Number(item.progress) || (status === 'completed' ? 100 : undefined), resultUrl, error: item.error?.message || item.message || '' };
  }
}

function createCloudAdapter(id, config) {
  if (id === 'minimax') return new MiniMaxAdapter(config);
  if (id === 'kling') return new KlingAdapter(config);
  if (id === 'jimeng') return new JimengAdapter(config);
  if (id === 'doubao') return new ArkVideoAdapter(config);
  throw new Error(`不支持的视频提供商：${id}`);
}

function createLocalAdapter(id, handlers = {}) {
  const preset = providerPreset(id);
  if (preset.kind !== 'local') throw new Error('只能为本地提供商创建本地适配器');
  return {
    id,
    kind: 'local',
    preset,
    detectCapabilities: () => ({ ...preset.capabilities }),
    validateConfiguration: () => ({ ok: true, providerId: id, capabilities: { ...preset.capabilities } }),
    createTask: (...args) => handlers.createTask(...args),
    getTask: (...args) => handlers.getTask(...args),
    cancelTask: (...args) => handlers.cancelTask(...args),
    downloadResult: (...args) => handlers.downloadResult(...args),
  };
}

class VideoProviderRegistry {
  constructor(configStore, localHandlers = {}) {
    this.configStore = configStore;
    this.localAdapters = Object.fromEntries(Object.entries(localHandlers).map(([id, handlers]) => [id, createLocalAdapter(id, handlers)]));
  }

  normalizeId(id) { return id === 'int8' ? 'local-h3-int8' : id === 'q2' ? 'local-h3-q2' : id; }

  get(id) {
    const normalized = this.normalizeId(id);
    if (this.localAdapters[normalized]) return this.localAdapters[normalized];
    if (REMOTE_PROVIDER_IDS.includes(normalized)) return createCloudAdapter(normalized, this.configStore.load().providers[normalized]);
    throw new Error(`不支持的视频提供商：${id}`);
  }

  list() { return this.configStore.publicState().providers; }
}

function streamDownload(urlValue, targetFile, options = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    if (!['http:', 'https:'].includes(url.protocol)) return reject(new Error('视频下载地址不安全'));
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(url, { timeout: options.timeoutMs || 4 * 60 * 60 * 1000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 5) {
        response.resume();
        resolve(streamDownload(new URL(response.headers.location, url).toString(), targetFile, options, redirects + 1));
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`下载生成视频失败（HTTP ${response.statusCode}）`));
        return;
      }
      const maxBytes = options.maxBytes || 2 * 1024 * 1024 * 1024;
      const declared = Number(response.headers['content-length'] || 0);
      if (declared > maxBytes) {
        response.destroy();
        reject(new Error('云端视频超过 2GB 安全大小限制'));
        return;
      }
      let received = 0;
      let settled = false;
      const output = fs.createWriteStream(targetFile, { mode: 0o600 });
      const fail = (error) => {
        if (settled) return;
        settled = true;
        output.destroy();
        try { fs.unlinkSync(targetFile); } catch {}
        reject(error);
      };
      response.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxBytes) response.destroy(new Error('云端视频超过 2GB 安全大小限制'));
      });
      response.on('error', fail);
      output.on('error', fail);
      output.on('finish', () => {
        if (settled) return;
        if (received < 1024) { fail(new Error('提供商返回的视频文件为空或不完整')); return; }
        settled = true;
        output.close(() => resolve(targetFile));
      });
      response.pipe(output);
    });
    request.on('timeout', () => request.destroy(new Error('云端视频下载超时')));
    request.on('error', reject);
  });
}

async function downloadVideo(urlValue, targetFile, options = {}) {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const temp = `${targetFile}.download`;
  try { fs.unlinkSync(temp); } catch {}
  await streamDownload(urlValue, temp, options);
  fs.renameSync(temp, targetFile);
  return targetFile;
}

class PendingVideoJobStore {
  constructor(file) { this.file = file; }
  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  save(jobs) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(jobs, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(temp, 0o600); } catch {}
    fs.renameSync(temp, this.file);
  }
  upsert(job) {
    const jobs = this.load().filter((item) => item.id !== job.id);
    jobs.unshift(job);
    this.save(jobs.slice(0, 20));
  }
  remove(id) { this.save(this.load().filter((item) => item.id !== id)); }
}

module.exports = {
  REMOTE_PROVIDER_IDS,
  PLATFORM_PROVIDER_IDS,
  PROVIDER_PRESETS,
  PROVIDER_MODEL_CATALOG,
  RESOLUTION_SPECS,
  VideoProviderConfigStore,
  PendingVideoJobStore,
  publicProviderConfig,
  sanitizeProviderConfig,
  credentialState,
  createKlingJwt,
  createVolcSignature,
  createCloudAdapter,
  createLocalAdapter,
  VideoProviderRegistry,
  inferVideoProviderId,
  discoverProviderModels,
  capabilitiesForModel,
  downloadVideo,
  mapStatus,
};
