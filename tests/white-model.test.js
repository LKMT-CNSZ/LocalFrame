'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { endpoint, pngInfo, decodePng, makeRequest, renderWhiteModel } = require('../resources/h3-studio/app/white-model');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNg+M8AAAICAQB7CYV2AAAAAElFTkSuQmCC', 'base64');

test('white model AI endpoint requires secure remote transport', () => {
  assert.equal(endpoint('https://images.example.com').href, 'https://images.example.com/v1/images/edits');
  assert.equal(endpoint('http://127.0.0.1:8181/v1/images/edits').href, 'http://127.0.0.1:8181/v1/images/edits');
  assert.throws(() => endpoint('http://images.example.com'), /HTTPS/);
  assert.throws(() => endpoint('https://user:secret@images.example.com'), /不能含凭据/);
});

test('white model image edit request is bounded and requires cost consent', () => {
  assert.deepEqual(pngInfo(png), { width: 1, height: 1 });
  const input = { baseUrl: 'https://images.example.com/v1', model: 'edit-model', prompt: '浅色石材',
    apiKey: 'secret', confirmed: true, image: `data:image/png;base64,${png.toString('base64')}` };
  const request = makeRequest(input);
  assert.equal(request.headers.Authorization, 'Bearer secret');
  assert.match(request.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  assert.equal(request.body.includes(Buffer.from('浅色石材')), true);
  assert.throws(() => makeRequest({ ...input, confirmed: false }), /尚未确认/);
  assert.throws(() => decodePng('data:image/png;base64,ZmFrZQ=='), /有效的 PNG/);
});

test('white model AI render sends one image edit and accepts a direct PNG result', async (t) => {
  let calls = 0;
  const server = http.createServer((request, response) => {
    calls += 1;
    assert.equal(request.url, '/v1/images/edits');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'Bearer integration-secret');
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      assert.equal(body.includes(Buffer.from('white-model.png')), true);
      assert.equal(body.includes(Buffer.from('保留结构')), true);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const result = await renderWhiteModel({ baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'edit-model',
    prompt: '保留结构', apiKey: 'integration-secret', confirmed: true, image: `data:image/png;base64,${png.toString('base64')}` });
  assert.equal(calls, 1);
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.match(result.image, /^data:image\/png;base64,/);
});
