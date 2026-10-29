'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { VoiceEngine, VOICE_PROFILES, normalizeSpeechText, naturalInstruction } = require('../resources/h3-studio/app/voice-engine');

test('ships distinct local Chinese voice profiles', () => {
  assert.ok(VOICE_PROFILES.length >= 22);
  assert.ok(VOICE_PROFILES.some((item) => item.speaker === '中文女'));
  assert.ok(VOICE_PROFILES.some((item) => item.speaker === '中文男'));
  assert.equal(new Set(VOICE_PROFILES.map((item) => item.id)).size, VOICE_PROFILES.length);
  assert.equal(new Set(VOICE_PROFILES.map((item) => item.previewText)).size, VOICE_PROFILES.length);
  assert.ok(VOICE_PROFILES.every((item) => item.description && item.instruction && item.previewText));
  assert.ok(VOICE_PROFILES.every((item) => item.pauseScale >= 0.65 && item.pauseScale <= 1.5));
});

test('normalizes speech copy and adds natural delivery guidance', () => {
  assert.equal(normalizeSpeechText(' 你好，  世界！！\n下一句。 '), '你好，世界！下一句。');
  const instruction = naturalInstruction(VOICE_PROFILES[0]);
  assert.match(instruction, /自然口语/);
  assert.match(instruction, /机械腔/);
  assert.ok(instruction.length <= 500);
});

test('voice settings are bounded and saved atomically', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-voice-'));
  const engine = new VoiceEngine({ root: path.join(root, 'runtime'), resourceDir: root, dataDir: path.join(root, 'data'), installer: path.join(root, 'installer.ps1') });
  const saved = engine.saveSettings({ profileId: 'male_clear', nativeAudioVolume: -5, speechVolume: 99 });
  assert.equal(saved.profileId, 'male_clear');
  assert.equal(saved.nativeAudioVolume, 0);
  assert.equal(saved.speechVolume, 2);
  assert.equal(saved.speed, 0.99);
  assert.equal(saved.pauseScale, 0.98);
  assert.equal(saved.variation, 0.018);
  assert.deepEqual(engine.loadSettings(), saved);
  fs.rmSync(root, { recursive: true, force: true });
});

test('voice runtime readiness requires Python, model and source together', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-voice-ready-'));
  const engine = new VoiceEngine({ root, resourceDir: root, dataDir: path.join(root, 'data'), installer: path.join(root, 'installer.ps1') });
  assert.equal(engine.ready(), false);
  for (const file of [engine.pythonPath(), path.join(engine.modelPath(), 'cosyvoice.yaml'), path.join(engine.sourcePath(), 'cosyvoice', 'cli', 'cosyvoice.py')]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
  }
  assert.equal(engine.ready(), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('stores a user reference voice locally and exposes it as a selectable profile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-custom-voice-'));
  const engine = new VoiceEngine({ root, resourceDir: root, dataDir: path.join(root, 'data'), installer: path.join(root, 'installer.ps1') });
  const audioData = `data:audio/wav;base64,${Buffer.alloc(2048, 7).toString('base64')}`;
  const profile = engine.saveCustomVoice({ name: '小满', promptText: '这是我在参考音频里说出的原文。', audioData });
  assert.match(profile.id, /^custom_/);
  assert.equal(profile.custom, true);
  assert.equal(engine.findProfile(profile.id).promptText, '这是我在参考音频里说出的原文。');
  assert.equal(engine.sanitizeSettings({ profileId: profile.id }).profileId, profile.id);
  assert.ok(fs.existsSync(path.join(engine.customVoiceDir, profile.referenceFile)));
  fs.rmSync(root, { recursive: true, force: true });
});
