'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requiredFreeVramMb, waitForVram } = require('../resources/h3-studio/app/memory-guard');

test('calculates conservative free-VRAM gates for video engines', () => {
  assert.equal(requiredFreeVramMb(12288, 'int8', 'balanced'), 2212);
  assert.equal(requiredFreeVramMb(24576, 'int8', 'quality'), 4096);
  assert.equal(requiredFreeVramMb(8192, 'q2', 'q2_preview'), 1024);
  assert.equal(requiredFreeVramMb(0, 'int8', 'balanced'), 0);
});

test('waits for two stable free-VRAM samples before allowing video startup', async () => {
  const used = [11200, 9000, 8800];
  const result = await waitForVram(async () => ({ memoryTotal: 12288, memoryUsed: used.shift() ?? 8800 }), {
    engine: 'int8', presetId: 'balanced', timeoutMs: 100, intervalMs: 0, stableSamples: 2, sleep: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.freeMb, 3488);
  assert.equal(used.length, 0);
});

test('continues safely when NVIDIA counters are unavailable', async () => {
  const result = await waitForVram(async () => null, { timeoutMs: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.available, false);
});
