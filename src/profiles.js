'use strict';

const PROFILES = Object.freeze({
  nvidia_high: {
    id: 'nvidia_high', label: '高画质', backend: 'cuda', minVramGb: 16,
    precision: 'fp16', attention: 'flash-attn', width: 1280, height: 720,
    frames: 97, steps: 30, modelVariant: 'quality'
  },
  nvidia_balanced: {
    id: 'nvidia_balanced', label: '均衡', backend: 'cuda', minVramGb: 10,
    precision: 'fp16', attention: 'sdpa', width: 960, height: 544,
    frames: 81, steps: 24, modelVariant: 'balanced'
  },
  nvidia_low: {
    id: 'nvidia_low', label: '低显存', backend: 'cuda', minVramGb: 6,
    precision: 'int8', attention: 'sdpa-sliced', width: 768, height: 432,
    frames: 65, steps: 20, modelVariant: 'compact'
  },
  directml: {
    id: 'directml', label: '兼容模式', backend: 'directml', minVramGb: 4,
    precision: 'fp16', attention: 'sliced', width: 640, height: 360,
    frames: 49, steps: 18, modelVariant: 'compact'
  },
  cpu: {
    id: 'cpu', label: 'CPU 安全模式', backend: 'cpu', minVramGb: 0,
    precision: 'int8', attention: 'sliced', width: 512, height: 288,
    frames: 33, steps: 12, modelVariant: 'compact'
  }
});

function normalizeVendor(value = '') {
  const name = String(value).toLowerCase();
  if (name.includes('nvidia')) return 'nvidia';
  if (name.includes('amd') || name.includes('radeon')) return 'amd';
  if (name.includes('intel')) return 'intel';
  return 'unknown';
}

function chooseProfile(gpus = []) {
  const usable = gpus
    .filter((gpu) => !/microsoft basic|remote display/i.test(gpu.name || ''))
    .map((gpu) => ({ ...gpu, vendor: normalizeVendor(gpu.vendor || gpu.name), vramGb: Number(gpu.vramGb) || 0 }))
    .sort((a, b) => b.vramGb - a.vramGb);
  const bestNvidia = usable.find((gpu) => gpu.vendor === 'nvidia');
  if (bestNvidia?.vramGb >= 16) return { profile: PROFILES.nvidia_high, gpu: bestNvidia };
  if (bestNvidia?.vramGb >= 10) return { profile: PROFILES.nvidia_balanced, gpu: bestNvidia };
  if (bestNvidia?.vramGb >= 6) return { profile: PROFILES.nvidia_low, gpu: bestNvidia };
  const bestOther = usable.find((gpu) => ['amd', 'intel'].includes(gpu.vendor) && gpu.vramGb >= 4);
  if (bestOther) return { profile: PROFILES.directml, gpu: bestOther };
  return { profile: PROFILES.cpu, gpu: usable[0] || null };
}

module.exports = { PROFILES, normalizeVendor, chooseProfile };
