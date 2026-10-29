'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  VideoProviderConfigStore, PendingVideoJobStore, publicProviderConfig, PLATFORM_PROVIDER_IDS,
  VideoProviderRegistry, createKlingJwt, createVolcSignature, createCloudAdapter, discoverProviderModels,
  inferVideoProviderId, capabilitiesForModel, downloadVideo, mapStatus,
} = require('../resources/h3-studio/app/video-providers');

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

function json(res, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': body.length });
  res.end(body);
}

test('provider config is redacted publicly and preserves blank credential updates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-video-config-'));
  const store = new VideoProviderConfigStore(path.join(root, 'video-providers.json'));
  store.saveProvider('kling', { accessKey: 'ak-secret', secretKey: 'sk-secret', model: 'kling-test', select: true });
  store.saveProvider('kling', { accessKey: '', secretKey: '', model: 'kling-next' });
  const privateState = store.load();
  assert.equal(privateState.providers.kling.accessKey, 'ak-secret');
  assert.equal(privateState.providers.kling.secretKey, 'sk-secret');
  const publicState = store.publicState();
  const kling = publicState.providers.find((item) => item.id === 'kling');
  assert.equal(kling.configured, true);
  assert.equal(kling.model, 'kling-next');
  assert.equal(JSON.stringify(publicState).includes('ak-secret'), false);
  assert.equal(JSON.stringify(publicState).includes('sk-secret'), false);
});

test('Kling JWT is signed and contains no secret key', () => {
  const token = createKlingJwt('access-key', 'secret-key', 1000);
  const [header, payload, signature] = token.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'HS256');
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { iss: 'access-key', exp: 2800, nbf: 995 });
  assert.ok(signature.length > 20);
  assert.equal(token.includes('secret-key'), false);
});

test('model discovery rejects authentication failures instead of reporting catalog success', async (t) => {
  const fixture = await listen((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'invalid credentials' }));
  });
  t.after(() => fixture.server.close());
  await assert.rejects(discoverProviderModels({ providerId: 'kling', enabled: true, baseUrl: fixture.baseUrl, model: 'kling-v2-1', accessKey: 'a', secretKey: 's' }), /HTTP 401/);
});

test('Hailuo rejects unsupported quality-duration combinations before submitting', () => {
  const adapter = createCloudAdapter('minimax', { providerId: 'minimax', enabled: true, baseUrl: 'https://example.invalid', model: 'MiniMax-Hailuo-02', apiKey: 'key' });
  assert.throws(() => adapter.validateSettings({ duration: 10, nativeResolution: '1080P' }), /仅支持 6 秒/);
  assert.throws(() => adapter.validateSettings({ duration: NaN }), /时长无效/);
});

test('Volcengine visual signature is deterministic and does not disclose the secret', () => {
  const signed = createVolcSignature({
    accessKey: 'volc-ak', secretKey: 'volc-secret',
    url: 'https://visual.volcengineapi.com/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31',
    body: { req_key: 'jimeng_t2v_v30', prompt: '测试' }, now: new Date('2026-09-15T01:02:03.000Z'),
  });
  assert.equal(signed.headers['X-Date'], '20260915T010203Z');
  assert.match(signed.headers.Authorization, /^HMAC-SHA256 Credential=volc-ak\/20260915\/cn-north-1\/cv\/request,/);
  assert.equal(signed.headers.Authorization.includes('volc-secret'), false);
});

test('MiniMax adapter creates, queries, retrieves and downloads without real cloud calls', async (t) => {
  const seen = [];
  const video = Buffer.alloc(2048, 7);
  const fixture = await listen((req, res) => {
    seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    if (req.url === '/v1/video_generation') return json(res, { task_id: 'mini-1', status: 'submitted' });
    if (req.url.startsWith('/v1/query/video_generation')) return json(res, { task_id: 'mini-1', status: 'Success', file_id: 'file-1' });
    if (req.url.startsWith('/v1/files/retrieve')) return json(res, { file: { download_url: `${fixture.baseUrl}/result.mp4` } });
    if (req.url === '/result.mp4') { res.writeHead(200, { 'Content-Length': video.length, 'Content-Type': 'video/mp4' }); res.end(video); return; }
    res.writeHead(404); res.end();
  });
  t.after(() => fixture.server.close());
  const adapter = createCloudAdapter('minimax', { providerId: 'minimax', enabled: true, baseUrl: fixture.baseUrl, model: 'test-model', apiKey: 'mini-key' });
  const created = await adapter.createTask({ prompt: '测试', duration: 6, nativeResolution: '768P' });
  assert.equal(created.taskId, 'mini-1');
  const status = await adapter.getTask(created.taskId);
  assert.equal(status.status, 'completed');
  assert.equal(status.resultUrl, `${fixture.baseUrl}/result.mp4`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-video-download-'));
  const file = path.join(root, 'result.mp4');
  await downloadVideo(status.resultUrl, file);
  assert.deepEqual(fs.readFileSync(file), video);
  assert.ok(seen.every((item) => item.url === '/result.mp4' || item.authorization === 'Bearer mini-key'));
});

test('video service discovery identifies provider, enumerates callable models and keeps capability verification separate', async (t) => {
  const fixture = await listen((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer discovery-key');
    if (req.url === '/v1/models') return json(res, { data: [{ id: 'MiniMax-Hailuo-02' }, { id: 'custom-video-endpoint' }] });
    res.writeHead(404); res.end();
  });
  t.after(() => fixture.server.close());
  const result = await discoverProviderModels({ providerId: 'minimax', enabled: true, baseUrl: fixture.baseUrl, model: 'MiniMax-Hailuo-02', apiKey: 'discovery-key' }, { providerHint: 'minimax' });
  assert.equal(result.enumerated, true);
  assert.deepEqual(result.models.map((item) => item.id), ['MiniMax-Hailuo-02', 'custom-video-endpoint']);
  assert.equal(result.models[0].available, null);
  assert.equal(result.models[0].verified, true);
  assert.equal(result.models[0].capabilitiesVerified, false);
  assert.equal(result.models[1].capabilitiesVerified, false);
  assert.equal(inferVideoProviderId('https://ark.cn-beijing.volces.com', 'minimax'), 'doubao');
});

test('Kling and Ark adapters normalize vendor payloads and statuses', async (t) => {
  const requests = [];
  const fixture = await listen((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString('utf8'), authorization: req.headers.authorization });
      if (req.url === '/v1/videos/text2video') return json(res, { data: { task_id: 'k-1' } });
      if (req.url === '/v1/videos/text2video/k-1') return json(res, { data: { task_status: 'succeed', task_result: { videos: [{ url: 'https://example.invalid/k.mp4' }] } } });
      if (req.url === '/api/v3/contents/generations/tasks') return json(res, { id: 'ark-1' });
      if (req.url === '/api/v3/contents/generations/tasks/ark-1') return json(res, { status: 'succeeded', content: { video_url: 'https://example.invalid/ark.mp4' } });
      if (req.url.startsWith('/?Action=CVSync2AsyncSubmitTask')) return json(res, { data: { task_id: 'jimeng-1' } });
      if (req.url.startsWith('/?Action=CVSync2AsyncGetResult')) return json(res, { data: { status: 'done', resp_data: JSON.stringify({ video_url: 'https://example.invalid/jimeng.mp4' }) } });
      res.writeHead(404); res.end();
    });
  });
  t.after(() => fixture.server.close());
  const kling = createCloudAdapter('kling', { providerId: 'kling', enabled: true, baseUrl: fixture.baseUrl, model: 'kling-test', accessKey: 'ak', secretKey: 'sk' });
  const klingCreated = await kling.createTask({ prompt: 'hello', duration: 5, nativeResolution: '1080P' });
  assert.equal((await kling.getTask(klingCreated.taskId, klingCreated)).status, 'completed');
  const ark = createCloudAdapter('doubao', { providerId: 'doubao', enabled: true, baseUrl: fixture.baseUrl, model: 'endpoint-id', apiKey: 'ark-key' });
  const arkCreated = await ark.createTask({ prompt: 'hello', duration: 5, ratio: '9:16', nativeResolution: '1080P', generateAudio: true });
  assert.equal((await ark.getTask(arkCreated.taskId)).resultUrl, 'https://example.invalid/ark.mp4');
  assert.match(requests.find((item) => item.url === '/v1/videos/text2video').authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/);
  const arkBody = JSON.parse(requests.find((item) => item.url === '/api/v3/contents/generations/tasks').body);
  assert.equal(arkBody.generate_audio, true);
  assert.equal(arkBody.ratio, '9:16');
  assert.equal(arkBody.resolution, '1080P');
  const jimeng = createCloudAdapter('jimeng', { providerId: 'jimeng', enabled: true, baseUrl: fixture.baseUrl, model: 'jimeng_t2v_v30', accessKey: 'volc-ak', secretKey: 'volc-sk' });
  const jimengCreated = await jimeng.createTask({ prompt: 'hello', duration: 5, ratio: '16:9', nativeResolution: '720P' });
  assert.equal((await jimeng.getTask(jimengCreated.taskId)).resultUrl, 'https://example.invalid/jimeng.mp4');
  assert.match(requests.find((item) => item.url.startsWith('/?Action=CVSync2AsyncSubmitTask')).authorization, /^HMAC-SHA256 Credential=volc-ak\//);
});

test('capability validation blocks unsupported or potentially incorrect task shapes before HTTP', () => {
  const config = { providerId: 'minimax', enabled: true, baseUrl: 'https://example.invalid', model: 'm', apiKey: 'key' };
  const adapter = createCloudAdapter('minimax', config);
  assert.throws(() => adapter.validateSettings({ prompt: 'x', duration: 5, nativeResolution: '768P' }), /仅支持 6、10 秒/);
  assert.throws(() => adapter.validateSettings({ prompt: 'x', duration: 6, nativeResolution: '768P', lastImage: 'data:image/png;base64,AA==', firstImage: 'data:image/png;base64,AA==' }), /不支持尾帧/);
  assert.throws(() => adapter.validateSettings({ prompt: 'x', duration: 6, nativeResolution: '2K' }), /不支持 2K 原生画质/);
  assert.deepEqual(capabilitiesForModel('minimax', 'MiniMax-Hailuo-02').resolutions, ['768P', '1080P']);
  assert.equal(mapStatus('succeed'), 'completed');
  assert.equal(mapStatus('processing'), 'running');
});

test('pending cloud jobs survive store recreation for app restart recovery', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-pending-video-'));
  const file = path.join(root, 'pending.json');
  const store = new PendingVideoJobStore(file);
  store.upsert({ id: 'job-1', status: 'running', providerId: 'minimax', remoteTaskId: 'remote-1' });
  assert.equal(new PendingVideoJobStore(file).load()[0].remoteTaskId, 'remote-1');
  store.remove('job-1');
  assert.deepEqual(store.load(), []);
});

test('public local provider capabilities preserve H3 features', () => {
  const local = publicProviderConfig('local-h3-int8');
  assert.equal(local.configured, true);
  assert.equal(local.capabilities.nativeAudio, true);
  assert.equal(local.capabilities.maxDuration, 900);
});

test('platform handoff providers require no API credentials and expose safe website metadata', () => {
  assert.deepEqual(PLATFORM_PROVIDER_IDS, ['kling-platform', 'jimeng-platform']);
  const kling = publicProviderConfig('kling-platform');
  const jimeng = publicProviderConfig('jimeng-platform');
  assert.equal(kling.kind, 'platform');
  assert.equal(kling.configured, true);
  assert.match(kling.platformUrl, /^https:\/\/klingai\.kuaishou\.com\//);
  assert.equal(jimeng.configured, true);
  assert.equal(jimeng.credentials.complete, true);
});

test('local and cloud providers expose one lifecycle adapter interface', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-registry-'));
  const store = new VideoProviderConfigStore(path.join(root, 'providers.json'));
  store.saveProvider('minimax', { apiKey: 'key' });
  const registry = new VideoProviderRegistry(store, {
    'local-h3-int8': {
      createTask: () => ({ id: 'local-task' }), getTask: () => ({ status: 'running' }),
      cancelTask: () => ({ cancelled: true }), downloadResult: () => 'local.mp4',
    },
  });
  for (const adapter of [registry.get('int8'), registry.get('minimax')]) {
    for (const method of ['createTask', 'getTask', 'cancelTask', 'downloadResult', 'detectCapabilities']) assert.equal(typeof adapter[method], 'function');
  }
  assert.equal(registry.get('int8').createTask().id, 'local-task');
});
