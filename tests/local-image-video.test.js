'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { settings, workflow, editWorkflow } = require('../resources/h3-studio/app/local-image');
const { validate } = require('../resources/h3-studio/app/white-model-video');
const { WhiteModelVideo } = require('../resources/h3-studio/app/white-model-video');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const localImage = require('../resources/h3-studio/app/local-image');
const qwenImage = require('../resources/h3-studio/app/qwen-image');
const imageApi = require('../resources/h3-studio/app/image-api');

test('local image generation selects only an installed checkpoint and builds a local workflow', () => {
  const config = settings({ model: 'sdxl.safetensors', prompt: 'cinematic scene', width: 768, height: 1024, steps: 20, seed: 42 }, ['sdxl.safetensors']);
  const graph = workflow(config);
  assert.equal(graph['1'].inputs.ckpt_name, 'sdxl.safetensors');
  assert.equal(graph['5'].inputs.seed, 42);
  assert.deepEqual(graph['7'].inputs.images, ['6', 0]);
  assert.throws(() => settings({ ...config, model: '../other.safetensors' }, ['sdxl.safetensors']), /已安装/);
  assert.throws(() => settings({ ...config, width: 2048 }, ['sdxl.safetensors']), /尺寸/);
});

test('Qwen 2.1 selects its own GGUF loader and dual conditioning outputs', () => {
  const graph = qwenImage.graph({ variant: 'Q6_K', prompt: '海边日落', negative: '文字', width: 768, height: 768, steps: 25, seed: 12 });
  assert.equal(graph['1'].class_type, 'UnetLoaderGGUF');
  assert.equal(graph['1'].inputs.unet_name, 'qwen-image-2.1-Q6_K.gguf');
  assert.equal(graph['4'].class_type, 'TextEncodeQwenImage21');
  assert.deepEqual(graph['6'].inputs.positive, ['4', 0]);
  assert.deepEqual(graph['6'].inputs.negative, ['4', 1]);
  assert.equal(graph['6'].inputs.cfg, 1);
  assert.equal(graph['8'].class_type, 'SaveImage');
});

test('third-party image API accepts HTTPS or loopback and blocks unsafe URLs', () => {
  assert.equal(imageApi.endpoint('https://example.com/v1').pathname, '/v1/images/generations');
  assert.equal(imageApi.endpoint('http://127.0.0.1:3000').pathname, '/v1/images/generations');
  assert.throws(() => imageApi.endpoint('http://example.com'), /HTTPS/);
  assert.throws(() => imageApi.endpoint('https://key:secret@example.com/v1'), /凭据/);
});

test('third-party image API sends one confirmed request and accepts direct PNG only', async t => {
  let calls = 0;
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z8AARMAAAgMBApWl7QAAAABJRU5ErkJggg==';
  const server = http.createServer((req, res) => {
    calls++;
    assert.equal(req.url, '/v1/images/generations');
    assert.equal(req.headers.authorization, 'Bearer test-key');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ b64_json: png }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const input = { baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'test-model', apiKey: 'test-key', prompt: 'cat', width: 512, height: 512 };
  await assert.rejects(imageApi.generate(input), /确认/);
  const result = await imageApi.generate({ ...input, confirmed: true });
  assert.match(result.image, /^data:image\/png;base64,/);
  assert.equal(calls, 1);
});

test('white model video conditions every frame on the original and bounds visual changes', () => {
  const config = validate({ model: 'sdxl.safetensors', prompt: 'render clay material', strength: 0.35 }, ['sdxl.safetensors']);
  const graph = editWorkflow(config, 'source-frame.png', config.strength, 'localframe-test');
  assert.equal(graph['4'].class_type, 'LoadImage');
  assert.deepEqual(graph['5'].inputs.latent_image, ['8', 0]);
  assert.equal(graph['5'].inputs.denoise, 0.35);
  assert.throws(() => validate({ model: 'sdxl.safetensors', prompt: 'clay', strength: 0.9 }, ['sdxl.safetensors']), /强度/);
});

test('white model video extracts source frames and assembles a playable MP4', async t => {
  const bin = 'D:\\AI\\ComfyUI-H3\\tools\\ffmpeg\\bin';
  const ffmpeg = path.join(bin, 'ffmpeg.exe'), ffprobe = path.join(bin, 'ffprobe.exe');
  if (!fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe)) return t.skip('Local FFmpeg runtime unavailable');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-white-video-test-'));
  t.after(() => { if (root.startsWith(os.tmpdir())) fs.rmSync(root, { recursive: true, force: true }); });
  const source = path.join(root, 'source.mp4');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=8:duration=1', '-c:v', 'libx264', source]);
  const originalRequest = localImage.request, originalQueueImage = localImage.queueImage;
  localImage.request = async () => ({ queue_running: [], queue_pending: [] });
  localImage.queueImage = async graph => graph['4'].inputs.image;
  t.after(() => { localImage.request = originalRequest; localImage.queueImage = originalQueueImage; });
  const comfy = { isBusy: () => false, ensureServer: async () => {}, uploadImage: async file => file, baseUrl: 'http://127.0.0.1:8188' };
  const service = new WhiteModelVideo({ comfy, comfyDir: root, ffmpeg, ffprobe, outputDir: root });
  const job = { id: 'test', status: 'running', phase: '', frame: 0, total: 0 };
  await service.process(job, source, root, { model: 'mock.safetensors', prompt: 'clay', negative: '', width: 768, height: 768, steps: 4, seed: 1, strength: 0.35 });
  assert.equal(job.status, 'completed');
  assert.equal(job.frame, 8);
  const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', job.result], { encoding: 'utf8' }));
  assert.ok(Number(probe.format.duration) >= 0.9);
  assert.ok(probe.streams.some(stream => stream.codec_type === 'video'));
  const video = probe.streams.find(stream => stream.codec_type === 'video');
  assert.ok(video.width > video.height, 'output should preserve landscape orientation');
});
