'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  normalizeBaseUrl, resolveEndpoint, resolveModelsEndpoint, inferEndpointMode, inferProviderId,
  isSameDeviceProvider, publicConfig, sanitizeConfig, extractText, discoverProviderAt, chat, releaseLocalModel
} = require('../resources/h3-studio/app/provider');

test('normalizes API URLs and avoids duplicated endpoint paths', () => {
  assert.equal(normalizeBaseUrl('127.0.0.1:11434/v1/'), 'http://127.0.0.1:11434/v1');
  assert.equal(resolveEndpoint('https://api.example.com/v1', 'chat-completions'), 'https://api.example.com/v1/chat/completions');
  assert.equal(resolveEndpoint('https://api.example.com/v1/chat/completions', 'chat-completions'), 'https://api.example.com/v1/chat/completions');
  assert.equal(resolveEndpoint('http://127.0.0.1:11434', 'ollama'), 'http://127.0.0.1:11434/api/chat');
  assert.equal(resolveEndpoint('https://api.openai.com/v1', 'responses'), 'https://api.openai.com/v1/responses');
  assert.equal(resolveEndpoint('https://api.example.com/v1/responses', 'chat-completions'), 'https://api.example.com/v1/chat/completions');
  assert.equal(resolveEndpoint('http://127.0.0.1:11434/api/chat', 'chat-completions'), 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(resolveModelsEndpoint('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1/models');
  assert.equal(resolveModelsEndpoint('http://127.0.0.1:11434/api/chat', 'ollama'), 'http://127.0.0.1:11434/api/tags');
});

test('recognizes common local providers and automatic protocol mode', () => {
  assert.equal(inferProviderId('http://127.0.0.1:1919'), 'freetoken');
  assert.equal(inferProviderId('http://localhost:1234/v1'), 'lmstudio');
  assert.equal(inferEndpointMode('http://127.0.0.1:11434'), 'ollama');
  assert.equal(inferEndpointMode('https://api.example.com/v1/responses'), 'responses');
  assert.equal(resolveEndpoint('http://127.0.0.1:11434', 'auto'), 'http://127.0.0.1:11434/api/chat');
});

test('discovers models from FreeToken/OpenAI and Ollama model listings', async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    if (request.url === '/api/tags') response.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { model: 'gemma3:4b' }] }));
    else response.end(JSON.stringify({ data: [{ id: 'MiniMax-H3' }, { id: 'qwen-plus' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const freeToken = await discoverProviderAt({ id: 'freetoken', label: 'FreeToken', baseUrl: `http://127.0.0.1:${port}`, endpointMode: 'chat-completions' });
  assert.deepEqual(freeToken.models, ['MiniMax-H3', 'qwen-plus']);
  assert.equal(freeToken.model, 'MiniMax-H3');
  const ollama = await discoverProviderAt({ id: 'ollama', label: 'Ollama', baseUrl: `http://127.0.0.1:${port}`, endpointMode: 'ollama' });
  assert.deepEqual(ollama.models, ['qwen3:8b', 'gemma3:4b']);
});

test('identifies same-device providers and unloads an Ollama model', async (t) => {
  let payload;
  const server = http.createServer((request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/api/generate');
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ done: true }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const config = { enabled: true, providerId: 'ollama', baseUrl: `http://127.0.0.1:${port}`, model: 'qwen3:8b', endpointMode: 'ollama', authMode: 'none' };
  assert.equal(isSameDeviceProvider(config), true);
  assert.equal(isSameDeviceProvider({ ...config, baseUrl: 'http://192.168.1.20:11434' }), false);
  const result = await releaseLocalModel(config);
  assert.equal(result.released, true);
  assert.deepEqual(payload, { model: 'qwen3:8b', keep_alive: 0 });
});

test('sanitizes editable provider settings without losing a saved key', () => {
  const result = sanitizeConfig({
    baseUrl: 'https://api.example.com/v1', model: 'video-director', endpointMode: 'chat-completions', authMode: 'bearer', apiKey: ''
  }, { apiKey: 'saved-secret' });
  assert.equal(result.apiKey, 'saved-secret');
  assert.equal(result.enabled, true);
  assert.equal(publicConfig(result).hasApiKey, true);
  assert.equal(JSON.stringify(publicConfig(result)).includes('saved-secret'), false);
});

test('extracts text from chat completions, Responses API, and Ollama', () => {
  assert.equal(extractText({ choices: [{ message: { content: 'chat ok' } }] }, 'chat-completions'), 'chat ok');
  assert.equal(extractText({ output_text: 'response ok' }, 'responses'), 'response ok');
  assert.equal(extractText({ message: { content: 'ollama ok' } }, 'ollama'), 'ollama ok');
});

test('performs a real OpenAI-compatible request against a local server', async (t) => {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer test-key');
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(body.model, 'test-model');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: '连接成功' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const result = await chat({
    baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'test-model', endpointMode: 'chat-completions', authMode: 'bearer', apiKey: 'test-key'
  }, [{ role: 'user', content: 'test' }]);
  assert.equal(result.text, '连接成功');
});
