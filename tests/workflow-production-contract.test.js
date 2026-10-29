'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('full workflow defaults to short independent shots with optional carry continuity', () => {
  const root = path.join(__dirname, '..', 'resources', 'h3-studio', 'app');
  const store = fs.readFileSync(path.join(root, 'workflow-store.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'comfy-backend.js'), 'utf8');
  assert.match(store, /shotSeconds:[^\n]+\|\| 5/);
  assert.match(store, /continuity:[^\n]+'cut'/);
  assert.match(server, /automaticStoryboard\(prompt, duration, maxShotSeconds = 5, continuityMode = 'cut'\)/);
  assert.match(backend, /settings\.continuityMode === 'carry'/);
  assert.match(backend, /独立短分镜，各镜头单独采样后优先无损合片/);
});

test('silent workflow output removes audio while keeping video stream copy when no upscale is needed', () => {
  const backend = fs.readFileSync(path.join(__dirname, '..', 'resources', 'h3-studio', 'app', 'comfy-backend.js'), 'utf8');
  assert.match(backend, /settings\.generateAudio === false/);
  assert.match(backend, /'-map', '0:v:0', '-c:v', 'copy', '-an'/);
  assert.match(backend, /视频与音频流复制完成无损拼接/);
});

test('AI enhancement is deferred until H3 sampling and stitching are complete', () => {
  const root = path.join(__dirname, '..', 'resources', 'h3-studio', 'app');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'comfy-backend.js'), 'utf8');
  const enhancer = fs.readFileSync(path.join(root, 'quality-enhancer.js'), 'utf8');
  assert.match(backend, /deferAiUpscale/);
  assert.match(server, /releaseModelsForPostprocess/);
  assert.match(enhancer, /--tile_size', '256', '--tile_overlap', '64'/);
  assert.match(enhancer, /requestedScale > 2\.05 \? 4 : 2/);
  assert.match(enhancer, /PYTHONIOENCODING: 'utf-8'/);
  assert.match(enhancer, /Error during processing:/);
  assert.match(enhancer, /超分帧数校验失败/);
  assert.match(enhancer, /超分输出丢失了源音轨/);
});
