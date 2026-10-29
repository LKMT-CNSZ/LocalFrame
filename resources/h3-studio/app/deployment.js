'use strict';

const INT8_DOWNLOAD_GB = 42;
const INT8_MIN_FREE_GB = 55;
const INT8_RECOMMENDED_FREE_GB = 65;

function rounded(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function buildCheck(id, label, state, detail, blocking = false) {
  return { id, label, state, detail, blocking: blocking && state === 'failed' };
}

function buildDeploymentAssessment(hardware = {}, components = [], options = {}) {
  const platform = options.platform || hardware.platform || process.platform;
  const arch = options.arch || process.arch;
  const gpu = (hardware.gpus || []).find((item) => item.vendor === 'nvidia') || null;
  const vram = rounded(gpu?.vramGb) || 0;
  const memory = rounded(hardware.memoryGb) || 0;
  const freeDisk = rounded(hardware.storage?.freeGb);
  const computeCapability = Number.parseFloat(gpu?.computeCapability);
  const readyComponents = components.filter((item) => item.required && item.ready).length;
  const requiredComponents = components.filter((item) => item.required).length;
  const alreadyReady = requiredComponents > 0 && readyComponents === requiredComponents;

  const checks = [
    buildCheck(
      'system', 'Windows 64 位系统',
      platform === 'win32' && arch === 'x64' ? 'passed' : 'failed',
      platform === 'win32' && arch === 'x64' ? '可使用自包含运行环境' : '当前一键部署仅支持 Windows 10/11 64 位', true,
    ),
    buildCheck(
      'gpu', 'NVIDIA 显卡', gpu && vram >= 5.5 ? 'passed' : 'failed',
      gpu ? `${gpu.name} · ${vram || '未知'} GB 显存` : '未检测到 NVIDIA 显卡；高质量 H3 需要 CUDA', true,
    ),
    buildCheck(
      'cuda', 'CUDA 计算能力', gpu && (!Number.isFinite(computeCapability) || computeCapability >= 7.5) ? 'passed' : 'failed',
      !gpu ? '等待检测显卡' : Number.isFinite(computeCapability) ? `Compute Capability ${computeCapability}` : `驱动 ${gpu.driver || '已识别'}，安装后会自动验证`, true,
    ),
    buildCheck(
      'memory', '系统内存', memory >= 24 ? 'passed' : memory >= 16 ? 'warning' : 'failed',
      memory ? `${memory} GB${memory < 24 ? '；建议 24 GB 以上' : ''}` : '未能读取内存容量', memory < 16,
    ),
    buildCheck(
      'disk', '模型盘空间', freeDisk == null ? 'warning' : freeDisk >= INT8_MIN_FREE_GB ? 'passed' : 'failed',
      freeDisk == null ? `无法读取剩余空间；部署前请确保至少 ${INT8_MIN_FREE_GB} GB` : `${hardware.storage?.drive || '模型盘'} 剩余 ${freeDisk} GB`, true,
    ),
    buildCheck(
      'storage', '磁盘速度', hardware.storage?.fast ? 'passed' : 'warning',
      hardware.storage?.fast ? '检测到 SSD / NVMe，可启用权重流送' : '建议选择 SSD / NVMe，机械硬盘会显著拖慢生成', false,
    ),
  ];

  const blockers = checks.filter((item) => item.blocking);
  const warnings = checks.filter((item) => item.state === 'warning');
  const compatible = blockers.length === 0;
  let summary = compatible ? '这台电脑可以一键部署 H3 高质量本地模型' : `发现 ${blockers.length} 项需要先处理`;
  if (alreadyReady) summary = 'H3 高质量本地环境已经完整就绪';

  return {
    compatible,
    alreadyReady,
    summary,
    checks,
    blockers: blockers.map((item) => item.detail),
    warnings: warnings.map((item) => item.detail),
    requirements: {
      downloadGb: INT8_DOWNLOAD_GB,
      minFreeGb: INT8_MIN_FREE_GB,
      recommendedFreeGb: INT8_RECOMMENDED_FREE_GB,
    },
    plan: {
      id: 'h3_int8',
      label: 'H3 高质量 INT8（自动推荐）',
      description: '自动安装 ComfyUI、独立 Python、CUDA 依赖、H3 INT8/NVFP4 模型、自定义节点和 FFmpeg。',
      gpu: gpu?.name || null,
      vramGb: vram,
    },
  };
}

function assertInstallAllowed(assessment) {
  if (assessment?.compatible || assessment?.alreadyReady) return;
  const detail = assessment?.blockers?.join('；') || '当前电脑不满足 H3 高质量环境要求';
  throw new Error(`暂时无法开始一键部署：${detail}`);
}

module.exports = {
  INT8_DOWNLOAD_GB,
  INT8_MIN_FREE_GB,
  INT8_RECOMMENDED_FREE_GB,
  buildDeploymentAssessment,
  assertInstallAllowed,
};
