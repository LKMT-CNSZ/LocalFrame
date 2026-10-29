'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyPack, ensureDirectories, saveRuntimeConfig } = require('../src/setup');

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'localframe-test-'));
}

test('verifies an intact offline pack', async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pack = path.join(root, 'model-pack');
  await fs.mkdir(path.join(pack, 'models'), { recursive: true });
  const bytes = Buffer.from('model-data');
  await fs.writeFile(path.join(pack, 'models', 'tiny.bin'), bytes);
  await fs.writeFile(path.join(pack, 'manifest.json'), JSON.stringify({
    files: [{ path: 'models/tiny.bin', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }]
  }));
  const result = await verifyPack(root);
  assert.equal(result.ready, true);
  assert.equal(result.files[0].state, 'ok');
});

test('reports missing or modified files', async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pack = path.join(root, 'model-pack');
  await fs.mkdir(pack, { recursive: true });
  await fs.writeFile(path.join(pack, 'manifest.json'), JSON.stringify({
    files: [{ path: 'models/missing.bin', bytes: 1, sha256: 'bad' }]
  }));
  const result = await verifyPack(root);
  assert.equal(result.ready, false);
  assert.equal(result.files[0].state, 'missing');
});

test('creates isolated data layout and runtime configuration', async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await ensureDirectories(root);
  const hardware = {
    selectedProfile: { id: 'cpu', backend: 'cpu' },
    selectedGpu: null
  };
  const config = await saveRuntimeConfig(root, hardware, 'D:\\bundle');
  assert.equal(config.offline, true);
  assert.equal(config.telemetry, false);
  const persisted = JSON.parse(await fs.readFile(path.join(root, 'config', 'runtime.json'), 'utf8'));
  assert.equal(persisted.profile.id, 'cpu');
});
