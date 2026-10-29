'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readManifest(resourceRoot) {
  const manifestPath = path.join(resourceRoot, 'model-pack', 'manifest.json');
  try {
    return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`模型资源清单损坏：${error.message}`);
  }
}

async function verifyPack(resourceRoot, onProgress = () => {}) {
  const manifest = await readManifest(resourceRoot);
  if (!manifest) return { ready: false, reason: 'missing_manifest', files: [] };
  const results = [];
  const files = manifest.files || [];
  for (let index = 0; index < files.length; index += 1) {
    const entry = files[index];
    const filePath = path.resolve(resourceRoot, 'model-pack', entry.path);
    const packRoot = path.resolve(resourceRoot, 'model-pack');
    if (!filePath.startsWith(`${packRoot}${path.sep}`)) throw new Error(`非法资源路径：${entry.path}`);
    let state = 'ok';
    try {
      const stat = await fs.stat(filePath);
      if (entry.bytes && stat.size !== entry.bytes) state = 'size_mismatch';
      if (state === 'ok' && entry.sha256) {
        const actual = await sha256(filePath);
        if (actual.toLowerCase() !== entry.sha256.toLowerCase()) state = 'hash_mismatch';
      }
    } catch {
      state = 'missing';
    }
    results.push({ path: entry.path, state });
    onProgress({ stage: 'verify', progress: files.length ? (index + 1) / files.length : 1, detail: entry.path });
  }
  return { ready: results.every((item) => item.state === 'ok'), manifest, files: results };
}

async function ensureDirectories(dataRoot) {
  const directories = ['config', 'cache', 'outputs', 'logs', 'projects'];
  await Promise.all(directories.map((name) => fs.mkdir(path.join(dataRoot, name), { recursive: true })));
  return directories.map((name) => path.join(dataRoot, name));
}

async function saveRuntimeConfig(dataRoot, hardware, resourceRoot) {
  const config = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    profile: hardware.selectedProfile,
    device: hardware.selectedGpu,
    modelRoot: path.join(resourceRoot, 'model-pack', 'models'),
    outputRoot: path.join(dataRoot, 'outputs'),
    offline: true,
    telemetry: false
  };
  const target = path.join(dataRoot, 'config', 'runtime.json');
  await fs.writeFile(target, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

function runBootstrap(resourceRoot, dataRoot, profileId, onLine = () => {}) {
  const executable = path.join(resourceRoot, 'runtime', process.platform === 'win32' ? 'bootstrap.exe' : 'bootstrap');
  if (!fsSync.existsSync(executable)) return Promise.resolve({ skipped: true, reason: 'runtime_not_bundled' });
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--data-dir', dataRoot, '--profile', profileId, '--offline'], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (data) => onLine(data.toString()));
    child.stderr.on('data', (data) => onLine(data.toString()));
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve({ skipped: false }) : reject(new Error(`运行时初始化失败（${code}）`)));
  });
}

module.exports = { sha256, readManifest, verifyPack, ensureDirectories, saveRuntimeConfig, runBootstrap };
