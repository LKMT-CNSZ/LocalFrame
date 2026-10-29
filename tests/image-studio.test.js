'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { ImageLibrary } = require('../resources/h3-studio/app/image-library');
const { ImageStudio } = require('../resources/h3-studio/app/image-studio');
const localImage = require('../resources/h3-studio/app/local-image');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z8AARMAAAgMBApWl7QAAAABJRU5ErkJggg==', 'base64');

test('picture library preserves old LocalFrame images and stores new works with metadata', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-images-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const comfy = path.join(root, 'comfy'); fs.mkdirSync(comfy);
  const legacy = 'LocalFrame-Qwen-Image-2.1_00001_.png';
  fs.writeFileSync(path.join(comfy, legacy), png);
  const library = new ImageLibrary(root, comfy);
  assert.equal(library.list().length, 1);
  const saved = library.save(png, { engine: 'qwen-image-2.1', model: 'Q6_K', prompt: '海边日落', seed: 42, sourceName: legacy });
  assert.equal(saved.width, 1);
  assert.equal(saved.height, 1);
  const works = library.list();
  assert.equal(works.length, 1, 'copied local output should not appear twice');
  assert.equal(works[0].prompt, '海边日落');
  assert.equal(fs.readFileSync(library.file(saved.id)).toString('hex'), png.toString('hex'));
  assert.throws(() => library.file('../settings.json'), /路径无效/);
  library.delete(saved.id);
  assert.equal(library.list().length, 0, 'deleting an imported work removes its saved copy and ComfyUI original');
  assert.equal(fs.existsSync(library.file(saved.id)), false);
  assert.equal(fs.existsSync(path.join(comfy, legacy)), false);
  assert.throws(() => library.delete('../settings.json'), /路径无效/);
});

test('image job exposes actual sampling steps and saves the completed image', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-image-job-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const library = new ImageLibrary(root, path.join(root, 'empty-comfy'));
  let complete;
  const studio = new ImageStudio({
    localImage: { async generate(input, comfy, dir, onProgress) {
      onProgress({ phase: '正在采样', step: 7, total: 25 });
      await new Promise(resolve => { complete = resolve; });
      return { buffer: png, model: 'Q6_K', seed: 12 };
    } },
    imageApi: { generate: async () => { throw new Error('unused'); } }, comfy: {}, comfyDir: root, library,
  });
  const job = studio.start('qwen-image-2.1', { prompt: '清晨街道' });
  assert.equal(job.status, 'running');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(studio.status().step, 7);
  assert.equal(studio.status().total, 25);
  assert.throws(() => studio.start('local', { prompt: 'duplicate' }), /已有图片/);
  complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(studio.status().status, 'completed');
  assert.equal(library.list()[0].prompt, '清晨街道');
});

test('ComfyUI progress events expose real sampler steps before the image is saved', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-comfy-progress-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const checkpointDir = path.join(root, 'models', 'checkpoints'); fs.mkdirSync(checkpointDir, { recursive: true });
  const checkpoint = path.join(checkpointDir, 'fixture.safetensors');
  fs.writeFileSync(checkpoint, Buffer.alloc(1));
  fs.truncateSync(checkpoint, 101 * 1024 * 1024);
  const outputDir = path.join(root, 'output'); fs.mkdirSync(outputDir);
  fs.writeFileSync(path.join(outputDir, 'LocalFrame-image_00001_.png'), png);
  let socket;
  let sampled = false;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/queue') return response.end(JSON.stringify({ queue_running: [], queue_pending: [] }));
    if (request.url === '/prompt') {
      request.resume();
      response.end(JSON.stringify({ prompt_id: 'fixture-prompt' }));
      setTimeout(() => {
        const payload = Buffer.from(JSON.stringify({ type: 'progress', data: { prompt_id: 'fixture-prompt', value: 3, max: 5 } }));
        socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
        sampled = true;
      }, 50);
      return;
    }
    if (request.url === '/history/fixture-prompt') return response.end(JSON.stringify(sampled ? {
      'fixture-prompt': { outputs: { 7: { images: [{ filename: 'LocalFrame-image_00001_.png', subfolder: '' }] } } },
    } : {}));
    response.writeHead(404).end();
  });
  server.on('upgrade', (request, connection) => {
    socket = connection;
    const accept = crypto.createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    connection.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { socket?.destroy(); server.close(); });
  const updates = [];
  const result = await localImage.generate({ model: 'fixture.safetensors', prompt: 'forest', width: 512, height: 512, steps: 5 }, {
    isBusy: () => false, ensureServer: async () => {}, baseUrl: `http://127.0.0.1:${server.address().port}`, outputDir,
  }, root, progress => updates.push(progress));
  assert.equal(result.buffer.toString('hex'), png.toString('hex'));
  assert.ok(updates.some(progress => progress.step === 3 && progress.total === 5));
});
