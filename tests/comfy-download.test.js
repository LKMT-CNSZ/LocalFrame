'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('ComfyUI downloader combines verified ranges after an existing prefix', async (t) => {
  if (process.platform !== 'win32') return t.skip('Windows deployment helper');
  const data = Buffer.alloc(1048589);
  for (let i = 0; i < data.length; i++) data[i] = i % 251;
  let requests = 0;
  const server = http.createServer((req, res) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    if (!match) { res.writeHead(400).end(); return; }
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), data.length - 1);
    requests++;
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
    res.end(data.subarray(start, end + 1));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-comfy-range-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dest = path.join(dir, 'portable.7z');
  fs.writeFileSync(dest, data.subarray(0, 100003));
  const helper = path.resolve(__dirname, '../resources/h3-studio/comfy-download.ps1');
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const script = `function Report([int]$p,[string]$m) {}; . ${quote(helper)}; if (-not (Invoke-ComfyParallelDownload ${quote(`http://127.0.0.1:${server.address().port}/archive`)} ${quote(dest)} ${data.length} 5)) { exit 2 }`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(requests >= 9);
  assert.deepEqual(fs.readFileSync(dest), data);
});
