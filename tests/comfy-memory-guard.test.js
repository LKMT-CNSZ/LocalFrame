'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ComfyBackend, fitDimensions, buildShotRetryPlans, parseSamplingProgress, classifyComfyFailure, summarizeComfyError,
} = require('../resources/h3-studio/app/comfy-backend');

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

test('builds progressive recovery plans for 1344x768 eight-step long shots', () => {
  assert.deepEqual(fitDimensions(1344, 768, 750000), { width: 1120, height: 640 });
  assert.deepEqual(fitDimensions(1344, 768, 530000), { width: 960, height: 544 });
  assert.deepEqual(buildShotRetryPlans({ width: 1344, height: 768, steps: 8 }), [
    { width: 1344, height: 768, steps: 8, label: '原始规格' },
    { width: 1344, height: 768, steps: 8, label: '清理显存后同规格重试' },
    { width: 1120, height: 640, steps: 8, label: '稳定渲染后还原高清' },
    { width: 960, height: 544, steps: 8, label: '保底渲染后还原高清' },
  ]);
});

test('classifies host-buffer failures for stable I/O recovery', () => {
  const result = classifyComfyFailure(new Error('RuntimeError: hostbuf_file_reader_read failed'));
  assert.equal(result.code, 'host-buffer-io');
  assert.equal(result.safeIoMode, true);
  assert.equal(classifyComfyFailure(new Error('CUDA out of memory')).code, 'out-of-memory');
  assert.equal(classifyComfyFailure(new Error('采样进度在第 1/8 步超过 6 分钟未推进')).code, 'sampling-stall');
});

test('tracks sampling progress and detects a stalled GPU step', () => {
  assert.deepEqual(parseSamplingProgress(' 12%|#### | 1/8 [00:58<06:51]'), { percent: 12, step: 1, total: 8 });
  const backend = new ComfyBackend({});
  backend.observeProcessLog(' 12%|#### | 1/');
  backend.observeProcessLog('8 [00:58<06:51]\r');
  assert.equal(backend.samplingProgress.step, 1);
  assert.equal(backend.samplingIsStalled(1000, backend.samplingProgress.advancedAt + 999), false);
  assert.equal(backend.samplingIsStalled(1000, backend.samplingProgress.advancedAt + 1000), true);
});

test('selects the complete W4A8 component set on a 12GB NVIDIA GPU', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-w4a8-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = (name) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.alloc(2048));
    return target;
  };
  const customNodes = path.join(root, 'custom_nodes');
  fs.mkdirSync(path.join(customNodes, 'ComfyUI-ClipProj'), { recursive: true });
  fs.mkdirSync(path.join(customNodes, 'ComfyUI-Spectrum-MiniMax-H3'), { recursive: true });
  const workflows = {
    w4a8Text: path.resolve(__dirname, '../resources/h3-studio/app/workflows/05_h3lite_w4a8_t2v_compat.api.json'),
    w4a8Image: path.resolve(__dirname, '../resources/h3-studio/app/workflows/06_h3lite_w4a8_i2v_compat.api.json'),
  };
  const backend = new ComfyBackend({
    customNodes,
    preferences: { spectrumMode: 'balanced' },
    workflows,
    hardware: { gpus: [{ vendor: 'nvidia', vramGb: 11.9 }] },
    models: { w4a8: {
      diffusion: file('diffusion.safetensors'), encoder: file('encoder.safetensors'),
      projection: file('projection.safetensors'), lora: file('turbo.safetensors'),
      videoVae: file('video-vae.safetensors'), audioVae: file('audio-vae.safetensors'),
    } },
  });
  assert.equal(backend.shouldUseW4a8(), true);
  assert.deepEqual(backend.w4a8LaunchPolicy(), { launch: {
    dynamicVram: true, asyncOffload: 2, fastDisk: false, reserveVram: 0.75,
  } });
  const required = backend.components().filter((item) => item.required).map((item) => item.id);
  assert.ok(required.includes('w4a8Diffusion'));
  assert.ok(required.includes('clipproj'));
  assert.ok(!required.includes('diffusion'));
  const workflow = backend.buildWorkflow({
    prompt: '雨夜古寺，红灯笼在风中摇曳。', width: 640, height: 352,
    frames: 107, steps: 4, seed: 42, prefix: 'h3-studio/test',
  });
  assert.equal(workflow['1'].inputs.clip_name, 'encoder.safetensors');
  assert.equal(workflow['2'].inputs.unet_name, 'diffusion.safetensors');
  assert.equal(workflow['6'].inputs.width, 640);
  assert.equal(workflow['6'].inputs.length, 107);
  assert.equal(workflow['15'].inputs.filename_prefix, 'h3-studio/test');
  assert.equal(workflow['910'].class_type, 'SpectrumApplyMiniMaxH3');
  assert.deepEqual(workflow['910'].inputs.model, ['105:201', 0]);
  assert.deepEqual(workflow['7'].inputs.model, ['910', 0]);
  assert.deepEqual(workflow['9'].inputs.model, ['910', 0]);
  assert.deepEqual(backend.basicCustomNodeWhitelist(), ['ComfyUI-ClipProj', 'ComfyUI-Spectrum-MiniMax-H3']);
});

test('installs the bundled Spectrum node without overwriting an existing node', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-spectrum-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bundledNodes = path.join(root, 'bundled');
  const customNodes = path.join(root, 'custom_nodes');
  const source = path.join(bundledNodes, 'ComfyUI-Spectrum-MiniMax-H3');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, '__init__.py'), '# bundled');
  const backend = new ComfyBackend({ bundledNodes, customNodes });
  assert.deepEqual(backend.syncBundledCustomNodes().installed, ['ComfyUI-Spectrum-MiniMax-H3']);
  fs.writeFileSync(path.join(customNodes, 'ComfyUI-Spectrum-MiniMax-H3', '__init__.py'), '# user copy');
  assert.deepEqual(backend.syncBundledCustomNodes().existing, ['ComfyUI-Spectrum-MiniMax-H3']);
  assert.equal(fs.readFileSync(path.join(customNodes, 'ComfyUI-Spectrum-MiniMax-H3', '__init__.py'), 'utf8'), '# user copy');
});

test('summarizes ComfyUI execution errors without serializing tensor payloads', () => {
  const detail = summarizeComfyError({
    status_str: 'error',
    messages: [['execution_error', {
      exception_type: 'RuntimeError',
      exception_message: 'hostbuf_file_reader_read failed',
      traceback: ['first line', 'last line'],
      current_inputs: { giant_tensor: '0,'.repeat(10000) },
    }]],
  });
  assert.match(detail, /hostbuf_file_reader_read failed/);
  assert.match(detail, /last line/);
  assert.ok(detail.length < 4000);
  assert.doesNotMatch(detail, /giant_tensor/);
});

test('reports an owned busy process as alive without waiting for HTTP health', async () => {
  const backend = new ComfyBackend({ baseUrl: 'http://127.0.0.1:1' });
  backend.process = { exitCode: null, killed: false };
  backend.activePromptId = 'prompt-1';
  const started = Date.now();
  const state = await backend.connectionState({ jobRunning: true });
  assert.equal(state.alive, true);
  assert.equal(state.responsive, false);
  assert.equal(state.busy, true);
  assert.ok(Date.now() - started < 100);
});

test('frees idle ComfyUI models before handing VRAM to a local LLM', async (t) => {
  let freeBody;
  const server = http.createServer((request, response) => {
    const reply = (value) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (request.url === '/system_stats') return reply({ system: {} });
    if (request.url === '/queue') return reply({ queue_running: [], queue_pending: [] });
    if (request.url === '/free') {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => { freeBody = JSON.parse(Buffer.concat(chunks).toString('utf8')); reply({}); });
      return;
    }
    response.writeHead(404); response.end();
  });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const backend = new ComfyBackend({ baseUrl: `http://127.0.0.1:${port}` });
  const result = await backend.freeMemory();
  assert.equal(result.released, true);
  assert.deepEqual(freeBody, { unload_models: true, free_memory: true });
});

test('does not clear ComfyUI memory while a professional task is queued', async (t) => {
  let freeCalled = false;
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (request.url === '/system_stats') response.end(JSON.stringify({ system: {} }));
    else if (request.url === '/queue') response.end(JSON.stringify({ queue_running: [['prompt']], queue_pending: [] }));
    else { freeCalled = true; response.end('{}'); }
  });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const backend = new ComfyBackend({ baseUrl: `http://127.0.0.1:${port}` });
  await assert.rejects(() => backend.freeMemory(), /仍有任务运行或排队/);
  assert.equal(freeCalled, false);
});
