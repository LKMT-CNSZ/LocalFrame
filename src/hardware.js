'use strict';

const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { chooseProfile, normalizeVendor } = require('./profiles');

const execFileAsync = promisify(execFile);

async function readNvidia() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'
    ], { windowsHide: true, timeout: 8000 });
    return stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
      const [name, memoryMb, driver] = line.split(',').map((part) => part.trim());
      return { name, vendor: 'nvidia', vramGb: Math.round((Number(memoryMb) / 1024) * 10) / 10, driver };
    });
  } catch {
    return [];
  }
}

async function readWindowsGpus() {
  if (process.platform !== 'win32') return [];
  const script = [
    '$ErrorActionPreference="SilentlyContinue"',
    'Get-CimInstance Win32_VideoController |',
    'Select-Object Name,AdapterRAM,DriverVersion |',
    'ConvertTo-Json -Compress'
  ].join(' ');
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024
    });
    const parsed = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).map((gpu) => ({
      name: gpu.Name || '未知显卡',
      vendor: normalizeVendor(gpu.Name),
      vramGb: gpu.AdapterRAM ? Math.round((Number(gpu.AdapterRAM) / 1073741824) * 10) / 10 : 0,
      driver: gpu.DriverVersion || ''
    }));
  } catch {
    return [];
  }
}

function mergeGpus(primary, fallback) {
  if (!primary.length) return fallback;
  const nvidiaNames = new Set(primary.map((gpu) => gpu.name.toLowerCase()));
  return [...primary, ...fallback.filter((gpu) => gpu.vendor !== 'nvidia' && !nvidiaNames.has(gpu.name.toLowerCase()))];
}

async function detectHardware() {
  const [nvidia, windowsGpus] = await Promise.all([readNvidia(), readWindowsGpus()]);
  const gpus = mergeGpus(nvidia, windowsGpus);
  const selected = chooseProfile(gpus);
  return {
    platform: process.platform,
    os: `${os.type()} ${os.release()}`,
    cpu: os.cpus()[0]?.model?.trim() || '未知处理器',
    cpuThreads: os.cpus().length,
    memoryGb: Math.round((os.totalmem() / 1073741824) * 10) / 10,
    freeDiskGb: null,
    gpus,
    selectedProfile: selected.profile,
    selectedGpu: selected.gpu,
    checkedAt: new Date().toISOString()
  };
}

module.exports = { detectHardware, readNvidia, readWindowsGpus, mergeGpus };
