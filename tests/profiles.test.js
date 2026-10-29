'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseProfile, normalizeVendor } = require('../src/profiles');

test('normalizes common GPU vendors', () => {
  assert.equal(normalizeVendor('NVIDIA GeForce RTX 4090'), 'nvidia');
  assert.equal(normalizeVendor('AMD Radeon RX 7900 XTX'), 'amd');
  assert.equal(normalizeVendor('Intel Arc A770'), 'intel');
});

test('selects quality profile for NVIDIA GPU with 16GB or more', () => {
  const result = chooseProfile([{ name: 'NVIDIA RTX 4090', vramGb: 24 }]);
  assert.equal(result.profile.id, 'nvidia_high');
});

test('selects balanced and low-memory CUDA profiles at boundaries', () => {
  assert.equal(chooseProfile([{ name: 'NVIDIA RTX 3080', vramGb: 10 }]).profile.id, 'nvidia_balanced');
  assert.equal(chooseProfile([{ name: 'NVIDIA RTX 2060', vramGb: 6 }]).profile.id, 'nvidia_low');
});

test('uses DirectML for supported AMD and Intel devices', () => {
  assert.equal(chooseProfile([{ name: 'AMD Radeon RX 7600', vramGb: 8 }]).profile.id, 'directml');
  assert.equal(chooseProfile([{ name: 'Intel Arc A580', vramGb: 8 }]).profile.id, 'directml');
});

test('falls back safely to CPU', () => {
  assert.equal(chooseProfile([]).profile.id, 'cpu');
  assert.equal(chooseProfile([{ name: 'Microsoft Basic Display Adapter', vramGb: 8 }]).profile.id, 'cpu');
});

test('prefers capable NVIDIA GPU in a multi-GPU machine', () => {
  const result = chooseProfile([
    { name: 'Intel UHD Graphics', vramGb: 1 },
    { name: 'NVIDIA RTX 4070 Ti', vramGb: 12 }
  ]);
  assert.equal(result.profile.id, 'nvidia_balanced');
  assert.match(result.gpu.name, /4070/);
});
