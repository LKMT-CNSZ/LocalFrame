'use strict';

const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const PRESETS = Object.freeze({
  ultra_low: {
    id: 'ultra_low', label: '超低显存', badge: '6–8GB', engine: 'int8',
    description: '把 VAE 与不用的权重尽快移到内存，优先保证能运行。',
    tradeoff: '速度较慢，建议至少 32GB 内存与 SSD。',
    defaults: { width: 640, height: 384, duration: 3, steps: 6 },
    launch: { vramMode: 'novram', reserveVram: 2, cpuVae: true, disableSmartMemory: true, asyncOffload: 2, fastDisk: true },
    workflow: { sparsityRatio: 0.90, minSeqLen: 8192, denseLastSteps: 0, denseSteps: '', useInt8Qk: true, chunks: 6 },
    q2: { paramsBackend: 'disk', vaeTiling: true, temporalTiling: true, tileSize: '12x12' },
  },
  low_vram: {
    id: 'low_vram', label: '低显存均衡', badge: '8–12GB', engine: 'int8',
    description: '动态显存与异步卸载并用，画质、速度和稳定性更均衡。',
    tradeoff: '高分辨率会更多使用系统内存。',
    defaults: { width: 768, height: 448, duration: 5, steps: 6 },
    launch: { dynamicVram: true, reserveVram: 1.5, asyncOffload: 2, fastDisk: true },
    workflow: { sparsityRatio: 0.90, minSeqLen: 8192, denseLastSteps: 1, denseSteps: '0', useInt8Qk: false, chunks: 4 },
    q2: { paramsBackend: 'disk', vaeTiling: true, temporalTiling: true, tileSize: '16x16' },
  },
  balanced: {
    id: 'balanced', label: '智能均衡', badge: '推荐', engine: 'int8',
    description: '保留系统显存余量，使用 INT8/NVFP4、异步卸载和 SLA。',
    tradeoff: '适合大多数 12–16GB NVIDIA 显卡。',
    defaults: { width: 960, height: 544, duration: 5, steps: 6 },
    launch: { dynamicVram: true, reserveVram: 1.25, asyncOffload: 2 },
    workflow: { sparsityRatio: 0.85, minSeqLen: 12228, denseLastSteps: 1, denseSteps: '0', useInt8Qk: false, chunks: 4 },
    q2: { paramsBackend: 'disk', vaeTiling: true, temporalTiling: true, tileSize: '16x16' },
  },
  speed: {
    id: 'speed', label: '速度优先', badge: '最快', engine: 'int8',
    description: '更高 SLA 稀疏率、较少前馈分块，缩短等待时间。',
    tradeoff: '快速运动和细节可能不如均衡模式稳定。',
    defaults: { width: 768, height: 448, duration: 5, steps: 4 },
    launch: { dynamicVram: true, reserveVram: 1, asyncOffload: 2 },
    workflow: { sparsityRatio: 0.90, minSeqLen: 8192, denseLastSteps: 0, denseSteps: '', useInt8Qk: true, chunks: 2 },
    q2: { paramsBackend: 'disk', vaeTiling: true, temporalTiling: true, tileSize: '16x16' },
  },
  quality: {
    id: 'quality', label: '画质优先', badge: '16GB+', engine: 'int8',
    description: '降低稀疏率并保留首尾精确步骤，优先细节与参考图一致性。',
    tradeoff: '显存占用和生成时间最高。',
    defaults: { width: 1344, height: 768, duration: 5, steps: 8 },
    launch: { dynamicVram: true, reserveVram: 1, asyncOffload: 2 },
    workflow: { sparsityRatio: 0.85, minSeqLen: 12228, denseLastSteps: 2, denseSteps: '0', useInt8Qk: false, chunks: 2 },
    q2: { paramsBackend: 'disk', vaeTiling: false, temporalTiling: false, tileSize: '24x24' },
  },
  q2_preview: {
    id: 'q2_preview', label: 'Q2 极限预览', badge: '4–6GB', engine: 'q2',
    description: '2-bit 模型、磁盘权重和 VAE 分块，最低资源快速验证构图。',
    tradeoff: '画质明显下降，仅适合预览，不建议作为成片。',
    defaults: { width: 512, height: 320, duration: 3, steps: 4 },
    launch: { vramMode: 'novram', reserveVram: 2, cpuVae: true, disableSmartMemory: true },
    workflow: { sparsityRatio: 0.90, minSeqLen: 8192, denseLastSteps: 0, denseSteps: '', useInt8Qk: true, chunks: 6 },
    q2: { paramsBackend: 'disk', vaeTiling: true, temporalTiling: true, tileSize: '10x10' },
  },
  cpu_safe: {
    id: 'cpu_safe', label: 'CPU 安全模式', badge: '无独显', engine: 'q2',
    description: '全部计算放到 CPU，并从磁盘分段读取权重。',
    tradeoff: '非常慢，但不会要求 NVIDIA 显卡。',
    defaults: { width: 384, height: 256, duration: 2, steps: 3 },
    launch: { vramMode: 'cpu', cpuVae: true, disableSmartMemory: true },
    workflow: { sparsityRatio: 0, minSeqLen: 1000000, denseLastSteps: 0, denseSteps: '', useInt8Qk: false, chunks: 8 },
    q2: { backend: 'cpu', paramsBackend: 'disk', vaeTiling: true, temporalTiling: true, tileSize: '8x8', diffusionFA: false },
  },
});

const SPECTRUM_MODES = Object.freeze({
  off: { id: 'off', label: '关闭', description: '保持原生 Turbo 轨迹，画面最可预测。' },
  conservative: { id: 'conservative', label: '保守加速', description: '保留更多真实步骤，适合先尝试。', blendWeight: 0.35, warmupSteps: 2, tailActualSteps: 2, offlineReplay: true },
  balanced: { id: 'balanced', label: '均衡跳步', description: '约跳过部分 Transformer 计算，输出会与原生结果不同。', blendWeight: 0.50, warmupSteps: 1, tailActualSteps: 1, offlineReplay: true },
  max_speed: { id: 'max_speed', label: '最大跳步', description: '最激进，速度更快但构图、运动和细节变化最大。', blendWeight: 0.65, warmupSteps: 1, tailActualSteps: 1, offlineReplay: false },
});

function normalizeVendor(value = '') {
  const name = String(value).toLowerCase();
  if (name.includes('nvidia')) return 'nvidia';
  if (name.includes('amd') || name.includes('radeon')) return 'amd';
  if (name.includes('intel')) return 'intel';
  return 'unknown';
}

async function readNvidia() {
  const parse = (stdout, includesComputeCapability) => stdout.trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    const [name, total, free, used, utilization, temperature, driver, computeCapability] = line.split(',').map((part) => part.trim());
    return {
      index, name, vendor: 'nvidia', driver, computeCapability: includesComputeCapability ? computeCapability : '',
      vramGb: Math.round((Number(total) / 1024) * 10) / 10,
      vramFreeGb: Math.round((Number(free) / 1024) * 10) / 10,
      memoryUsedMb: Number(used) || 0,
      utilization: Number(utilization) || 0,
      temperature: Number(temperature) || 0,
    };
  });
  try {
    const { stdout } = await execFileAsync('nvidia-smi.exe', [
      '--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu,temperature.gpu,driver_version,compute_cap',
      '--format=csv,noheader,nounits',
    ], { windowsHide: true, timeout: 8000 });
    return parse(stdout, true);
  } catch {
    try {
      const { stdout } = await execFileAsync('nvidia-smi.exe', [
        '--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu,temperature.gpu,driver_version',
        '--format=csv,noheader,nounits',
      ], { windowsHide: true, timeout: 8000 });
      return parse(stdout, false);
    } catch { return []; }
  }
}

async function readWindowsDetails(storageRoot = 'D:\\AI') {
  if (process.platform !== 'win32') return {};
  const drive = /^[A-Za-z]:/.exec(storageRoot)?.[0] || 'C:';
  const script = [
    '$ErrorActionPreference="SilentlyContinue"',
    `$disk=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='${drive}'\"`,
    '$physical=Get-PhysicalDisk | Select-Object MediaType,BusType,SpindleSpeed',
    '$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed',
    '$gpus=Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion',
    '[pscustomobject]@{disk=$disk;physical=$physical;cpu=$cpu;gpus=$gpus}|ConvertTo-Json -Depth 5 -Compress',
  ].join(';');
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 12000, maxBuffer: 2 * 1024 * 1024,
    });
    return JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '{}');
  } catch { return {}; }
}

async function inspectHardware(storageRoot = 'D:\\AI') {
  const drive = /^[A-Za-z]:/.exec(storageRoot)?.[0] || 'C:';
  const [nvidia, windows] = await Promise.all([readNvidia(), readWindowsDetails(storageRoot)]);
  const fallbackGpus = (Array.isArray(windows.gpus) ? windows.gpus : windows.gpus ? [windows.gpus] : [])
    .filter((gpu) => !/microsoft basic|remote display/i.test(gpu.Name || ''))
    .map((gpu) => ({
      name: gpu.Name || '未知显卡', vendor: normalizeVendor(gpu.Name), driver: gpu.DriverVersion || '',
      vramGb: gpu.AdapterRAM ? Math.round((Number(gpu.AdapterRAM) / 1073741824) * 10) / 10 : 0,
    }));
  const nonNvidia = fallbackGpus.filter((gpu) => gpu.vendor !== 'nvidia');
  const gpus = [...nvidia, ...nonNvidia].sort((a, b) => (b.vramGb || 0) - (a.vramGb || 0));
  const physical = Array.isArray(windows.physical) ? windows.physical : windows.physical ? [windows.physical] : [];
  const fastDisk = physical.some((disk) => /ssd/i.test(disk.MediaType || '') || /nvme/i.test(disk.BusType || '') || Number(disk.SpindleSpeed) === 0);
  const cpu = windows.cpu || {};
  return {
    platform: process.platform,
    os: `${os.type()} ${os.release()}`,
    cpu: cpu.Name || os.cpus()[0]?.model?.trim() || '未知处理器',
    cpuCores: Number(cpu.NumberOfCores) || Math.max(1, Math.ceil(os.cpus().length / 2)),
    cpuThreads: Number(cpu.NumberOfLogicalProcessors) || os.cpus().length,
    cpuMaxMhz: Number(cpu.MaxClockSpeed) || 0,
    memoryGb: Math.round((os.totalmem() / 1073741824) * 10) / 10,
    freeMemoryGb: Math.round((os.freemem() / 1073741824) * 10) / 10,
    storage: {
      drive,
      freeGb: windows.disk?.FreeSpace ? Math.round((Number(windows.disk.FreeSpace) / 1073741824) * 10) / 10 : null,
      sizeGb: windows.disk?.Size ? Math.round((Number(windows.disk.Size) / 1073741824) * 10) / 10 : null,
      fast: fastDisk,
      media: physical.map((disk) => `${disk.BusType || ''} ${disk.MediaType || ''}`.trim()).filter(Boolean),
    },
    gpus,
    selectedGpu: gpus[0] || null,
    checkedAt: new Date().toISOString(),
  };
}

function recommendPreset(hardware) {
  const gpu = (hardware?.gpus || []).find((item) => item.vendor === 'nvidia');
  const vram = Number(gpu?.vramGb) || 0;
  const ram = Number(hardware?.memoryGb) || 0;
  let id = 'cpu_safe';
  const reasons = [];
  const warnings = [];
  if (gpu && vram >= 19.5 && ram >= 47) id = 'quality';
  else if (gpu && vram >= 11.5 && ram >= 31) id = 'balanced';
  else if (gpu && vram >= 7.5 && ram >= 23) id = 'low_vram';
  else if (gpu && vram >= 5.5 && ram >= 23) id = 'ultra_low';
  else if (gpu) id = 'q2_preview';
  if (gpu) reasons.push(`${gpu.name} · ${vram || '未知'}GB 显存`);
  else reasons.push('未检测到可用于当前 CUDA 模型的 NVIDIA 显卡');
  reasons.push(`${ram || '未知'}GB 内存 · ${hardware?.cpuCores || '?'} 核 / ${hardware?.cpuThreads || '?'} 线程`);
  if (hardware?.storage?.fast) reasons.push('检测到 SSD/NVMe，可启用磁盘权重流送');
  else if (['ultra_low', 'q2_preview', 'cpu_safe'].includes(id)) warnings.push('未确认高速 SSD；磁盘卸载可能很慢');
  if (ram && ram < 24) warnings.push('系统内存偏小，请关闭其他大型软件并保持虚拟内存为系统管理');
  if (hardware?.storage?.freeGb != null && hardware.storage.freeGb < 55) warnings.push('模型盘剩余空间不足 55GB，完整 INT8 环境可能无法安装');
  if (id === 'cpu_safe') warnings.push('CPU 模式可运行但速度非常慢，仅作为兼容兜底');
  return { preset: PRESETS[id], reasons, warnings };
}

function resolvePreset(requestedId, hardware) {
  const recommended = recommendPreset(hardware);
  const preset = requestedId && requestedId !== 'auto' && PRESETS[requestedId] ? PRESETS[requestedId] : recommended.preset;
  return { requestedId: requestedId || 'auto', preset, recommended };
}

function buildComfyLaunchArgs(preset, hardware, overrides = {}) {
  const launch = { ...(preset?.launch || {}), ...(overrides.launch || {}) };
  if (overrides.safeIoMode === true) {
    Object.assign(launch, {
      vramMode: 'lowvram',
      dynamicVram: false,
      disableDynamicVram: true,
      cpuVae: true,
      asyncOffload: null,
      disableAsyncOffload: true,
      fastDisk: false,
    });
  }
  const args = ['--listen', '127.0.0.1', '--port', '8188'];
  if (launch.vramMode === 'novram') args.push('--novram');
  else if (launch.vramMode === 'cpu') args.push('--cpu');
  else if (launch.vramMode === 'lowvram') args.push('--lowvram');
  else if (launch.dynamicVram) args.push('--enable-dynamic-vram');
  if (launch.disableDynamicVram) args.push('--disable-dynamic-vram');
  if (launch.reserveVram != null && launch.vramMode !== 'cpu') args.push('--reserve-vram', String(launch.reserveVram));
  if (launch.cpuVae) args.push('--cpu-vae');
  if (launch.disableSmartMemory) args.push('--disable-smart-memory');
  if (launch.disableAsyncOffload) args.push('--disable-async-offload');
  else if (launch.asyncOffload && launch.vramMode !== 'cpu') args.push('--async-offload', String(launch.asyncOffload));
  const useFastDisk = overrides.safeIoMode !== true
    && (overrides.fastDisk === true || (overrides.fastDisk !== false && launch.fastDisk && hardware?.storage?.fast));
  if (useFastDisk) args.push('--fast-disk');
  const customNodeWhitelist = Array.isArray(overrides.customNodeWhitelist)
    ? [...new Set(overrides.customNodeWhitelist.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];
  if (customNodeWhitelist.length) {
    args.push('--disable-all-custom-nodes', '--whitelist-custom-nodes', ...customNodeWhitelist);
  }
  args.push('--disable-auto-launch');
  return args;
}

function buildWorkflowOptimization(preset, preferences = {}, { firstRemote = false, steps = 6, spectrumAvailable = false } = {}) {
  const result = { ...(preset?.workflow || {}) };
  if (preferences.slaMode === 'dense') result.enabled = false;
  else if (preferences.slaMode === 'fast') Object.assign(result, { enabled: true, sparsityRatio: 0.90, minSeqLen: 8192, denseLastSteps: 0, denseSteps: '', useInt8Qk: true });
  else if (preferences.slaMode === 'quality') Object.assign(result, { enabled: true, sparsityRatio: 0.85, minSeqLen: 12228, denseLastSteps: Math.max(1, result.denseLastSteps || 0), denseSteps: '0', useInt8Qk: false });
  else result.enabled = result.enabled !== false;
  result.referenceProtection = firstRemote && preferences.slaMode !== 'fast' ? 'Light' : 'Off';
  const spectrumId = SPECTRUM_MODES[preferences.spectrumMode] ? preferences.spectrumMode : 'off';
  const spectrum = SPECTRUM_MODES[spectrumId];
  result.spectrum = spectrumAvailable && spectrumId !== 'off' && steps >= 4 ? spectrum : SPECTRUM_MODES.off;
  result.spectrumWarning = spectrumId !== 'off' && !spectrumAvailable
    ? 'Spectrum 节点尚未安装，已自动保持原生采样'
    : spectrumId !== 'off' && steps < 6
      ? '少步 Turbo 与 Spectrum 叠加会明显改变构图和运动'
      : '';
  return result;
}

function buildQ2Args(preset, hardware, settings) {
  const q2 = preset?.q2 || {};
  const gpu = (hardware?.gpus || []).find((item) => item.vendor === 'nvidia');
  const maxVram = gpu ? Math.max(2, Math.floor((Number(gpu.vramGb) || 4) - 2)) : 0;
  const backend = q2.backend || (gpu ? 'diffusion=cuda0,te=cpu,vae=cuda0' : 'cpu');
  const args = ['--backend', backend, '--params-backend', q2.paramsBackend || 'disk'];
  if (gpu && maxVram) args.push('--max-vram', `cuda0=${maxVram}`);
  if (q2.diffusionFA !== false && gpu) args.push('--diffusion-fa');
  args.push('--rng', 'cpu');
  if (q2.vaeTiling) args.push('--vae-tiling', '--vae-tile-size', q2.tileSize || '16x16', '--vae-tile-overlap', '0.5');
  if (q2.temporalTiling) args.push('--temporal-tiling');
  if (settings?.cpuThreads) args.push('--threads', String(settings.cpuThreads));
  return args;
}

function publicPresets() {
  return Object.values(PRESETS).map(({ launch, workflow, q2, ...item }) => item);
}

module.exports = {
  PRESETS, SPECTRUM_MODES, normalizeVendor, inspectHardware, recommendPreset, resolvePreset,
  buildComfyLaunchArgs, buildWorkflowOptimization, buildQ2Args, publicPresets,
};
