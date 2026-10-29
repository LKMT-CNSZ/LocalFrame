'use strict';

const views = [...document.querySelectorAll('.view')];
const $ = (selector) => document.querySelector(selector);
let inspection;

function show(id) {
  views.forEach((view) => view.classList.toggle('active', view.id === id));
}

function describeBackend(profile) {
  return ({ cuda: 'NVIDIA CUDA', directml: 'DirectML 兼容', cpu: 'CPU 安全' })[profile.backend] || profile.backend;
}

async function inspect() {
  $('#continueButton').disabled = true;
  $('#scanState').textContent = '检测中';
  $('#scanState').classList.add('pulse');
  try {
    inspection = await window.localFrame.inspect();
    const { hardware } = inspection;
    const gpu = hardware.selectedGpu;
    $('#scanTitle').textContent = gpu?.name || hardware.cpu;
    $('#scanDetail').textContent = gpu ? `${gpu.vramGb || '未知'} GB 显存 · ${hardware.cpuThreads} 线程处理器` : `${hardware.cpuThreads} 线程 · CPU 模式可用`;
    $('#scanState').textContent = '检测完成';
    $('#scanState').classList.remove('pulse');
    $('#continueButton').disabled = false;
    if (inspection.configured) {
      fillResult();
      show('readyView');
    }
  } catch (error) {
    $('#scanTitle').textContent = '未能读取硬件信息';
    $('#scanDetail').textContent = error.message;
    $('#scanState').textContent = '请重试';
    $('#scanState').classList.remove('pulse');
    setTimeout(inspect, 2500);
  }
}

function fillResult() {
  const { hardware, pack } = inspection;
  const { selectedProfile: profile, selectedGpu: gpu } = hardware;
  $('#gpuName').textContent = gpu?.name || hardware.cpu;
  $('#gpuMeta').textContent = gpu ? `${gpu.vramGb || '未知'} GB 显存 · 驱动 ${gpu.driver || '已安装'}` : `${hardware.cpuThreads} 线程处理器`;
  $('#profileName').textContent = `${profile.label} / ${describeBackend(profile)}`;
  $('#profileResolution').textContent = `${profile.width} × ${profile.height}`;
  $('#profilePrecision').textContent = profile.precision.toUpperCase();
  $('#memoryValue').textContent = `${hardware.memoryGb} GB`;
  $('#qualityPill').textContent = profile.label;
  $('#readyProfile').textContent = `${profile.label} · ${describeBackend(profile)}`;
  const developmentStub = pack.manifest?.developmentStub;
  if (!pack.ready || developmentStub) {
    $('#packNotice').classList.remove('hidden');
    $('#packNotice').textContent = developmentStub
      ? '当前是开发资源包：桌面端流程可体验，发布前需放入已量化模型与本地推理运行时。'
      : '当前安装不含完整模型资源，初始化时会提示使用完整版离线安装包。';
  }
}

$('#continueButton').addEventListener('click', () => { fillResult(); show('resultView'); });
$('[data-back]').addEventListener('click', () => show('scanView'));

const unsubscribe = window.localFrame.onSetupProgress(({ progress, label }) => {
  const percent = Math.round(progress * 100);
  $('#progressBar').style.width = `${percent}%`;
  $('#progressPercent').textContent = `${percent}%`;
  $('#installLabel').textContent = label;
});

async function setup() {
  show('installView');
  $('#installError').classList.add('hidden');
  $('#retryButton').classList.add('hidden');
  try {
    await window.localFrame.setup();
    $('#installTitle').textContent = '准备完成';
    $('#installLabel').textContent = '正在打开创作台…';
    setTimeout(() => show('readyView'), 650);
  } catch (error) {
    $('#installTitle').textContent = '还差一步';
    $('#installError').textContent = error.message;
    $('#installError').classList.remove('hidden');
    $('#retryButton').classList.remove('hidden');
  }
}

$('#installButton').addEventListener('click', setup);
$('#retryButton').addEventListener('click', setup);
$('#openOutputs').addEventListener('click', () => window.localFrame.openFolder('outputs'));
$('#generateButton').addEventListener('click', () => {
  $('#runtimeHint').textContent = '桌面外壳已就绪；接入正式模型运行时后，此处会显示实时生成进度与预览。';
  $('#runtimeHint').classList.remove('hidden');
});

window.addEventListener('beforeunload', unsubscribe);
inspect();
