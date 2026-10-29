'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEnhancement, ENHANCEMENT_MODES, ENHANCEMENT_PROFILES } = require('../resources/h3-studio/app/quality-enhancer');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { QualityEnhancer } = require('../resources/h3-studio/app/quality-enhancer');

const mediaTools = process.env.LOCALFRAME_TEST_FFMPEG_DIR || 'D:\\AI\\ComfyUI-H3\\tools\\ffmpeg\\bin';
test('enhancement preserves 30fps, every frame and optional source audio', {
  skip: !fs.existsSync(path.join(mediaTools, 'ffmpeg.exe')),
}, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-fps-test-'));
  try {
    const ffmpeg = path.join(mediaTools, 'ffmpeg.exe');
    const input = path.join(temp, 'source.mp4');
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=128x80:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '0.2', '-c:v', 'libx264', '-c:a', 'aac', input], { windowsHide: true });
    const enhancer = new QualityEnhancer({ ffmpeg, ffprobe: path.join(mediaTools, 'ffprobe.exe'), tempRoot: temp });
    for (const generateAudio of [true, false]) {
      const output = await enhancer.enhance(input, { upscale: true, outputWidth: 256, outputHeight: 160,
        generateAudio, enhancement: { mode: 'lanczos' } });
      const actual = await enhancer.probe(output);
      assert.equal(actual.fps, '30/1');
      assert.equal(actual.frames, 6);
      assert.equal(actual.audio, generateAudio);
      assert.equal(actual.duration, 0.2);
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('enhancement stays explicitly disabled unless an upscale target exists', () => {
  assert.deepEqual(normalizeEnhancement({ mode: 'flashvsr', profile: 'quality' }, false), { mode: 'none', profile: 'quality' });
  assert.deepEqual(normalizeEnhancement({ mode: 'flashvsr', profile: 'balanced' }, true), { mode: 'flashvsr', profile: 'balanced' });
});

test('enhancement input is bounded to supported backends and profiles', () => {
  assert.deepEqual(ENHANCEMENT_MODES, ['none', 'lanczos', 'realesrgan', 'flashvsr']);
  assert.deepEqual(ENHANCEMENT_PROFILES, ['fast', 'balanced', 'quality']);
  assert.deepEqual(normalizeEnhancement({ mode: 'unknown', profile: 'unsafe' }, true), { mode: 'none', profile: 'balanced' });
});
