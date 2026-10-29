'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRESETS, recommendPreset, resolvePreset, buildComfyLaunchArgs, buildWorkflowOptimization, buildQ2Args,
} = require('../resources/h3-studio/app/optimizer');

function hardware(vramGb, memoryGb = 32, fast = true) {
  const gpu = vramGb ? { name: 'NVIDIA Test GPU', vendor: 'nvidia', vramGb } : null;
  return {
    gpus: gpu ? [gpu] : [], selectedGpu: gpu, memoryGb, cpuCores: 8, cpuThreads: 16,
    storage: { fast, freeGb: 100 },
  };
}

test('recommends profiles at low-compute hardware boundaries', () => {
  assert.equal(recommendPreset(hardware(24, 64)).preset.id, 'quality');
  assert.equal(recommendPreset(hardware(12, 32)).preset.id, 'balanced');
  assert.equal(recommendPreset(hardware(8, 24)).preset.id, 'low_vram');
  assert.equal(recommendPreset(hardware(6, 24)).preset.id, 'ultra_low');
  assert.equal(recommendPreset(hardware(4, 16)).preset.id, 'q2_preview');
  assert.equal(recommendPreset(hardware(0, 16)).preset.id, 'cpu_safe');
});

test('auto resolves to recommendation while manual choice is preserved', () => {
  assert.equal(resolvePreset('auto', hardware(12)).preset.id, 'balanced');
  assert.equal(resolvePreset('speed', hardware(12)).preset.id, 'speed');
});

test('Comfy launch flags represent ultra-low and balanced modes', () => {
  const ultra = buildComfyLaunchArgs(PRESETS.ultra_low, hardware(6));
  assert.ok(ultra.includes('--novram'));
  assert.ok(ultra.includes('--cpu-vae'));
  assert.ok(ultra.includes('--disable-smart-memory'));
  assert.ok(ultra.includes('--fast-disk'));
  const balanced = buildComfyLaunchArgs(PRESETS.balanced, hardware(12));
  assert.ok(balanced.includes('--enable-dynamic-vram'));
  assert.ok(balanced.includes('--async-offload'));
  assert.ok(!balanced.includes('--novram'));
  const minimal = buildComfyLaunchArgs(PRESETS.balanced, hardware(12), {
    customNodeWhitelist: ['ComfyUI-ClipProj', 'ComfyUI-Spectrum-MiniMax-H3', 'ComfyUI-ClipProj'],
  });
  assert.deepEqual(minimal.slice(-5), [
    '--disable-all-custom-nodes', '--whitelist-custom-nodes', 'ComfyUI-ClipProj', 'ComfyUI-Spectrum-MiniMax-H3', '--disable-auto-launch',
  ]);
  assert.ok(minimal.includes('--disable-all-custom-nodes'));
});

test('safe I/O recovery disables AIMDO disk streaming and async offload', () => {
  const args = buildComfyLaunchArgs(PRESETS.balanced, hardware(12), { safeIoMode: true, fastDisk: true });
  assert.ok(args.includes('--lowvram'));
  assert.ok(args.includes('--disable-dynamic-vram'));
  assert.ok(args.includes('--disable-async-offload'));
  assert.ok(args.includes('--cpu-vae'));
  assert.ok(!args.includes('--enable-dynamic-vram'));
  assert.ok(!args.includes('--async-offload'));
  assert.ok(!args.includes('--fast-disk'));
});

test('workflow choices change SLA and only enable installed Spectrum', () => {
  const fast = buildWorkflowOptimization(PRESETS.balanced, { slaMode: 'fast', spectrumMode: 'balanced' }, { steps: 6, spectrumAvailable: true });
  assert.equal(fast.sparsityRatio, 0.90);
  assert.equal(fast.denseLastSteps, 0);
  assert.equal(fast.spectrum.id, 'balanced');
  const unavailable = buildWorkflowOptimization(PRESETS.quality, { slaMode: 'dense', spectrumMode: 'max_speed' }, { steps: 8, spectrumAvailable: false });
  assert.equal(unavailable.enabled, false);
  assert.equal(unavailable.spectrum.id, 'off');
  assert.match(unavailable.spectrumWarning, /尚未安装/);
});

test('Q2 flags scale VRAM budget and tile decode on small GPUs', () => {
  const args = buildQ2Args(PRESETS.q2_preview, hardware(6), { cpuThreads: 8 });
  assert.deepEqual(args.slice(0, 4), ['--backend', 'diffusion=cuda0,te=cpu,vae=cuda0', '--params-backend', 'disk']);
  assert.ok(args.includes('cuda0=4'));
  assert.ok(args.includes('--vae-tiling'));
  assert.ok(args.includes('--temporal-tiling'));
});
