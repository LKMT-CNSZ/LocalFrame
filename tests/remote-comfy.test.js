'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RemoteComfyBackend, tunnelUrl, readChecks } = require('../resources/h3-studio/app/remote-comfy-backend');

test('remote endpoint accepts only a loopback tunnel port', () => {
  assert.equal(tunnelUrl(18189), 'http://127.0.0.1:18189');
  assert.throws(() => tunnelUrl('https://example.com'));
  assert.throws(() => tunnelUrl(80));
});

test('read-only connection checks limit concurrency and retry temporary failures', async () => {
  let active = 0, maximum = 0, attempts = 0;
  const results = await readChecks(['a', 'b', 'c', 'd'], async name => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (name === 'b' && attempts++ === 0) throw new Error('temporary');
    return name;
  }, 2);
  assert.deepEqual(results, ['a', 'b', 'c', 'd']);
  assert.equal(maximum, 2);
  assert.equal(attempts, 2);
});

test('landscape prompts do not acquire unsolicited human anatomy instructions', () => {
  const root = path.resolve(__dirname, '../resources/h3-studio/app/workflows');
  const backend = new RemoteComfyBackend({
    port: 18189, journalDir: os.tmpdir(),
    workflows: { text: path.join(root, '01_reference_4step_sla_lowvram.api.json') },
    models: { encoder: 'encoder', diffusion: 'diffusion', videoVae: 'video', audioVae: 'audio' },
  });
  const options = { prompt: 'A stream between green mountains', width: 1344, height: 768, frames: 73, steps: 8, seed: 2, prefix: 'test' };
  assert.doesNotMatch(backend.buildWorkflow(options)['1'].inputs.value, /五根|手指|人物/);
  assert.match(backend.buildWorkflow({ ...options, prompt: 'A person near a river' })['1'].inputs.value, /手指/);
});

test('remote task is journaled, downloaded, and reused without resubmitting', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-remote-test-'));
  const video = Buffer.alloc(2048, 7);
  let submissions = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/prompt') { submissions++; res.end(JSON.stringify({ prompt_id: 'test-id' })); }
    else if (req.url === '/history/test-id') res.end(JSON.stringify({ 'test-id': { status: { completed: true }, outputs: { '1': { videos: [{ filename: 'test.mp4', type: 'output', subfolder: 'shots' }] } } } }));
    else if (req.url.startsWith('/view?')) res.end(video);
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const backend = new RemoteComfyBackend({ port: server.address().port, journalDir: dir });
  const media = await backend.queueAndWait({}, null, null, { journalKey: 'same-shot' });
  const result = await backend.resolveComfyOutput(media, dir);
  assert.deepEqual(fs.readFileSync(result), video);
  await backend.queueAndWait({}, null, null, { journalKey: 'same-shot' });
  assert.equal(submissions, 1);
  await assert.rejects(() => backend.resolveComfyOutput({ filename: '../escape.mp4', type: 'output' }, dir));
});

test('ambiguous submission is never automatically sent a second time', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-remote-test-'));
  let submissions = 0;
  const server = http.createServer((req) => { submissions++; req.socket.destroy(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const backend = new RemoteComfyBackend({ port: server.address().port, journalDir: dir });
  await assert.rejects(() => backend.queueAndWait({}, null, null, { journalKey: 'unknown' }), /提交结果未知/);
  await assert.rejects(() => backend.queueAndWait({}, null, null, { journalKey: 'unknown' }), /上次提交结果未知/);
  assert.equal(submissions, 1);
});
