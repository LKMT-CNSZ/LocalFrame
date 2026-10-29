'use strict';

function requiredFreeVramMb(totalMb, engine = 'int8', presetId = '') {
  const total = Math.max(0, Number(totalMb) || 0);
  if (!total) return 0;
  if (engine === 'q2' || presetId === 'cpu_safe') return Math.min(2048, Math.max(1024, Math.round(total * 0.12)));
  const ratio = presetId === 'quality' ? 0.24 : presetId === 'ultra_low' ? 0.14 : 0.18;
  return Math.min(4096, Math.max(1536, Math.round(total * ratio)));
}

async function waitForVram(readGpu, options = {}) {
  const timeoutMs = Math.max(0, Number(options.timeoutMs) || 20000);
  const intervalMs = Math.max(0, Number(options.intervalMs) || 750);
  const stableSamples = Math.max(1, Number(options.stableSamples) || 2);
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const startedAt = Date.now();
  let stable = 0;
  let latest = null;
  while (Date.now() - startedAt <= timeoutMs) {
    latest = await readGpu();
    if (!latest || !Number.isFinite(Number(latest.memoryTotal)) || !Number.isFinite(Number(latest.memoryUsed))) {
      return { ok: true, available: false, freeMb: null, requiredMb: 0, waitedMs: Date.now() - startedAt };
    }
    const freeMb = Math.max(0, Number(latest.memoryTotal) - Number(latest.memoryUsed));
    const requiredMb = requiredFreeVramMb(latest.memoryTotal, options.engine, options.presetId);
    stable = freeMb >= requiredMb ? stable + 1 : 0;
    if (stable >= stableSamples) return { ok: true, available: true, freeMb, requiredMb, waitedMs: Date.now() - startedAt };
    if (Date.now() - startedAt >= timeoutMs) break;
    await sleep(intervalMs);
  }
  const freeMb = latest ? Math.max(0, Number(latest.memoryTotal) - Number(latest.memoryUsed)) : null;
  return {
    ok: false,
    available: Boolean(latest),
    freeMb,
    requiredMb: latest ? requiredFreeVramMb(latest.memoryTotal, options.engine, options.presetId) : 0,
    waitedMs: Date.now() - startedAt,
  };
}

module.exports = { requiredFreeVramMb, waitForVram };
