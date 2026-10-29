'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const httpTransport = require('http');
const httpsTransport = require('https');
const { ComfyBackend, existsOver } = require('./comfy-backend');
const promptApi = require('./provider');
const {
  PRESETS, SPECTRUM_MODES, inspectHardware, resolvePreset, buildQ2Args, publicPresets,
} = require('./optimizer');
const { waitForVram } = require('./memory-guard');
const { WorkflowStore } = require('./workflow-store');
const { VoiceEngine, VOICE_PROFILES } = require('./voice-engine');
const {
  visualOnlyPrompt, stripSpokenContent, screenplayHash, splitSubtitleText, buildScriptTimeline, sanitizeTimelineCues, timelineSubtitleCues,
  buildSubtitleCues, selectScriptCuesForShot,
  sanitizeCues, buildSrt, buildAss,
  subtitleOutputName, escapeSubtitleFilterPath,
} = require('./postproduction');
const {
  REMOTE_PROVIDER_IDS, PLATFORM_PROVIDER_IDS, PROVIDER_PRESETS, VideoProviderConfigStore, PendingVideoJobStore,
  VideoProviderRegistry, createCloudAdapter, sanitizeProviderConfig, discoverProviderModels, inferVideoProviderId,
} = require('./video-providers');
const { buildDeploymentAssessment, assertInstallAllowed } = require('./deployment');
const { QualityEnhancer, normalizeEnhancement } = require('./quality-enhancer');
const { renderWhiteModel } = require('./white-model');
const localImage = require('./local-image');
const qwenImage = require('./qwen-image');
const imageApi = require('./image-api');
const { ImageLibrary } = require('./image-library');
const { ImageStudio } = require('./image-studio');
const { WhiteModelVideo } = require('./white-model-video');
let whiteModelRendering = false;
let qwenDownload = { status: 'idle', variant: '', received: 0, total: 0, speed: 0, error: '' };

const HOST = '127.0.0.1';
const PORT = Number(process.env.H3_STUDIO_PORT || 7863);
const APP_DIR = __dirname;
const ROOT_DIR = process.env.H3_ROOT_DIR || path.resolve(APP_DIR, '..');
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const DATA_DIR = process.env.H3_DATA_DIR || path.join(APP_DIR, 'data');
const UPLOAD_DIR = process.env.H3_UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const SUBTITLE_DIR = path.join(DATA_DIR, 'subtitles');
const OUTPUT_DIR = process.env.H3_OUTPUT_DIR || path.join(ROOT_DIR, 'output');
const STORAGE_ROOT = process.env.H3_STORAGE_ROOT || 'D:\\AI';
const COMFY_INSTALL_ROOT = process.env.H3_COMFY_ROOT || path.join(STORAGE_ROOT, 'ComfyUI-H3');
const COMFY_PORTABLE = path.join(COMFY_INSTALL_ROOT, 'ComfyUI_windows_portable');
const COMFY_DIR = path.join(COMFY_PORTABLE, 'ComfyUI');
const COMFY_PYTHON = path.join(COMFY_PORTABLE, 'python_embeded', 'python.exe');
const COMFY_MAIN = path.join(COMFY_DIR, 'main.py');
const COMFY_MODELS = {
  diffusion: path.join(COMFY_DIR, 'models', 'diffusion_models', 'minimax_h3_fused_refdelta_r1024_turbo8_mystic07_int8_convrot.safetensors'),
  encoder: path.join(COMFY_DIR, 'models', 'text_encoders', 'qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors'),
  videoVae: path.join(COMFY_DIR, 'models', 'vae', 'minimax_h3_video_vae_int8_convrot.safetensors'),
  audioVae: path.join(COMFY_DIR, 'models', 'vae', 'minimax_h3_audio_vae_fp32.safetensors'),
  w4a8: {
    diffusion: path.join(COMFY_DIR, 'models', 'diffusion_models', 'minimax_h3_fl2va_pruned_w4a8_mixed.safetensors'),
    encoder: path.join(COMFY_DIR, 'models', 'text_encoders', 'qwen3vl_4b_fp8_scaled.safetensors'),
    projection: path.join(COMFY_DIR, 'models', 'clip_projections', 'mmh3-4b-ClipProj-celeb-mlp.safetensors'),
    lora: path.join(COMFY_DIR, 'models', 'loras', 'minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_resized_avg_rank_21_bf16.safetensors'),
    videoVae: path.join(COMFY_DIR, 'models', 'vae', 'minimax_h3_video_vae_fp16.safetensors'),
    audioVae: path.join(COMFY_DIR, 'models', 'vae', 'minimax_h3_audio_vae_fp32.safetensors'),
  },
};
const RUNTIME = path.join(ROOT_DIR, 'runtime', 'sd-cli.exe');
const MODELS = {
  diffusion: path.join(ROOT_DIR, 'models', 'minimax_h3_fl2va_pruned-Q2_K.gguf'),
  encoder: path.join(ROOT_DIR, 'models', 'qwen3vl_32b_minimax_h3-Q2_K_M.gguf'),
  videoVae: path.join(ROOT_DIR, 'models', 'minimax_h3_video_vae_fp16.safetensors'),
  audioVae: path.join(ROOT_DIR, 'models', 'minimax_h3_audio_vae_fp32.safetensors'),
};
const HISTORY_FILE = path.join(DATA_DIR, 'jobs.json');
const PID_FILE = path.join(DATA_DIR, 'server.pid');
const PROMPT_PROVIDER_FILE = path.join(DATA_DIR, 'prompt-provider.json');
const OPTIMIZATION_FILE = path.join(DATA_DIR, 'optimization.json');
const VIDEO_PROVIDER_FILE = path.join(DATA_DIR, 'video-providers.json');
const PENDING_VIDEO_JOBS_FILE = path.join(DATA_DIR, 'pending-video-jobs.json');
const PENDING_PLATFORM_JOBS_FILE = path.join(DATA_DIR, 'pending-platform-jobs.json');
const PLATFORM_HANDOFF_DIR = path.join(DATA_DIR, 'platform-handoff');
const PLATFORM_INBOX_DIR = path.join(DATA_DIR, 'platform-inbox');
const WORKFLOW_DIR = path.join(DATA_DIR, 'workflow-projects');
const INSTALLER = process.env.H3_INSTALLER || path.join(ROOT_DIR, 'install-h3-int8.ps1');
const VOICE_ROOT = process.env.LOCALFRAME_VOICE_ROOT || path.join(STORAGE_ROOT, 'LocalFrame-Voice');
const VOICE_INSTALLER = process.env.LOCALFRAME_VOICE_INSTALLER || path.resolve(APP_DIR, '..', 'install-cosyvoice.ps1');
const MAX_VIDEO_FRAMES = 719; // 29.96 seconds at 24 fps; H3 uses the 5 + 17n frame grid.
const MAX_INT8_DURATION = 900;
const MAX_STORYBOARD_SHOTS = 120;

for (const dir of [DATA_DIR, UPLOAD_DIR, SUBTITLE_DIR, OUTPUT_DIR, PLATFORM_HANDOFF_DIR, PLATFORM_INBOX_DIR]) fs.mkdirSync(dir, { recursive: true });
const workflowStore = new WorkflowStore(WORKFLOW_DIR);
const videoProviderStore = new VideoProviderConfigStore(VIDEO_PROVIDER_FILE);
const pendingVideoJobStore = new PendingVideoJobStore(PENDING_VIDEO_JOBS_FILE);
const pendingPlatformJobStore = new PendingVideoJobStore(PENDING_PLATFORM_JOBS_FILE);

if (!fs.existsSync(PROMPT_PROVIDER_FILE)) {
  fs.writeFileSync(PROMPT_PROVIDER_FILE, JSON.stringify({
    enabled: false,
    type: 'openai-compatible',
    providerId: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: '',
    endpointMode: 'auto',
    authMode: 'none',
    apiKey: ''
  }, null, 2), 'utf8');
}

let history = loadHistory();
let activeJob = null;
let installJob = null;
let optimizationPreferences = loadOptimizationPreferences();
let hardwareCache = null;
let resolvedOptimization = PRESETS.balanced;
let professionalStartPromise = null;
const professionalSession = { status: 'stopped', phase: '等待启动', error: null, logs: [] };

const comfy = new ComfyBackend({
  comfyDir: COMFY_DIR,
  python: COMFY_PYTHON,
  mainPy: COMFY_MAIN,
  customNodes: path.join(COMFY_DIR, 'custom_nodes'),
  outputDir: path.join(COMFY_DIR, 'output'),
  cacheDir: path.join(COMFY_INSTALL_ROOT, 'cache'),
  tempDir: path.join(COMFY_INSTALL_ROOT, 'temp'),
  ffmpeg: path.join(COMFY_INSTALL_ROOT, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe'),
  ffprobe: path.join(COMFY_INSTALL_ROOT, 'tools', 'ffmpeg', 'bin', 'ffprobe.exe'),
  models: COMFY_MODELS,
  workflows: {
    text: path.join(APP_DIR, 'workflows', '01_reference_4step_sla_lowvram.api.json'),
    image: path.join(APP_DIR, 'workflows', '04_i2v_fl2v_4step_sla_lowvram.api.json'),
    w4a8Text: path.join(APP_DIR, 'workflows', '05_h3lite_w4a8_t2v_compat.api.json'),
    w4a8Image: path.join(APP_DIR, 'workflows', '06_h3lite_w4a8_i2v_compat.api.json'),
  },
  bundledNodes: path.resolve(APP_DIR, '..', 'bundled-nodes'),
  hardware: hardwareCache,
  optimization: resolvedOptimization,
  preferences: optimizationPreferences,
});
const qualityEnhancer = new QualityEnhancer({
  ffmpeg: comfy.ffmpeg,
  ffprobe: comfy.ffprobe,
  tempRoot: path.join(COMFY_INSTALL_ROOT, 'temp'),
});
const whiteModelVideo = new WhiteModelVideo({ comfy, comfyDir: COMFY_DIR, ffmpeg: comfy.ffmpeg, ffprobe: comfy.ffprobe, outputDir: OUTPUT_DIR });
const imageLibrary = new ImageLibrary(OUTPUT_DIR, comfy.outputDir);
const imageStudio = new ImageStudio({ localImage, imageApi, comfy, comfyDir: COMFY_DIR, library: imageLibrary });
try {
  const bundledNodeSync = comfy.syncBundledCustomNodes();
  if (bundledNodeSync.installed.length) {
    console.log(`已补齐快速创作加速节点：${bundledNodeSync.installed.join('、')}`);
  }
} catch (error) {
  console.error(`快速创作加速节点自动补齐失败：${error.message}`);
}
const voice = new VoiceEngine({
  root: VOICE_ROOT,
  resourceDir: path.resolve(APP_DIR, '..', 'voice-studio'),
  dataDir: DATA_DIR,
  port: Number(process.env.LOCALFRAME_VOICE_PORT || 7865),
  installer: VOICE_INSTALLER,
});
const videoProviders = new VideoProviderRegistry(videoProviderStore, {
  'local-h3-int8': {
    createTask: (body, preparedJob) => startInt8Generation(body, preparedJob),
    getTask: () => publicJob(activeJob),
    cancelTask: () => comfy.cancel(),
    downloadResult: (task) => task?.outputPath || null,
  },
  'local-h3-q2': {
    createTask: (body, preparedJob) => startQ2Generation(body, preparedJob),
    getTask: () => publicJob(activeJob),
    cancelTask: () => { if (activeJob?.child) activeJob.child.kill('SIGTERM'); return { cancelled: true }; },
    downloadResult: (task) => task?.outputPath || null,
  },
});

const hardwarePromise = inspectHardware(STORAGE_ROOT).then((hardware) => {
  hardwareCache = hardware;
  resolvedOptimization = resolvePreset(optimizationPreferences.presetId, hardware).preset;
  comfy.setOptimization({ hardware, optimization: resolvedOptimization, preferences: optimizationPreferences });
  return hardware;
}).catch((error) => {
  console.error(`硬件检测失败：${error.message}`);
  hardwareCache = { gpus: [], memoryGb: 0, freeMemoryGb: 0, cpu: '检测失败', cpuCores: 0, cpuThreads: 0, storage: {} };
  resolvedOptimization = resolvePreset(optimizationPreferences.presetId, hardwareCache).preset;
  comfy.setOptimization({ hardware: hardwareCache, optimization: resolvedOptimization, preferences: optimizationPreferences });
  return hardwareCache;
});

function loadOptimizationPreferences() {
  try {
    const value = JSON.parse(fs.readFileSync(OPTIMIZATION_FILE, 'utf8'));
    return sanitizeOptimizationPreferences(value);
  } catch { return { presetId: 'auto', slaMode: 'auto', spectrumMode: 'off', fastDisk: null }; }
}

function sanitizeOptimizationPreferences(input = {}) {
  const presetId = input.presetId === 'auto' || PRESETS[input.presetId] ? input.presetId : 'auto';
  const slaMode = ['auto', 'fast', 'quality', 'dense'].includes(input.slaMode) ? input.slaMode : 'auto';
  const spectrumMode = SPECTRUM_MODES[input.spectrumMode] ? input.spectrumMode : 'off';
  const fastDisk = input.fastDisk === true ? true : input.fastDisk === false ? false : null;
  return { presetId, slaMode, spectrumMode, fastDisk };
}

function saveOptimizationPreferences(input) {
  const value = sanitizeOptimizationPreferences(input);
  const temp = `${OPTIMIZATION_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, OPTIMIZATION_FILE);
  optimizationPreferences = value;
  resolvedOptimization = resolvePreset(value.presetId, hardwareCache).preset;
  comfy.setOptimization({ hardware: hardwareCache, optimization: resolvedOptimization, preferences: value });
  return value;
}

async function optimizationState() {
  const hardware = hardwareCache || await hardwarePromise;
  const resolved = resolvePreset(optimizationPreferences.presetId, hardware);
  resolvedOptimization = resolved.preset;
  comfy.setOptimization({ hardware, optimization: resolvedOptimization, preferences: optimizationPreferences });
  return {
    preferences: optimizationPreferences,
    selected: { ...resolved.preset, launch: undefined, workflow: undefined, q2: undefined },
    recommended: { ...resolved.recommended.preset, launch: undefined, workflow: undefined, q2: undefined },
    reasons: resolved.recommended.reasons,
    warnings: resolved.recommended.warnings,
    presets: publicPresets(),
    spectrumModes: Object.values(SPECTRUM_MODES),
    spectrumAvailable: comfy.spectrumAvailable(),
    hardware,
  };
}

function loadHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.slice(0, 100) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  const temp = `${HISTORY_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(history.slice(0, 100), null, 2), 'utf8');
  fs.renameSync(temp, HISTORY_FILE);
}

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req, maxBytes = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('上传内容超过 40MB 限制'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('请求数据格式无效'));
      }
    });
    req.on('error', reject);
  });
}

function q2Ready() {
  return [RUNTIME, ...Object.values(MODELS)].every((file) => {
    try { return fs.statSync(file).size > 1024; } catch { return false; }
  });
}

function environmentStatus() {
  const components = comfy.components();
  const required = components.filter((item) => item.required);
  const readyCount = required.filter((item) => item.ready).length;
  const assessment = buildDeploymentAssessment(hardwareCache || {}, components);
  return {
    root: COMFY_INSTALL_ROOT,
    ready: comfy.ready(),
    running: Boolean(installJob && installJob.status === 'running'),
    progress: installJob?.progress || 0,
    phase: installJob?.phase || (readyCount === required.length ? '安装完成' : `已就绪 ${readyCount}/${required.length}`),
    logs: installJob?.logs?.slice(-120) || [],
    error: installJob?.error || null,
    components,
    assessment,
  };
}

async function startEnvironmentInstall(planId = 'h3_int8') {
  if (installJob?.status === 'running') return installJob;
  if (!['auto', 'h3_int8'].includes(planId)) throw new Error('不支持的本地部署方案');
  await hardwarePromise;
  const assessment = buildDeploymentAssessment(hardwareCache || {}, comfy.components());
  assertInstallAllowed(assessment);
  if (!existsOver(INSTALLER)) throw new Error('安装脚本缺失，请重新部署软件');
  installJob = { status: 'running', planId: 'h3_int8', progress: 1, phase: '准备安装', logs: [], startedAt: Date.now() };
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', INSTALLER, '-InstallRoot', COMFY_INSTALL_ROOT], {
    cwd: ROOT_DIR, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  installJob.child = child;
  const feed = (chunk) => {
    const text = cleanLog(chunk.toString('utf8'));
    for (const line of text.split('\n').filter(Boolean)) {
      installJob.logs.push(line);
      if (installJob.logs.length > 300) installJob.logs.shift();
      const progress = /^##progress\s+(\d+)\s+(.+)$/.exec(line);
      if (progress) { installJob.progress = Math.min(99, Number(progress[1])); installJob.phase = progress[2]; }
    }
  };
  child.stdout.on('data', feed);
  child.stderr.on('data', feed);
  child.on('error', (error) => { installJob.error = error.message; });
  child.on('close', (code) => {
    installJob.finishedAt = Date.now();
    installJob.status = code === 0 && comfy.ready() ? 'completed' : 'failed';
    installJob.progress = installJob.status === 'completed' ? 100 : installJob.progress;
    installJob.phase = installJob.status === 'completed' ? '安装完成' : '安装未完成，可点击继续安装';
    installJob.error ||= code === 0
      ? '仍有组件未就绪'
      : `安装脚本退出码 ${code}${installJob.logs.length ? `\n${installJob.logs.slice(-12).join('\n')}` : ''}`;
    delete installJob.child;
  });
  return installJob;
}

function professionalLog(raw) {
  const text = cleanLog(String(raw || ''));
  for (const line of text.split('\n').filter(Boolean)) {
    professionalSession.logs.push(line);
    if (professionalSession.logs.length > 160) professionalSession.logs.shift();
    professionalSession.phase = line.length > 120 ? `${line.slice(0, 117)}…` : line;
  }
}

async function professionalStatus() {
  const jobRunning = activeJob?.status === 'running' && activeJob?.engine === 'int8';
  const connection = await comfy.connectionState({ jobRunning });
  const running = connection.alive;
  const environment = environmentStatus();
  let status = professionalSession.status;
  let phase = professionalSession.phase;
  if (connection.responsive) {
    status = 'running';
    phase = 'ComfyUI 节点画布已就绪';
  } else if (connection.alive && (connection.busy || jobRunning)) {
    status = 'busy';
    phase = connection.safeIoMode
      ? 'ComfyUI 正在以稳定恢复模式生成，控制界面将在当前计算步结束后恢复'
      : 'ComfyUI 正在生成，控制接口暂时繁忙但进程仍在线';
  } else if (connection.alive) {
    status = 'starting';
    phase = 'ComfyUI 进程已启动，正在等待控制接口就绪';
  } else if (environment.running) {
    status = 'installing';
    phase = environment.phase;
  } else if (['running', 'busy', 'starting'].includes(status)) {
    status = environment.ready ? 'stopped' : 'missing';
    phase = environment.ready ? 'ComfyUI 已停止，可重新启动' : '需要安装节点编辑环境';
  } else if (!environment.ready && status !== 'failed') {
    status = 'missing';
    phase = '需要安装节点编辑环境';
  } else if (environment.ready && status === 'installing') {
    status = 'ready';
    phase = '环境安装完成，准备启动 ComfyUI';
  }
  professionalSession.status = status;
  professionalSession.phase = phase;
  return {
    edition: 'professional',
    status,
    phase,
    running,
    responsive: connection.responsive,
    busy: connection.busy || jobRunning,
    safeIoMode: connection.safeIoMode,
    lastResponsiveAt: connection.lastResponsiveAt || null,
    ready: environment.ready,
    installing: environment.running,
    installProgress: environment.progress,
    installPhase: environment.phase,
    error: professionalSession.error || installJob?.error || null,
    url: 'http://127.0.0.1:8188/',
    root: COMFY_DIR,
    logs: [...(environment.running ? environment.logs : professionalSession.logs)].slice(-120),
    features: [
      '完整 ComfyUI 节点画布与队列',
      'MiniMax H3 INT8 / NVFP4 工作环境',
      '自定义节点与 ComfyUI Manager',
      '自动硬件优化与低显存启动参数',
      '工作流导入、保存和节点级调试',
    ],
  };
}

async function startProfessionalMode() {
  if (!comfy.ready()) {
    const job = await startEnvironmentInstall();
    professionalSession.status = 'installing';
    professionalSession.phase = job.phase;
    professionalSession.error = null;
    return professionalStatus();
  }
  if (comfy.isBusy() || await comfy.ping({ timeout: 5000 })) return professionalStatus();
  if (!professionalStartPromise) {
    professionalSession.status = 'starting';
    professionalSession.phase = '正在按推荐参数启动 ComfyUI';
    professionalSession.error = null;
    professionalStartPromise = comfy.ensureServer(professionalLog, { mode: 'professional' })
      .then(() => {
        professionalSession.status = 'running';
        professionalSession.phase = 'ComfyUI 节点画布已就绪';
      })
      .catch((error) => {
        professionalSession.status = 'failed';
        professionalSession.phase = 'ComfyUI 启动失败';
        professionalSession.error = error.message;
        professionalLog(error.stack || error.message);
      })
      .finally(() => { professionalStartPromise = null; });
  }
  return professionalStatus();
}

function cleanLog(text) {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r/g, '\n');
}

function updateProgress(job, raw) {
  const text = cleanLog(raw);
  for (const line of text.split('\n').filter(Boolean)) {
    job.logs.push(line);
    if (job.logs.length > 320) job.logs.shift();

    if (line.includes('computing condition') || line.includes('get_learned_condition')) {
      job.phase = '理解提示词';
      job.progress = Math.max(job.progress, 12);
    } else if (line.includes('generate_video ')) {
      job.phase = '生成视频与音频';
      job.progress = Math.max(job.progress, 25);
    } else if (/sampling completed/.test(line)) {
      job.phase = '解码音视频';
      job.progress = Math.max(job.progress, 72);
    } else if (/decoding audio latent completed/.test(line)) {
      job.phase = '解码画面';
      job.progress = Math.max(job.progress, 80);
    } else if (/decode_first_stage completed/.test(line)) {
      job.phase = '保存视频';
      job.progress = Math.max(job.progress, 94);
    } else if (/save result video/.test(line)) {
      job.progress = 99;
    }

    const step = line.match(/\|\s*(\d+)\/(\d+)\s*-\s*[\d.]+s\/it/);
    if (step && job.phase === '生成视频与音频') {
      const current = Number(step[1]);
      const total = Number(step[2]);
      if (total > 0 && total <= 50) job.progress = Math.max(job.progress, 25 + Math.round((current / total) * 44));
    }
  }
}

function saveDataImage(dataUrl, label, id) {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) throw new Error(`${label}不是受支持的 PNG/JPEG/WebP 图片`);
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) throw new Error(`${label}大小必须在 15MB 以内`);
  const ext = match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : match[1];
  const file = path.join(UPLOAD_DIR, `${id}-${label === '首帧' ? 'first' : 'last'}.${ext}`);
  fs.writeFileSync(file, buffer);
  return file;
}

function saveWorkflowCharacterView(projectId, characterId, view, dataUrl) {
  if (!dataUrl) return '';
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) throw new Error('角色三视图仅支持 PNG、JPEG 或 WebP 图片');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) throw new Error('每张角色参考图必须小于 15MB');
  const ext = match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : match[1];
  const safeCharacterId = String(characterId || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!safeCharacterId || !['front', 'side', 'back'].includes(view)) throw new Error('角色定妆资料无效');
  const directory = path.join(path.dirname(workflowStore.file(projectId)), 'characters');
  fs.mkdirSync(directory, { recursive: true });
  for (const candidate of ['png', 'jpg', 'webp']) {
    const previous = path.join(directory, `${safeCharacterId}-${view}.${candidate}`);
    if (fs.existsSync(previous)) fs.unlinkSync(previous);
  }
  const fileName = `${safeCharacterId}-${view}.${ext}`;
  fs.writeFileSync(path.join(directory, fileName), buffer);
  return fileName;
}

function automaticStoryboard(prompt, duration, maxShotSeconds = 5, continuityMode = 'cut') {
  const source = stripSpokenContent(prompt);
  const corePrompt = source.slice(0, 1100);
  const storySource = source.includes('可拍摄剧本：') ? source.split('可拍摄剧本：').slice(1).join('可拍摄剧本：') : source;
  const beats = storySource.split(/\n{2,}|(?=场景?[一二三四五六七八九十\d]+[｜|：:])/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 12)
    .map((item) => item.slice(0, 650));
  const phases = [
    { title: '前三秒钩子', direction: '第一秒出现人物、目标或异常事件，用明确的可见动作立刻建立悬念，不使用字幕片头。' },
    { title: '世界与人物', direction: '用有辨识度的景别交代人物关系、时间、空间和视觉母题，让观众清楚谁想要什么。' },
    { title: '触发事件', direction: '发生一件迫使主角行动的新事件，必须提供新的剧情信息，不能重复人物入场。' },
    { title: '目标确立', direction: '主角作出明确选择并开始行动，用一个可持续追踪的动作推动故事。' },
    { title: '第一重阻碍', direction: '加入具体障碍或误会，延续上一动作并改变人物处境，保持空间方向一致。' },
    { title: '关系推进', direction: '通过人物反应、站位变化或关键道具推进关系，每个镜头只处理一个清楚动作。' },
    { title: '中段反转', direction: '揭示此前信息的新含义，让目标或人物关系发生可见变化，声场形成张力。' },
    { title: '压力升级', direction: '让障碍产生后果，行动节奏加快但保持人体结构、人物身份与场景连续。' },
    { title: '最低点', direction: '主角暂时失去优势，用稳定近景呈现清楚反应，不引入无关新角色或地点。' },
    { title: '最终决定', direction: '主角获得新信息并作出最后选择，动作方向明确，为高潮建立可续接位置。' },
    { title: '核心高潮', direction: '完成最具表现力的核心行动和冲突解决，构图清楚、主体稳定、运动连贯。' },
    { title: '结尾钩子', direction: '先交代本集行动结果，再留下一个新信息、人物反应或未解决问题作为下一集钩子；镜头最后停稳。' },
  ];
  const shots = [];
  let remaining = duration;
  const targetSeconds = Math.min(10, Math.max(3, Number(maxShotSeconds) || 5));
  const count = Math.ceil(duration / targetSeconds);
  for (let index = 0; index < count; index += 1) {
    const seconds = Math.min(targetSeconds, remaining);
    remaining -= seconds;
    const phaseIndex = count === 1 ? 0 : Math.round((index / (count - 1)) * (phases.length - 1));
    const phase = phases[phaseIndex];
    const continuity = index === 0
      ? '这是开场镜头：第一秒就出现有效画面，不要黑场、空镜等待或字幕片头。'
      : continuityMode === 'carry'
        ? '从输入首帧所示的上一镜头末帧自然继续：保持主体身份、外观、服装、道具、方位、光线和运动方向一致，不要重新入场，不要重复上一镜头的起始动作。'
        : '这是独立切换的新分镜：保持人物身份、外观、服装和道具一致，但必须换用新的景别、机位或构图并直接进入新动作，不要重新入场，不要复演上一镜头。';
    const ending = index === count - 1
      ? '这是结尾镜头：最后两秒让动作自然完成并形成可停留的收束画面。'
      : '镜头结尾保持主体清楚且动作仍可延续，为下一镜头留下稳定续接点。';
    const beat = beats.length ? beats[Math.min(beats.length - 1, Math.floor((index / count) * beats.length))] : phase.direction;
    shots.push({
      id: index + 1,
      seconds,
      title: phase.title,
      prompt: visualOnlyPrompt(`整片统一设定：${corePrompt}\n\n本镜头剧情素材：${beat}\n\n第 ${index + 1}/${count} 镜头「${phase.title}」，约 ${seconds} 秒。只表现本镜头剧情素材中的一个新动作和新信息，不复演、倒放、循环或改角度重复任何前序动作。${phase.direction}${continuity}${ending} 人物嘴唇自然闭合，不说话、不做说话口型。不要让手机屏幕、显示器、书页、招牌、海报等文字载体进入画面。电影级真实运动，时间连续，禁止跳帧、闪烁、形体突变、重复片段。`),
    });
  }
  return shots;
}

function normalizeStoryboard(value, prompt, duration, maxShotSeconds = 5, continuityMode = 'cut') {
  const fallback = automaticStoryboard(prompt, duration, maxShotSeconds, continuityMode);
  if (!Array.isArray(value) || !value.length) return fallback;
  if (value.length > MAX_STORYBOARD_SHOTS) throw new Error(`分镜数量最多为 ${MAX_STORYBOARD_SHOTS} 个`);
  const storyboard = value.map((item, index) => {
    const seconds = Number(item?.seconds);
    const shotPrompt = String(item?.prompt || '').trim();
    const title = String(item?.title || `镜头 ${index + 1}`).trim().slice(0, 40);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 10) throw new Error(`镜头 ${index + 1} 时长必须为 1–10 秒`);
    if (!shotPrompt) throw new Error(`镜头 ${index + 1} 缺少提示词`);
    if (shotPrompt.length > 4000) throw new Error(`镜头 ${index + 1} 提示词最多 4000 个字符`);
    return { id: index + 1, seconds, title, prompt: visualOnlyPrompt(shotPrompt) };
  });
  const total = storyboard.reduce((sum, shot) => sum + shot.seconds, 0);
  if (Math.abs(total - duration) > 0.05) throw new Error(`分镜总时长 ${total} 秒与成片时长 ${duration} 秒不一致`);
  return storyboard;
}

function normalizeSettings(body) {
  const inputPrompt = String(body.prompt || '').trim();
  if (!inputPrompt) throw new Error('请输入视频提示词');
  if (inputPrompt.length > 4000) throw new Error('提示词最多 4000 个字符');
  const prompt = visualOnlyPrompt(inputPrompt);

  const width = Number(body.width);
  const height = Number(body.height);
  const frames = Number(body.frames);
  const steps = Number(body.steps);
  const seed = body.randomSeed ? crypto.randomInt(0, 2147483647) : Number(body.seed);
  const requestedEngine = String(body.engine || 'int8');
  const externalEngine = REMOTE_PROVIDER_IDS.includes(requestedEngine) || PLATFORM_PROVIDER_IDS.includes(requestedEngine);
  const engine = externalEngine ? requestedEngine : requestedEngine === 'q2' ? 'q2' : 'int8';
  const duration = Number(body.duration || (frames / 24));
  const outputWidth = Number(body.outputWidth || width);
  const outputHeight = Number(body.outputHeight || height);
  const upscale = Boolean(body.upscale && (outputWidth !== width || outputHeight !== height));
  const enhancement = normalizeEnhancement(body.enhancement, upscale);

  const hostedEngine = REMOTE_PROVIDER_IDS.includes(engine) || PLATFORM_PROVIDER_IDS.includes(engine);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 256 || height < 256 || width > 1920 || height > 1920 || width * height > 2200000 || (!hostedEngine && (width % 32 || height % 32))) {
    throw new Error(hostedEngine ? '平台分辨率无效' : '分辨率边长必须为 256–1920、32 的倍数，且总像素不超过 220 万');
  }
  if (engine === 'q2' && (!Number.isInteger(frames) || frames < 5 || frames > MAX_VIDEO_FRAMES || (frames - 5) % 17 !== 0)) throw new Error('Q2 视频帧数必须位于 5 + 17n 网格内');
  if (!Number.isFinite(duration) || duration < 1 || duration > MAX_INT8_DURATION) throw new Error(`视频时长必须为 1–${MAX_INT8_DURATION} 秒`);
  if (engine === 'q2' && duration > 10) throw new Error('Q2 兼容预览最多生成 10 秒；长片导演工作流请使用高质量 INT8');
  if (!Number.isInteger(outputWidth) || !Number.isInteger(outputHeight) || outputWidth < width || outputHeight < height || outputWidth > 2560 || outputHeight > 2560 || outputWidth * outputHeight > 4194304) throw new Error('输出分辨率无效，最高支持 2560×2560 / 419 万像素');
  if (!Number.isInteger(steps) || steps < 1 || steps > 20) throw new Error('步数必须为 1–20');
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('随机种子无效');
  if (body.lastImage && !body.firstImage) throw new Error('使用尾帧时必须同时提供首帧');

  const storyboard = engine === 'int8' || PLATFORM_PROVIDER_IDS.includes(engine)
    ? normalizeStoryboard(body.storyboard, prompt, duration, body.shotSeconds, body.continuityMode)
    : [{ id: 1, seconds: duration, title: '单镜头预览', prompt }];
  const voiceSettings = voice.sanitizeSettings(body.voice || voice.loadSettings());
  const screenplay = String(body.screenplay || '').trim().slice(0, 24000);
  const timeline = normalizeScriptTimeline(body.timeline, screenplay, duration, voiceSettings.profileId);
  const ratio = width === height ? '1:1' : width > height ? '16:9' : '9:16';
  const continuityMode = body.continuityMode === 'carry' ? 'carry' : 'cut';
  const shortEdge = Math.min(width, height);
  const inferredNativeResolution = shortEdge >= 1080 ? '1080P' : shortEdge >= 768 ? '768P' : '720P';
  const nativeResolution = String(body.nativeResolution || inferredNativeResolution).toUpperCase();
  return { prompt, screenplay, timeline, width, height, outputWidth, outputHeight, upscale, enhancement, frames, duration, steps, seed, engine, storyboard, voice: voiceSettings, ratio, nativeResolution, generateAudio: body.generateAudio !== false, continuityMode };
}

function normalizeScriptTimeline(input, screenplay, duration, defaultVoiceProfileId = 'female_narrator') {
  const expectedHash = screenplayHash(screenplay);
  if (!input || input.scriptHash !== expectedHash || !Array.isArray(input.cues)) {
    return buildScriptTimeline({ screenplay, duration, defaultVoiceProfileId });
  }
  const limit = Math.max(1, Math.min(4 * 60 * 60, Number(duration) || 60));
  const cues = sanitizeTimelineCues(input.cues, limit, defaultVoiceProfileId);
  return { scriptHash: expectedHash, totalDuration: limit, cues };
}

function timelineCuesForShot(timeline, storyboard, number) {
  if (!Array.isArray(timeline?.cues) || !timeline.cues.length) return [];
  const index = Math.max(0, Number(number || 1) - 1);
  const start = storyboard.slice(0, index).reduce((sum, item) => sum + Math.max(0, Number(item?.seconds) || 0), 0);
  const end = start + Math.max(0.5, Number(storyboard[index]?.seconds) || 5);
  const last = index === storyboard.length - 1;
  return timeline.cues.filter((cue) => {
    const midpoint = (Number(cue.start) + Number(cue.end)) / 2;
    return midpoint >= start && (last ? midpoint <= end : midpoint < end);
  });
}

function automaticVoiceMap(project, extraSpeakers = []) {
  const previous = {};
  for (const cue of project.timeline?.cues || []) {
    if (cue.speaker && cue.voiceProfileId) previous[cue.speaker] ||= cue.voiceProfileId;
  }
  const speakers = [...new Set([
    ...buildScriptTimeline({ screenplay: project.script.screenplay, duration: project.brief.duration }).cues.map((cue) => cue.speaker),
    ...extraSpeakers.map((speaker) => String(speaker || '').trim()).filter(Boolean),
  ])];
  const female = ['female_emotional', 'female_story', 'female_intimate', 'female_gentle', 'female_mature', 'female_bright'];
  const male = ['male_relaxed', 'male_youthful', 'male_warm', 'male_clear', 'male_suspense', 'male_narrator'];
  const available = new Set(VOICE_PROFILES.map((item) => item.id));
  const bible = `${project.bible?.characters || ''}\n${project.script?.outline || ''}`;
  const result = {};
  let unknownIndex = 0;
  let femaleIndex = 0;
  let maleIndex = 0;
  for (const speaker of speakers) {
    if (previous[speaker]) { result[speaker] = previous[speaker]; continue; }
    if (['旁白', '画外音', '内心', '解说'].includes(speaker)) {
      result[speaker] = project.brief.voiceProfileId || 'female_narrator';
      continue;
    }
    const contextMatch = new RegExp(`${speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]{0,80}`).exec(bible)?.[0] || '';
    const femaleHint = /女|母|妻|姐|妹|姑娘|少女|奶奶|阿姨|她/.test(contextMatch);
    const maleHint = /男|父|夫|哥|弟|少年|青年|爷爷|叔叔|他/.test(contextMatch);
    if (femaleHint && !maleHint) result[speaker] = female[femaleIndex++ % female.length];
    else if (maleHint && !femaleHint) result[speaker] = male[maleIndex++ % male.length];
    else result[speaker] = (unknownIndex++ % 2 ? male[maleIndex++ % male.length] : female[femaleIndex++ % female.length]);
    if (!available.has(result[speaker])) result[speaker] = project.brief.voiceProfileId || 'female_narrator';
  }
  return result;
}

async function replaceShotSpeech({ shot, shotFile, number, settings, onLog }) {
  if (!settings.voice?.enabled) return shotFile;
  const cues = timelineCuesForShot(settings.timeline, settings.storyboard, number);
  if (!cues.length) return shotFile;
  if (!voice.ready()) {
    onLog?.(`[后期配音] 剧本在镜头 ${number} 包含台词，但 CosyVoice 尚未安装，保留环境音\n`);
    return shotFile;
  }
  const voiceDir = path.join(path.dirname(shotFile), 'voice');
  fs.mkdirSync(voiceDir, { recursive: true });
  const shotStart = settings.storyboard.slice(0, Math.max(0, number - 1)).reduce((sum, item) => sum + (Number(item.seconds) || 0), 0);
  const voiceFiles = [];
  onLog?.(`[后期配音] 按剧本声音轴为镜头 ${number} 生成 ${cues.length} 段中文台词\n`);
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const wav = path.join(voiceDir, `shot-${String(number).padStart(2, '0')}-cue-${String(index + 1).padStart(2, '0')}.wav`);
    await voice.synthesize(cue.text, cue.voiceProfileId || settings.voice.profileId, wav, {
      onLog, instruction: settings.voice.instruction, speed: settings.voice.speed,
      pauseScale: settings.voice.pauseScale, variation: settings.voice.variation,
    });
    voiceFiles.push({ wav, delay: Math.max(0, Math.round((cue.start - shotStart) * 1000)) });
  }
  if (!existsOver(comfy.ffmpeg)) throw new Error('合成独立对白需要 FFmpeg');
  const target = path.join(path.dirname(shotFile), `shot-${String(number).padStart(2, '0')}-voiced.mp4`);
  const nativeVolume = settings.voice.replaceNativeSpeech ? settings.voice.nativeAudioVolume : 0.45;
  const speechVolume = settings.voice.speechVolume;
  const inputs = voiceFiles.flatMap((item) => ['-i', item.wav]);
  const voiceFilters = voiceFiles.map((item, index) => `[${index + 1}:a]volume=${speechVolume},adelay=${item.delay}|${item.delay}[speech${index}]`);
  const mixInputs = ['[amb]', ...voiceFiles.map((_, index) => `[speech${index}]`)].join('');
  const filter = [`[0:a]volume=${nativeVolume}[amb]`, ...voiceFilters, `${mixInputs}amix=inputs=${voiceFiles.length + 1}:duration=first:dropout_transition=0,aresample=async=1:first_pts=0[a]`].join(';');
  await new Promise((resolve, reject) => {
    const child = spawn(comfy.ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'warning', '-i', shotFile, ...inputs,
      '-filter_complex', filter,
      '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(shot.seconds), '-movflags', '+faststart', target,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorText = '';
    child.stderr.on('data', (chunk) => { errorText = `${errorText}${chunk}`.slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`对白混音失败：${errorText || `退出码 ${code}`}`)));
  });
  fs.copyFileSync(target, shotFile);
  fs.unlinkSync(target);
  for (const item of voiceFiles) { try { fs.unlinkSync(item.wav); } catch {} }
  onLog?.(`[后期配音] 镜头 ${number} 已加入来自剧本的 CosyVoice 台词\n`);
  return shotFile;
}

function loadPromptProvider() {
  let fileConfig = {};
  try { fileConfig = JSON.parse(fs.readFileSync(PROMPT_PROVIDER_FILE, 'utf8')); } catch {}
  return {
    enabled: process.env.H3_PROMPT_ENABLED === '1' || fileConfig.enabled === true,
    type: process.env.H3_PROMPT_PROVIDER || fileConfig.type || 'openai-compatible',
    providerId: process.env.H3_PROMPT_PROVIDER_ID || fileConfig.providerId || '',
    baseUrl: process.env.H3_PROMPT_BASE_URL || fileConfig.baseUrl || '',
    model: process.env.H3_PROMPT_MODEL || fileConfig.model || '',
    endpointMode: process.env.H3_PROMPT_ENDPOINT_MODE || fileConfig.endpointMode || 'chat-completions',
    authMode: process.env.H3_PROMPT_AUTH_MODE || fileConfig.authMode || (fileConfig.apiKey ? 'bearer' : 'none'),
    apiKey: process.env.H3_PROMPT_API_KEY || fileConfig.apiKey || '',
  };
}

function publicPromptProvider() {
  const config = loadPromptProvider();
  return { ...promptApi.publicConfig(config), configFile: PROMPT_PROVIDER_FILE };
}

function savePromptProvider(input) {
  const config = promptApi.sanitizeConfig(input, loadPromptProvider());
  const temp = `${PROMPT_PROVIDER_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(temp, PROMPT_PROVIDER_FILE);
  return publicPromptProvider();
}

async function testPromptProvider(input = {}) {
  const config = Object.keys(input).length ? promptApi.sanitizeConfig(input, loadPromptProvider()) : loadPromptProvider();
  if (!config.enabled) throw new Error('请先启用 API');
  const startedAt = Date.now();
  const result = await promptApi.chat(config, [
    { role: 'system', content: '你是连接测试助手。' },
    { role: 'user', content: '只回复：连接成功' },
  ], { temperature: 0, maxTokens: 24, timeoutMs: 30000 });
  return { ok: true, message: result.text.slice(0, 80), endpoint: result.endpoint, latencyMs: Date.now() - startedAt };
}

function postJson(targetUrl, headers, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const transport = url.protocol === 'https:' ? httpsTransport : httpTransport;
    const body = Buffer.from(JSON.stringify(payload));
    const request = transport.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, ...headers },
      timeout: 90000,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(parsed.error?.message || `提示词服务返回 ${response.statusCode}`));
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy(new Error('提示词服务响应超时')));
    request.on('error', reject);
    request.end(body);
  });
}

async function optimizePrompt(input) {
  const prompt = String(input.prompt || '').trim();
  if (!prompt) throw new Error('请先输入需要优化的提示词');
  if (prompt.length > 4000) throw new Error('提示词最多 4000 个字符');
  const config = loadPromptProvider();
  if (!config.enabled) throw new Error('提示词优化接口已预留，但尚未启用服务商');
  if (config.type !== 'openai-compatible') throw new Error(`暂不支持提示词服务类型：${config.type}`);
  if (!config.baseUrl || !config.model) throw new Error('请先配置提示词服务地址和模型名称');

  const result = await promptApi.chat(config, [
      { role: 'system', content: '你是专业的 AI 视频导演。保留用户原意，将输入改写为一段中文生成提示词；补充主体动作、环境、构图、镜头运动、光影、节奏，以及与画面同步的环境声和动作声。禁止输出台词、旁白、画外音、可辨识人声、歌词、字幕或任何可读文字；不得添加用户没有暗示的品牌、人物身份或敏感内容。台词与字幕统一留给 LocalFrame 后期台。只输出优化后的提示词，不要解释。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.55, maxTokens: 1800 });
  const optimized = result.text;
  if (!optimized) throw new Error('提示词服务没有返回可用内容');
  return visualOnlyPrompt(optimized);
}

function parseJsonContent(content) {
  const cleaned = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('分镜服务没有返回 JSON 数组');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function parseJsonObject(content) {
  const cleaned = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('剧本服务没有返回 JSON 对象');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function localScriptPackage(project) {
  const { idea, duration, style, audience, dialogue } = project.brief;
  const audienceLine = audience ? `面向${audience}` : '面向普通短视频观众';
  const durationLabel = duration >= 60 ? `${Math.floor(duration / 60)} 分${duration % 60 ? ` ${duration % 60} 秒` : '钟'}` : `${duration} 秒`;
  return {
    logline: `${idea}——在约 ${durationLabel} 的单集内，以${style}完成一个目标明确、冲突升级并带结尾钩子的短剧故事。`,
    outline: [
      `开场钩子：围绕「${idea}」在前三秒展示异常、危险或强烈人物选择，不使用字幕片头。`,
      '人物目标：迅速交代主角要得到什么、为什么现在必须行动，以及失败的具体代价。',
      '冲突升级：设置至少两次性质不同的阻碍；每次都改变人物处境，而不是重复争执或奔跑。',
      '中段反转：让一个既有信息产生新含义，改变人物关系或原先目标。',
      '最低点与决定：主角承受前面选择的后果，并依据新信息作出最后决定。',
      '高潮与集尾钩子：完成本集主要行动，交代结果后留下一个可见的新问题，引向下一集。',
    ].join('\n'),
    screenplay: [
      `短剧单集：《${project.title}》　时长：约 ${durationLabel}　风格：${style}　${audienceLine}`,
      `场 1｜冷开场 / 钩子\n画面：第一秒出现有效事件或人物反应，避免黑场、字幕片头和无效等待。\n剧情：提出本集最重要的问题，但暂不解释完整原因。${dialogue ? `\n旁白：关于“${idea}”的真相，从这一刻开始改变。` : ''}`,
      `场 2｜人物与目标\n画面：通过一个可见行动交代人物处境和目标。${dialogue ? '\n主角：“我不能再等了，今天一定要把这件事弄清楚。”' : '\n声音：不用对白，以动作声和环境声说明目标。'}`,
      '场 3｜触发事件\n剧情：出现必须立即处理的新事件；主角作出选择，故事进入不可回退状态。',
      '场 4｜第一重阻碍\n画面：围绕核心目标制造具体阻碍；动作幅度受控，手部不遮挡脸部，避免多人复杂肢体接触。',
      `场 5｜关系推进 / 信息揭示\n剧情：通过反应或关键道具提供新信息，改变观众对前面事件的理解。${dialogue ? '\n主角：“原来我一直看错了，真正重要的是这个。”' : ''}`,
      '场 6｜中段反转与压力升级\n剧情：原计划失效或人物关系翻转；环境声和音乐同步增强，但不盖过对白。',
      '场 7｜最低点与最终决定\n画面：用稳定近景呈现后果，随后让主角依据新信息采取最后行动。',
      `场 8｜高潮、结果与下集钩子\n画面：解决本集主要行动，最后出现一个新信息或人物反应；构图稳定并保留清晰末帧。${dialogue ? '\n主角：“这件事还没有结束。”' : ''}`,
    ].join('\n\n'),
    characters: '人物统一规则：固定年龄感、脸型、发型、服装层次、主色和标志性配件；全片不换装、不增减配件。手部动作一次只表达一个意图，每只手保持五根手指，避免交叉遮挡与身体穿模。若无人物，则将此规则用于主体外观和材质连续性。',
    locations: `场景统一规则：围绕“${idea}”只使用必要地点；固定空间结构、主光方向、天气和时间。镜头切换不改变左右方位，背景元素数量保持克制。`,
    visualRules: `${style}；主体优先占据可识别画面比例；景别由全到近逐步推进；运镜平滑、有方向，不突然变焦。真实人体结构，面部清晰，禁止额外肢体、融合手指、穿模、形体突变、闪烁、重复帧、文字和水印。`,
    audioRules: `${dialogue ? '对白短而清楚，单镜头内尽量只让一人说话；' : '不使用对白；'}环境声跨镜头连续，动作声与画面同步，音乐不盖过对白或关键声音，片尾自然衰减。`,
    source: 'local-template',
  };
}

async function createWorkflowScript(project) {
  const fallback = localScriptPackage(project);
  const config = loadPromptProvider();
  const canUseAI = config.enabled && config.type === 'openai-compatible' && config.baseUrl && config.model;
  if (!canUseAI) return { package: fallback, source: 'local-template', warning: '未连接本地大语言模型，已生成可直接编辑的本地导演稿。' };
  try {
    const result = await promptApi.chat(config, [
      { role: 'system', content: '你是本地 AI 竖屏短剧制片系统的编剧、导演和连续性监督。请把用户简报写成一集完整短剧的制作包：前三秒有强钩子，主角目标和失败代价清楚，冲突至少升级两次，中段有因果合理的反转，高潮解决本集主要行动，结尾留下下一集钩子。screenplay 要按场次写画面、动作、对白和声音，内容量应匹配用户指定单集时长。所有真实对白必须写成“角色：“完整台词””，旁白必须写成“旁白：完整内容”；禁止用“使用一句对白”等占位说明。字幕和配音将只从 screenplay 提取，分镜与视频模型不接收台词文本。动作必须适合 AI 视频生成，避免多人复杂肢体接触；明确人物外观、空间、光线、声音和镜头连续性。只返回 JSON 对象，不要 Markdown。字段必须是 logline、outline、screenplay、characters、locations、visualRules、audioRules，所有值均为中文字符串。' },
      { role: 'user', content: JSON.stringify({ title: project.title, ...project.brief }) },
    ], { temperature: 0.42, maxTokens: 10000, timeoutMs: 240000 });
    const raw = parseJsonObject(result.text);
    const required = ['logline', 'outline', 'screenplay', 'characters', 'locations', 'visualRules', 'audioRules'];
    if (required.some((key) => !String(raw[key] || '').trim())) throw new Error('制作包字段不完整');
    return { package: { ...raw, source: 'api-writer' }, source: 'api-writer' };
  } catch (error) {
    return { package: fallback, source: 'local-template', warning: `本地模型本次未完成剧本，已使用可编辑导演稿继续：${error.message}` };
  }
}

function workflowStoryboardPrompt(project) {
  const compact = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const confirmedCharacters = (project.characterModels || []).filter((item) => item.confirmed).map((item) => (
    `${item.name}：${item.description || '外观以已确认的正面、侧面、背面三视图为唯一基准'}`
  ));
  return [
    `项目：${compact(project.title, 80)}`,
    `核心创意：${compact(project.brief.idea, 350)}`,
    `一句话故事：${compact(project.script.logline, 300)}`,
    `人物规则：${compact(project.bible.characters, 600)}`,
    confirmedCharacters.length ? `已确认角色定妆模型：${compact(confirmedCharacters.join('；'), 800)}。所有镜头必须严格保持脸型、发型、体型、服装、配色和配件一致。` : '',
    `场景与视觉规则：${compact(`${project.bible.locations} ${project.bible.visualRules}`, 600)}`,
    `故事大纲：${compact(project.script.outline, 500)}`,
    `剧本中的可见动作：${compact(stripSpokenContent(project.script.screenplay, 1600), 1200)}`,
  ].filter(Boolean).join('\n').slice(0, 4000);
}

function workflowDeliveryDimensions(delivery, aspect, width, height) {
  if (delivery === '2k') {
    if (aspect === '9:16') return [1440, 2560];
    if (aspect === '1:1') return [2048, 2048];
    return [2560, 1440];
  }
  if (delivery === '1080p') {
    if (aspect === '9:16') return [1080, 1920];
    if (aspect === '1:1') return [1080, 1080];
    return [1920, 1080];
  }
  return [width, height];
}

function workflowEnhancement(project, upscale) {
  return normalizeEnhancement({
    mode: project.generation?.enhancementMode,
    profile: project.generation?.enhancementProfile,
  }, upscale);
}

function buildWorkflowPlan(project, optimization) {
  const selectedVideoProvider = videoProviderStore.load().selectedProviderId;
  const generation = project.generation || {};
  const continuityMode = generation.continuity === 'carry' ? 'carry' : 'cut';
  const audioMode = generation.audioMode === 'ambience' ? 'ambience' : 'silent';
  const targetShotSeconds = Math.min(10, Math.max(3, Number(generation.shotSeconds) || 5));
  if (PLATFORM_PROVIDER_IDS.includes(selectedVideoProvider)) {
    const provider = PROVIDER_PRESETS[selectedVideoProvider];
    const [width, height] = project.brief.aspect === '9:16' ? [720, 1280] : project.brief.aspect === '1:1' ? [1080, 1080] : [1280, 720];
    const [outputWidth, outputHeight] = workflowDeliveryDimensions(project.brief.delivery, project.brief.aspect, width, height);
    const enhancement = workflowEnhancement(project, outputWidth !== width || outputHeight !== height);
    const segments = Math.max(1, project.storyboard.length || Math.ceil(project.brief.duration / targetShotSeconds));
    const warnings = ['平台协作会自动准备并打开每个镜头；你只需在官网确认生成并下载，LocalFrame 会自动接回结果。'];
    if (!existsOver(comfy.ffmpeg) && segments > 1) warnings.push('多镜头最终合片需要 FFmpeg；请先完成一次本地高质量环境准备。');
    if (project.brief.dialogue !== false && project.brief.voiceEnabled !== false && !voice.ready()) warnings.push('后期台生成清晰中文对白需要 CosyVoice；本次画面生成不受影响，只保留环境声。');
    return {
      generatedAt: new Date().toISOString(), presetId: 'platform-handoff', engine: selectedVideoProvider,
      width, height, outputWidth, outputHeight, upscale: outputWidth !== width || outputHeight !== height,
      duration: project.brief.duration, frames: gridFrames(project.brief.duration), steps: 1, seed: 42, segments,
      quality: generation.quality || 'auto', shotSeconds: targetShotSeconds, continuityMode, audioMode, enhancement,
      hardware: { gpu: '平台生成', vramGb: 0, memoryGb: optimization.hardware?.memoryGb || 0, cpu: optimization.hardware?.cpu || '未知处理器' },
      reasons: [
        `${provider.label} · 无需申请 API`,
        `${segments} 个短镜头逐一准备，下载后自动识别和匹配`,
        '提示词自动复制，参考图自动整理到交换目录',
        `最终输出 ${outputWidth}×${outputHeight}，${enhancement.mode === 'flashvsr' ? 'FlashVSR 扩散二次采样' : enhancement.mode === 'realesrgan' ? 'Real-ESRGAN AI 清晰修复' : enhancement.mode === 'lanczos' ? 'Lanczos 高清还原' : '不启用二次修复'}`,
        '准确台词、配音和字幕统一在后期台生成并加入',
      ],
      warnings,
      environmentReady: true,
    };
  }
  const gpu = (optimization.hardware?.gpus || []).find((item) => item.vendor === 'nvidia');
  const vram = Number(gpu?.vramGb) || 0;
  let presetId = 'cpu_safe';
  let engine = 'q2';
  let width = 384;
  let height = 256;
  let steps = 3;
  if (vram >= 19.5) ({ presetId, engine, width, height, steps } = { presetId: 'quality', engine: 'int8', width: 1344, height: 768, steps: 8 });
  else if (vram >= 11.5) ({ presetId, engine, width, height, steps } = { presetId: 'balanced', engine: 'int8', width: 1152, height: 640, steps: 8 });
  else if (vram >= 7.5) ({ presetId, engine, width, height, steps } = { presetId: 'low_vram', engine: 'int8', width: 960, height: 544, steps: 8 });
  else if (vram >= 5.5) ({ presetId, engine, width, height, steps } = { presetId: 'ultra_low', engine: 'int8', width: 768, height: 448, steps: 6 });
  else if (gpu) ({ presetId, engine, width, height, steps } = { presetId: 'q2_preview', engine: 'q2', width: 512, height: 320, steps: 4 });
  const autoPixels = width * height;
  const qualityProfiles = {
    draft: { width: 768, height: 448, steps: 4 },
    balanced: { width: 960, height: 544, steps: 6 },
    quality: { width: 1152, height: 640, steps: 8 },
    ultra: { width: 1344, height: 768, steps: 10 },
  };
  const requestedQuality = qualityProfiles[generation.quality];
  if (engine === 'int8' && requestedQuality) ({ width, height, steps } = requestedQuality);
  if (engine === 'int8' && [4, 6, 8, 10, 12].includes(Number(generation.steps))) steps = Number(generation.steps);
  if (project.brief.aspect === '9:16') [width, height] = [height, width];
  if (project.brief.aspect === '1:1') width = height = engine === 'int8' ? Math.min(768, Math.max(448, height)) : 320;
  const output = workflowDeliveryDimensions(project.brief.delivery, project.brief.aspect, width, height);
  const enhancement = workflowEnhancement(project, output[0] !== width || output[1] !== height);
  const segments = Math.max(1, project.storyboard.length || Math.ceil(project.brief.duration / targetShotSeconds));
  const warnings = [...(optimization.warnings || [])];
  if (engine === 'q2') warnings.push('当前硬件只推荐 Q2 兼容预览，画质不能等同于 INT8 成片；如需高质量，请使用至少 6GB NVIDIA 显卡。');
  if (!comfy.ready() && engine === 'int8') warnings.push('高质量环境尚未完整安装，生产前需要先在软件内完成环境安装。');
  if (engine === 'int8' && width * height > autoPixels) warnings.push('所选画质高于当前硬件自动推荐档；软件会保留四级降载恢复，但耗时和显存不足风险会增加。');
  if (project.brief.duration >= 120) warnings.push(`短剧将拆成约 ${segments} 个镜头逐段渲染；低显存设备可能需要数小时到数天，请保持供电、散热和充足磁盘空间。`);
  if (audioMode === 'ambience') warnings.push('环境声模式已使用强制禁人声提示，但生成模型仍可能偶发人声；若必须完全杜绝人物念台词，请选择“纯画面无音轨”。');
  const enhancementState = qualityEnhancer.status();
  if (project.brief.delivery === '2k' && enhancement.mode === 'none') warnings.push('2K 交付必须明确选择 Lanczos、Real-ESRGAN 或 FlashVSR；系统不会把插值冒充 AI 超分。');
  if (['realesrgan', 'flashvsr'].includes(enhancement.mode) && !enhancementState.modes[enhancement.mode].ready) warnings.push(`${enhancementState.modes[enhancement.mode].label} 尚未安装完整后端或权重，生产前需要补齐。`);
  if (enhancement.mode === 'flashvsr') warnings.push('FlashVSR 会在全部镜头合片后单独占用 GPU；系统会等待 H3 采样结束，不与视频生成并行。');
  if (project.brief.dialogue !== false && project.brief.voiceEnabled !== false && !voice.ready()) warnings.push('后期台生成清晰中文对白需要 CosyVoice；本次画面生成不受影响。');
  return {
    generatedAt: new Date().toISOString(), presetId, engine, width, height,
    outputWidth: output[0], outputHeight: output[1], upscale: output[0] !== width || output[1] !== height,
    duration: project.brief.duration, frames: gridFrames(project.brief.duration), steps, seed: 42, segments,
    quality: generation.quality || 'auto', shotSeconds: targetShotSeconds, continuityMode, audioMode, enhancement,
    hardware: { gpu: gpu?.name || '未检测到 NVIDIA 显卡', vramGb: vram, memoryGb: optimization.hardware?.memoryGb || 0, cpu: optimization.hardware?.cpu || '未知处理器' },
    reasons: [
      `${gpu?.name || 'CPU 兼容模式'} · ${vram || 0}GB 显存`,
      `${optimization.hardware?.memoryGb || 0}GB 内存 · ${optimization.hardware?.cpuCores || '?'} 核 CPU`,
      continuityMode === 'carry'
        ? `${segments} 个短镜头逐段生成、校验、缓存并以上一段稳定帧续接`
        : `${segments} 个短分镜独立生成、校验、缓存并优先无损合片，避免动作循环`,
      engine === 'int8' ? 'INT8/NVFP4、动态卸载、SLA 注意力与失败降载恢复' : 'Q2、磁盘权重流送与 VAE 分块',
      project.brief.delivery === 'native' ? `原生 ${width}×${height} 输出` : `内部 ${width}×${height} 渲染后输出 ${output[0]}×${output[1]}`,
      enhancement.mode === 'flashvsr' ? `FlashVSR ${enhancement.profile} 视频扩散二次采样` : enhancement.mode === 'realesrgan' ? 'Real-ESRGAN 帧级 AI 二次推理' : enhancement.mode === 'lanczos' ? 'Lanczos 插值放大（非 AI）' : '不启用二次画质修复',
      audioMode === 'ambience' ? '生成阶段仅保留环境声并强制禁人声；台词和字幕转入后期台' : '生成阶段输出纯画面无音轨；台词、配音和字幕转入后期台',
    ],
    warnings,
    environmentReady: engine === 'q2' ? q2Ready() : comfy.ready(),
  };
}

function gridFrames(seconds) {
  const desired = Math.max(5, Math.round(Number(seconds) * 24));
  return 5 + Math.max(0, Math.round((desired - 5) / 17)) * 17;
}

function syncWorkflowJob(job) {
  if (!job?.projectId) return;
  try {
    const completed = job.status === 'completed';
    const running = job.status === 'running';
    workflowStore.update(job.projectId, {
      status: completed ? 'completed' : running ? 'producing' : job.status,
      currentStage: completed ? 'completed' : 'production',
      production: {
        mode: PLATFORM_PROVIDER_IDS.includes(job.engine) ? 'platform-handoff' : REMOTE_PROVIDER_IDS.includes(job.engine) ? 'cloud' : 'local',
        providerId: job.providerId || '',
        jobId: job.id,
        jobStatus: job.status,
        outputName: job.outputName || '',
        lastError: job.error || '',
        handoff: job.handoff ? {
          status: 'awaiting_platform', activeShotId: job.handoff.shotNumber, totalShots: job.handoff.totalShots,
          importedShots: job.shotFiles?.length || 0, providerId: job.providerId, actionId: job.handoff.actionId,
        } : null,
      },
    });
  } catch (error) { console.error(`全工作流任务状态保存失败：${error.message}`); }
}

async function createStoryboard(input) {
  const prompt = String(input.prompt || '').trim();
  const duration = Number(input.duration);
  if (!prompt) throw new Error('请先输入整片创意');
  if (prompt.length > 4000) throw new Error('整片创意最多 4000 个字符');
  if (!Number.isFinite(duration) || duration < 1 || duration > MAX_INT8_DURATION) throw new Error(`成片时长必须为 1–${MAX_INT8_DURATION} 秒`);
  const maxShotSeconds = Math.min(10, Math.max(3, Number(input.maxShotSeconds) || 5));
  const fallback = automaticStoryboard(prompt, duration, maxShotSeconds, input.continuityMode);
  const config = loadPromptProvider();
  const canUseAI = input.preferAI !== false && config.enabled && config.type === 'openai-compatible' && config.baseUrl && config.model;
  if (!canUseAI) return { storyboard: fallback, source: 'local-director' };
  const generated = [];
  const warnings = [];
  let aiBatches = 0;
  const batchSize = 12;
  for (let offset = 0; offset < fallback.length; offset += batchSize) {
    const expected = fallback.slice(offset, offset + batchSize);
    const batchNumber = Math.floor(offset / batchSize) + 1;
    const batchCount = Math.ceil(fallback.length / batchSize);
    const previous = generated.length ? String(generated[generated.length - 1].prompt || '').slice(-900) : '这是本集开场。';
    try {
      const result = await promptApi.chat(config, [
        { role: 'system', content: `你是竖屏短剧的电影分镜导演。当前要编写第 ${batchNumber}/${batchCount} 批，即全片第 ${offset + 1}–${offset + expected.length} 镜头，共 ${expected.length} 个；叙事进度必须覆盖全片约 ${Math.round(offset / fallback.length * 100)}%–${Math.round((offset + expected.length) / fallback.length * 100)}%，不可提前跳到结局。每个镜头时长依次固定为 ${expected.map((shot) => shot.seconds).join('、')} 秒，不得增删镜头。每个镜头只表现一个具体可见动作并提供新的剧情信息，动作起点、动作结果、景别或机位必须与相邻镜头明显不同；禁止复演、倒放、循环、换角度重复上一镜头，也禁止重复人物入场。禁止用“推进剧情、发生事件”等抽象占位。不要让手机屏幕、显示器、书页、招牌、海报等文字载体进入画面，画面任何位置均不得出现字幕或可读字符。人物嘴唇自然闭合，不说话、不做说话口型。分镜提示词应描述主体动作、景别、运镜、光影、人物、服装、道具、场景和运动方向的连续性；若需要声音，只能描述环境声和动作声，禁止台词、旁白、画外音、耳语、喊叫、可辨识人声、歌词。第一批前三秒要有钩子；最后一批先完成本集冲突，再留下结尾钩子。只返回 JSON 数组，不要 Markdown。元素格式：{"title":"短标题","seconds":5,"prompt":"完整中文纯画面镜头提示词"}。` },
        { role: 'user', content: `全片制作包：\n${prompt}\n\n上一批最后状态：\n${previous}` },
      ], { temperature: 0.42, maxTokens: 7000, timeoutMs: 240000 });
      const raw = parseJsonContent(result.text);
      if (!Array.isArray(raw) || raw.length !== expected.length) throw new Error(`应返回 ${expected.length} 个镜头，实际为 ${Array.isArray(raw) ? raw.length : 0} 个`);
      const normalizedBatch = raw.map((item, index) => {
        const shotPrompt = String(item?.prompt || '').trim();
        if (!shotPrompt) throw new Error(`第 ${offset + index + 1} 镜头缺少提示词`);
        return {
          id: offset + index + 1,
          title: String(item?.title || expected[index].title).trim().slice(0, 40),
          seconds: expected[index].seconds,
          prompt: visualOnlyPrompt(shotPrompt),
        };
      });
      generated.push(...normalizedBatch);
      aiBatches += 1;
    } catch (error) {
      generated.push(...expected.map((shot, index) => ({ ...shot, id: offset + index + 1 })));
      warnings.push(`第 ${batchNumber} 批改用离线导演稿：${error.message}`);
    }
  }
  const totalBatches = Math.ceil(fallback.length / batchSize);
  return {
    storyboard: generated,
    source: aiBatches === totalBatches ? (totalBatches > 1 ? 'api-director-batched' : 'api-director') : aiBatches ? 'hybrid-director' : 'local-director',
    warning: warnings.length ? warnings.join('；') : null,
  };
}

function readGpuState() {
  return new Promise((resolve) => gpuInfo(resolve));
}

function ensureGenerationEngine(body) {
  if (activeJob && activeJob.status === 'running') throw new Error('已有任务正在处理或生成，请等待完成或先取消');
  if (imageStudio.busy && !REMOTE_PROVIDER_IDS.includes(body.engine) && !PLATFORM_PROVIDER_IDS.includes(body.engine)) throw new Error('本机图片正在生成，请等待完成');
  if (PLATFORM_PROVIDER_IDS.includes(body.engine)) return;
  if (REMOTE_PROVIDER_IDS.includes(body.engine)) {
    const state = videoProviderStore.load();
    const config = state.providers[body.engine];
    videoProviders.get(body.engine).validateConfiguration();
    return;
  }
  if (body.engine === 'q2') {
    if (!q2Ready()) throw new Error('Q2 兼容运行时或模型文件缺失，请检查安装');
  } else if (!comfy.ready()) {
    throw new Error('高质量 INT8 环境尚未完整安装，请在“环境与模型”中点击安装或继续下载');
  }
}

async function prepareLocalGeneration(body, job, config) {
  const providerName = ({ freetoken: 'FreeToken', lmstudio: 'LM Studio', ollama: 'Ollama', vllm: 'vLLM / LocalAI', llamacpp: 'llama.cpp' })[config.providerId] || '本地大语言模型';
  const prepared = { ...body };
  const userEditedStoryboard = body.storyboardEdited === true;
  let optimized = false;
  job.memoryGuard = {
    active: true,
    providerId: config.providerId || promptApi.inferProviderId(config.baseUrl),
    providerName,
    stage: 'free-video-memory',
    prepared: false,
    modelReleased: false,
  };
  appendJobLog(job, `[显存保护] 检测到同机 ${providerName}，开始串行显存交接`);
  job.phase = '释放视频模型显存';
  job.progress = 2;
  await comfy.freeMemory((text) => appendJobLog(job, text));
  if (job.cancelRequested) throw new Error('任务已取消');

  if (userEditedStoryboard) {
    appendJobLog(job, '[显存保护] 检测到手工编辑分镜，保留用户内容并跳过重复改写');
  } else {
    if (body.promptOptimizedByAi !== true) {
      job.memoryGuard.stage = 'prompt-optimization';
      job.phase = `${providerName} 优化提示词`;
      job.progress = 3;
      try {
        prepared.prompt = await optimizePrompt({ prompt: body.prompt });
        optimized = prepared.prompt !== body.prompt;
        appendJobLog(job, `[显存保护] ${providerName} 已完成提示词优化`);
      } catch (error) {
        appendJobLog(job, `[显存保护] 提示词优化失败，保留原文继续：${error.message}`);
      }
      if (job.cancelRequested) throw new Error('任务已取消');
    }

    if (body.engine !== 'q2' && body.directorMode !== false) {
      const storyboardReady = body.storyboardSource === 'api-director' && !optimized && Array.isArray(body.storyboard) && body.storyboard.length;
      if (!storyboardReady) {
        job.memoryGuard.stage = 'storyboard';
        job.phase = `${providerName} 生成导演分镜`;
        job.progress = 5;
        const result = await createStoryboard({ prompt: prepared.prompt, duration: body.duration, preferAI: true });
        prepared.storyboard = result.storyboard;
        prepared.storyboardSource = result.source;
        appendJobLog(job, `[显存保护] 分镜已完成 · ${result.source === 'api-director' ? providerName : '本地模板兜底'}`);
        if (result.warning) appendJobLog(job, `[显存保护] ${result.warning}`);
      } else {
        appendJobLog(job, '[显存保护] 复用已经完成的 AI 分镜，不重复占用显存');
      }
      if (job.cancelRequested) throw new Error('任务已取消');
    }
  }

  job.memoryGuard.stage = 'release-local-model';
  job.phase = `释放 ${providerName} 显存`;
  job.progress = 6;
  const release = await promptApi.releaseLocalModel(config, { timeoutMs: 30000 });
  job.memoryGuard.modelReleased = release.released;
  job.memoryGuard.releaseAttempted = release.attempted;
  if (release.released) appendJobLog(job, `[显存保护] ${providerName} 模型已卸载`);
  else if (release.attempted) appendJobLog(job, `[显存保护] ${providerName} 自动卸载未成功，将通过显存阈值决定是否继续：${release.reason}`);
  else appendJobLog(job, `[显存保护] ${providerName} 没有通用卸载接口，将检测空闲显存后再启动视频模型`);

  job.memoryGuard.stage = 'wait-vram';
  job.phase = '等待显存稳定';
  job.progress = 7;
  const vram = await waitForVram(readGpuState, {
    engine: body.engine === 'q2' ? 'q2' : 'int8',
    presetId: resolvedOptimization.id,
    timeoutMs: 20000,
  });
  job.memoryGuard.freeVramMb = vram.freeMb;
  job.memoryGuard.requiredVramMb = vram.requiredMb;
  job.memoryGuard.waitedMs = vram.waitedMs;
  if (!vram.ok) {
    throw new Error(`显存保护已阻止启动：当前仅空闲 ${vram.freeMb}MB，需要至少 ${vram.requiredMb}MB。请在 ${providerName} 中卸载模型或关闭其服务后重试`);
  }
  appendJobLog(job, vram.available
    ? `[显存保护] 显存已稳定 · 空闲 ${vram.freeMb}MB / 最低 ${vram.requiredMb}MB`
    : '[显存保护] 未检测到 NVIDIA 显存计数器，按当前 CPU/兼容方案继续');
  job.memoryGuard.stage = 'prepared';
  job.memoryGuard.prepared = true;
  job.memoryGuard.promptOptimized = optimized || body.promptOptimizedByAi === true;
  return prepared;
}

function finishPreparation(job, error) {
  job.finishedAt = Date.now();
  if (job.cancelRequested || /已取消/.test(error.message)) {
    job.status = 'cancelled';
    job.phase = '已取消';
    job.error = null;
  } else {
    job.status = 'failed';
    job.phase = '显存保护已停止任务';
    job.error = error.message;
    appendJobLog(job, error.stack || error.message);
  }
  history.unshift(publicJob(job));
  saveHistory();
  syncWorkflowJob(job);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cloudJobSnapshot(job) {
  return {
    id: job.id,
    status: job.status,
    engine: job.engine,
    providerId: job.providerId,
    providerLabel: job.providerLabel,
    providerModel: job.providerModel,
    remoteTaskId: job.remoteTaskId,
    remote: job.remote || {},
    rawRemoteStatus: job.rawRemoteStatus || '',
    phase: job.phase,
    progress: job.progress,
    logs: job.logs || [],
    startedAt: job.startedAt,
    projectId: job.projectId || '',
    outputName: job.outputName,
    outputPath: job.outputPath,
    prompt: job.prompt,
    width: job.width,
    height: job.height,
    outputWidth: job.outputWidth,
    outputHeight: job.outputHeight,
    duration: job.duration,
    steps: job.steps,
    continuityMode: job.continuityMode || 'cut',
    generateAudio: job.generateAudio !== false,
    seed: job.seed,
    frames: job.frames,
    ratio: job.ratio,
    voice: job.voice,
    screenplay: job.screenplay,
    timeline: job.timeline,
    generateAudio: job.generateAudio,
    storyboard: job.storyboard,
  };
}

function persistCloudJob(job) {
  if (job.remoteTaskId && job.status === 'running') pendingVideoJobStore.upsert(cloudJobSnapshot(job));
  else pendingVideoJobStore.remove(job.id);
}

function finishCloudJob(job) {
  job.finishedAt ||= Date.now();
  persistCloudJob(job);
  history = history.filter((item) => item.id !== job.id);
  history.unshift(publicJob(job));
  saveHistory();
  syncWorkflowJob(job);
}

async function runFfmpegForCloud(args) {
  if (!existsOver(comfy.ffmpeg)) throw new Error('云端视频配音需要 FFmpeg，请先安装本地高质量环境');
  await new Promise((resolve, reject) => {
    const child = spawn(comfy.ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorText = '';
    child.stderr.on('data', (chunk) => { errorText = `${errorText}${chunk}`.slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`云端视频配音失败：${errorText || `退出码 ${code}`}`)));
  });
}

async function applyCloudVoice(job) {
  if (!job.voice?.enabled) return;
  const cues = normalizeScriptTimeline(job.timeline, job.screenplay, job.duration, job.voice.profileId).cues;
  if (!cues.length) return;
  if (!voice.ready()) {
    appendJobLog(job, '[后期配音] 剧本包含台词，但 CosyVoice 尚未安装，保留厂商环境音轨');
    return;
  }
  const mixed = path.join(UPLOAD_DIR, `${job.id}-cloud-voiced.mp4`);
  const voiceFiles = [];
  appendJobLog(job, `[后期配音] Natural Prosody 2.0 按剧本声音轴生成 ${cues.length} 段角色语音`);
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const wav = path.join(UPLOAD_DIR, `${job.id}-cloud-cue-${String(index + 1).padStart(3, '0')}.wav`);
    await voice.synthesize(cue.text, cue.voiceProfileId || job.voice.profileId, wav, {
      onLog: (text) => appendJobLog(job, text), instruction: job.voice.instruction,
      speed: job.voice.speed, pauseScale: job.voice.pauseScale, variation: job.voice.variation,
    });
    voiceFiles.push({ wav, delay: Math.max(0, Math.round((cue.start || 0) * 1000)) });
  }
  const hasNativeAudio = PROVIDER_PRESETS[job.providerId]?.capabilities.nativeAudio && job.generateAudio;
  const common = ['-y', '-hide_banner', '-loglevel', 'warning', '-i', job.outputPath, ...voiceFiles.flatMap((item) => ['-i', item.wav])];
  const voiceFilters = voiceFiles.map((item, index) => `[${index + 1}:a]volume=${job.voice.speechVolume},adelay=${item.delay}|${item.delay}[speech${index}]`);
  const speechInputs = voiceFiles.map((_, index) => `[speech${index}]`).join('');
  const speechMix = `${speechInputs}amix=inputs=${voiceFiles.length}:duration=longest:dropout_transition=0,apad=pad_dur=${job.duration}[speech]`;
  if (hasNativeAudio) {
    try {
      await runFfmpegForCloud([...common,
        '-filter_complex', [...voiceFilters, speechMix, `[0:a]volume=${job.voice.nativeAudioVolume}[amb];[amb][speech]amix=inputs=2:duration=first:dropout_transition=0,aresample=async=1:first_pts=0[a]`].join(';'),
        '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(job.duration), '-movflags', '+faststart', mixed,
      ]);
    } catch (error) {
      appendJobLog(job, `[语音] 厂商结果没有可混合音轨，改为直接加入中文对白：${error.message}`);
      await runFfmpegForCloud([...common, '-filter_complex', [...voiceFilters, speechMix.replace('[speech]', '[a]')].join(';'), '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(job.duration), '-movflags', '+faststart', mixed]);
    }
  } else {
    await runFfmpegForCloud([...common, '-filter_complex', [...voiceFilters, speechMix.replace('[speech]', '[a]')].join(';'), '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(job.duration), '-movflags', '+faststart', mixed]);
  }
  fs.copyFileSync(mixed, job.outputPath);
  try { fs.unlinkSync(mixed); } catch {}
  for (const item of voiceFiles) { try { fs.unlinkSync(item.wav); } catch {} }
  appendJobLog(job, '[后期配音] 已将剧本台词合成到画面成片');
}

async function runCloudLifecycle(job, adapter, createSettings = null) {
  try {
    if (createSettings) {
      job.phase = `提交到${job.providerLabel}`;
      job.progress = 3;
      appendJobLog(job, `[云端] 正在提交 ${job.providerLabel} · ${job.providerModel}`);
      const remote = await adapter.createTask(createSettings);
      if (job.cancelRequested) throw new Error('任务已取消');
      job.remoteTaskId = remote.taskId;
      job.remote = remote;
      job.rawRemoteStatus = remote.rawStatus || remote.status;
      appendJobLog(job, `[云端] 厂商任务已创建，本机任务号 ${job.id}`);
      persistCloudJob(job);
    } else {
      appendJobLog(job, '[恢复] 应用重启后已恢复云端任务轮询');
    }

    while (!job.cancelRequested) {
      let state;
      try {
        state = await adapter.getTask(job.remoteTaskId, job.remote || {});
        job.pollErrors = 0;
      } catch (error) {
        job.pollErrors = (job.pollErrors || 0) + 1;
        job.phase = `网络波动，等待恢复（${job.pollErrors}/20）`;
        appendJobLog(job, `[重试] 暂时无法查询厂商任务：${error.message}`);
        persistCloudJob(job);
        if (job.pollErrors >= 20) throw new Error(`连续 20 次无法查询云端任务：${error.message}`);
        await delay(Math.min(60000, 5000 * job.pollErrors));
        continue;
      }
      job.rawRemoteStatus = state.rawStatus || state.status;
      if (state.status === 'failed') throw new Error(state.error || `${job.providerLabel}生成失败`);
      if (state.status === 'cancelled') throw new Error('任务已取消');
      if (state.status === 'completed') {
        if (!state.resultUrl) throw new Error(`${job.providerLabel}任务已完成，但没有返回视频下载地址`);
        job.phase = '下载云端生成结果';
        job.progress = 94;
        persistCloudJob(job);
        await adapter.downloadResult(state, job.outputPath);
        job.phase = '保留原生环境音轨';
        job.progress = 97;
        job.status = 'completed';
        job.phase = '已完成';
        job.progress = 100;
        job.finishedAt = Date.now();
        appendJobLog(job, `[完成] 视频已安全保存到本机作品目录：${job.outputName}`);
        finishCloudJob(job);
        return;
      }
      job.phase = state.status === 'queued' ? `${job.providerLabel}排队中` : `${job.providerLabel}生成中`;
      const remoteProgress = Number(state.progress);
      job.progress = Number.isFinite(remoteProgress) && remoteProgress > 0 ? Math.min(92, 8 + remoteProgress * 0.84) : Math.min(90, Math.max(job.progress || 8, 12));
      persistCloudJob(job);
      await delay(5000);
    }
    throw new Error('任务已取消');
  } catch (error) {
    job.finishedAt = Date.now();
    if (job.cancelRequested || /已取消/.test(error.message)) {
      job.status = 'cancelled'; job.phase = '已取消'; job.error = null;
    } else {
      job.status = 'failed'; job.phase = '云端生成失败'; job.error = error.message;
      appendJobLog(job, error.stack || error.message);
    }
    finishCloudJob(job);
  }
}

function startCloudGeneration(body) {
  ensureGenerationEngine(body);
  const settings = normalizeSettings(body);
  const providerId = settings.engine;
  const config = videoProviderStore.load().providers[providerId];
  const adapter = videoProviders.get(providerId);
  adapter.validateSettings({ ...settings, firstImage: body.firstImage, lastImage: body.lastImage });
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const outputName = `${providerId}-${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(-6)}.mp4`;
  const job = {
    id, status: 'running', engine: providerId, providerId, providerLabel: PROVIDER_PRESETS[providerId].label,
    providerModel: config.model, phase: '准备云端任务', progress: 1, logs: [], startedAt: Date.now(),
    outputName, outputPath: path.join(OUTPUT_DIR, outputName), projectId: String(body.projectId || '').replace(/[^a-zA-Z0-9-]/g, ''),
    ...settings,
  };
  activeJob = job;
  syncWorkflowJob(job);
  Promise.resolve().then(() => runCloudLifecycle(job, adapter, { ...settings, firstImage: body.firstImage, lastImage: body.lastImage }));
  return publicJob(job);
}

function resumePendingCloudJobs() {
  const pending = pendingVideoJobStore.load().filter((job) => job.status === 'running' && job.remoteTaskId);
  if (!pending.length || activeJob?.status === 'running') return;
  const job = pending[0];
  try {
    const config = videoProviderStore.load().providers[job.providerId];
    const adapter = videoProviders.get(job.providerId);
    adapter.validateConfiguration();
    job.logs ||= [];
    job.phase = '恢复云端任务';
    activeJob = job;
    runCloudLifecycle(job, adapter);
  } catch (error) {
    job.status = 'paused';
    job.phase = '等待补全云端凭据后恢复';
    job.error = error.message;
    activeJob = job;
  }
}

function safePlatformJobId(value) {
  const id = String(value || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!id) throw new Error('平台任务编号无效');
  return id;
}

function platformJobDirectory(jobId) {
  return path.join(PLATFORM_HANDOFF_DIR, safePlatformJobId(jobId));
}

function platformJobSnapshot(job) {
  return {
    ...cloudJobSnapshot(job),
    handoff: job.handoff || null,
    currentShotIndex: Number(job.currentShotIndex) || 0,
    shotFiles: Array.isArray(job.shotFiles) ? job.shotFiles : [],
    exchangeAssets: job.exchangeAssets || {},
  };
}

function persistPlatformJob(job) {
  if (job.status === 'running') pendingPlatformJobStore.upsert(platformJobSnapshot(job));
  else pendingPlatformJobStore.remove(job.id);
}

function platformAction(job) {
  const index = Math.max(0, Number(job.currentShotIndex) || 0);
  const shot = job.storyboard[index] || { id: index + 1, title: `镜头 ${index + 1}`, seconds: job.duration, prompt: job.prompt };
  const platformDuration = Number(shot.seconds) <= 5 ? 5 : 10;
  return {
    actionId: `${job.id}:${index + 1}:${Number(job.handoff?.attempt || 0) + 1}`,
    jobId: job.id,
    providerId: job.providerId,
    providerLabel: job.providerLabel,
    platformUrl: PROVIDER_PRESETS[job.providerId].platformUrl,
    prompt: visualOnlyPrompt(shot.prompt || job.prompt),
    title: shot.title || `镜头 ${index + 1}`,
    shotNumber: index + 1,
    totalShots: job.storyboard.length,
    duration: platformDuration,
    targetDuration: Number(shot.seconds) || platformDuration,
    ratio: job.ratio,
    width: job.width,
    height: job.height,
    assetNames: index === 0 ? job.exchangeAssets : {},
    armedAt: new Date().toISOString(),
    attempt: Number(job.handoff?.attempt || 0) + 1,
  };
}

function armPlatformShot(job) {
  const action = platformAction(job);
  job.handoff = action;
  job.segment = action.shotNumber;
  job.segments = action.totalShots;
  job.shotProgress = 0;
  job.progress = Math.max(4, Math.round(((action.shotNumber - 1) / action.totalShots) * 88));
  job.phase = `等待在${job.providerLabel.replace('平台协作', '')}完成镜头 ${action.shotNumber}/${action.totalShots}`;
  appendJobLog(job, `[平台协作] 镜头 ${action.shotNumber}/${action.totalShots} 已准备 · ${action.duration} 秒 · ${action.ratio}`);
  persistPlatformJob(job);
  syncWorkflowJob(job);
  return action;
}

function savePlatformReference(dataUrl, label, jobId) {
  const source = saveDataImage(dataUrl, label, `${safePlatformJobId(jobId)}-platform`);
  if (!source) return '';
  const name = `${label === '首帧' ? 'first-frame' : 'last-frame'}${path.extname(source)}`;
  const target = path.join(platformJobDirectory(jobId), name);
  fs.copyFileSync(source, target);
  return name;
}

function startPlatformGeneration(body) {
  ensureGenerationEngine(body);
  const settings = normalizeSettings(body);
  const providerId = settings.engine;
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const outputName = `${providerId}-${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(-6)}.mp4`;
  fs.mkdirSync(platformJobDirectory(id), { recursive: true });
  const exchangeAssets = {
    first: savePlatformReference(body.firstImage, '首帧', id),
    last: savePlatformReference(body.lastImage, '尾帧', id),
  };
  const job = {
    id, status: 'running', engine: providerId, providerId, providerLabel: PROVIDER_PRESETS[providerId].label,
    providerModel: PROVIDER_PRESETS[providerId].model, phase: '准备平台协作', progress: 1, logs: [], startedAt: Date.now(),
    outputName, outputPath: path.join(OUTPUT_DIR, outputName), projectId: String(body.projectId || '').replace(/[^a-zA-Z0-9-]/g, ''),
    currentShotIndex: 0, shotFiles: [], exchangeAssets, ...settings,
  };
  activeJob = job;
  armPlatformShot(job);
  return publicJob(job);
}

async function assemblePlatformShots(job) {
  const files = job.shotFiles.map((item) => item.cachedPath).filter((file) => fs.existsSync(file));
  if (!files.length) throw new Error('没有可用于合片的平台视频');
  if (files.length === 1) {
    if (job.generateAudio === false) {
      if (!existsOver(comfy.ffmpeg)) throw new Error('纯画面无音轨输出需要 FFmpeg');
      await runFfmpegForCloud(['-y', '-hide_banner', '-loglevel', 'warning', '-i', files[0], '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', job.outputPath]);
    } else fs.copyFileSync(files[0], job.outputPath);
    return;
  }
  if (!existsOver(comfy.ffmpeg)) throw new Error('多镜头平台视频已全部接回，但最终合片需要 FFmpeg；请先完成本地高质量环境准备后重试');
  if (!existsOver(comfy.ffprobe)) throw new Error('多镜头平台视频需要 FFprobe 识别并保留环境音轨');
  const width = Number(job.outputWidth || job.width) || 1280;
  const height = Number(job.outputHeight || job.height) || 720;
  const audioStreams = job.generateAudio === false ? files.map(() => false) : await Promise.all(files.map((file) => new Promise((resolve, reject) => {
    execFile(comfy.ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { windowsHide: true, timeout: 30000 }, (error, stdout) => {
      if (error) return reject(new Error(`无法检查平台视频音轨：${error.message}`));
      resolve(Boolean(String(stdout || '').trim()));
    });
  })));
  const filters = files.map((_, index) => {
    const seconds = Math.max(1, Number(job.storyboard[index]?.seconds) || 5);
    return `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=24,format=yuv420p,trim=duration=${seconds},setpts=PTS-STARTPTS[v${index}]`;
  });
  if (job.generateAudio !== false) files.forEach((_, index) => {
    const seconds = Math.max(1, Number(job.storyboard[index]?.seconds) || 5);
    filters.push(audioStreams[index]
      ? `[${index}:a]atrim=duration=${seconds},asetpts=PTS-STARTPTS,aresample=48000[a${index}]`
      : `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${seconds},asetpts=PTS-STARTPTS[a${index}]`);
  });
  filters.push(job.generateAudio === false
    ? `${files.map((_, index) => `[v${index}]`).join('')}concat=n=${files.length}:v=1:a=0[v]`
    : `${files.map((_, index) => `[v${index}][a${index}]`).join('')}concat=n=${files.length}:v=1:a=1[v][a]`);
  const args = [
    '-y', '-hide_banner', '-loglevel', 'warning', ...files.flatMap((file) => ['-i', file]),
    '-filter_complex', filters.join(';'), '-map', '[v]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
  ];
  if (job.generateAudio === false) args.push('-an');
  else args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart', job.outputPath);
  await runFfmpegForCloud(args);
}

async function finalizePlatformJob(job) {
  try {
    job.handoff = null;
    job.phase = '整理平台视频并进入后期';
    job.progress = 92;
    persistPlatformJob(job);
    syncWorkflowJob(job);
    await assemblePlatformShots(job);
    job.phase = '保留平台环境音轨';
    job.progress = 97;
    job.status = 'completed';
    job.phase = '已完成';
    job.progress = 100;
    job.finishedAt = Date.now();
    appendJobLog(job, `[完成] 平台视频已自动接回并保存：${job.outputName}`);
  } catch (error) {
    job.status = 'failed';
    job.phase = '平台视频后期处理失败';
    job.error = error.message;
    job.finishedAt = Date.now();
    appendJobLog(job, error.stack || error.message);
  }
  pendingPlatformJobStore.remove(job.id);
  history = history.filter((item) => item.id !== job.id);
  history.unshift(publicJob(job));
  saveHistory();
  syncWorkflowJob(job);
}

function hashPlatformFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function importPlatformVideo(body) {
  if (!activeJob || !PLATFORM_PROVIDER_IDS.includes(activeJob.engine) || activeJob.status !== 'running') throw new Error('当前没有等待接回的平台任务');
  if (safePlatformJobId(body.jobId) !== activeJob.id) throw new Error('平台任务已变化，请返回 LocalFrame 查看当前镜头');
  const fileName = path.basename(String(body.fileName || ''));
  if (!fileName || fileName !== String(body.fileName || '') || !/\.(mp4|mov|webm)$/i.test(fileName)) throw new Error('请选择 MP4、MOV 或 WebM 视频');
  const inbox = path.resolve(PLATFORM_INBOX_DIR, activeJob.id);
  const source = path.resolve(inbox, fileName);
  if (!source.startsWith(inbox + path.sep) || !fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error('待接回的视频不存在或已移动');
  const stat = fs.statSync(source);
  if (stat.size < 1024 || stat.size > 2 * 1024 * 1024 * 1024) throw new Error('平台视频文件为空或超过 2GB 安全限制');
  let info = { duration: 0, width: 0, height: 0 };
  if (existsOver(comfy.ffprobe)) info = await probeVideo(source);
  const hash = await hashPlatformFile(source);
  if (activeJob.shotFiles.some((item) => item.hash === hash)) throw new Error('这个视频已经接回，无需重复导入');
  const shotNumber = Number(activeJob.currentShotIndex) + 1;
  const cachedName = `shot-${String(shotNumber).padStart(3, '0')}-source${path.extname(fileName).toLowerCase()}`;
  const cachedPath = path.join(platformJobDirectory(activeJob.id), cachedName);
  fs.copyFileSync(source, cachedPath);
  try { fs.unlinkSync(source); } catch {}
  activeJob.shotFiles.push({ shotId: shotNumber, sourceName: fileName, cachedName, cachedPath, hash, size: stat.size, ...info });
  appendJobLog(activeJob, `[自动接回] 镜头 ${shotNumber}/${activeJob.storyboard.length} · ${fileName}${info.duration ? ` · ${info.duration.toFixed(1)} 秒` : ''}`);
  activeJob.shotProgress = 100;
  activeJob.currentShotIndex += 1;
  if (activeJob.currentShotIndex < activeJob.storyboard.length) {
    armPlatformShot(activeJob);
  } else {
    activeJob.handoff = null;
    activeJob.progress = 92;
    activeJob.phase = '全部镜头已接回，正在自动合片';
    persistPlatformJob(activeJob);
    syncWorkflowJob(activeJob);
    Promise.resolve().then(() => finalizePlatformJob(activeJob));
  }
  return publicJob(activeJob);
}

function resumePendingPlatformJobs() {
  if (activeJob?.status === 'running') return;
  const job = pendingPlatformJobStore.load().find((item) => item.status === 'running' && PLATFORM_PROVIDER_IDS.includes(item.providerId));
  if (!job) return;
  job.logs ||= [];
  activeJob = job;
  if (job.handoff) {
    job.phase = `已恢复平台协作 · 等待镜头 ${job.handoff.shotNumber}/${job.handoff.totalShots}`;
    appendJobLog(job, '[恢复] 已恢复平台协作队列和当前镜头');
    syncWorkflowJob(job);
  } else if (job.shotFiles?.length === job.storyboard?.length) {
    Promise.resolve().then(() => finalizePlatformJob(job));
  }
}

function startGenerationPipeline(body) {
  if (PLATFORM_PROVIDER_IDS.includes(body.engine)) return startPlatformGeneration(body);
  if (REMOTE_PROVIDER_IDS.includes(body.engine)) return startCloudGeneration(body);
  const config = loadPromptProvider();
  if (!promptApi.isSameDeviceProvider(config)) return startGeneration(body);
  ensureGenerationEngine(body);
  const settings = normalizeSettings(body);
  const job = {
    id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    status: 'running', engine: settings.engine, phase: '启动显存防崩溃系统', progress: 1,
    logs: [], startedAt: Date.now(), optimization: resolvedOptimization.id,
    projectId: String(body.projectId || '').replace(/[^a-zA-Z0-9-]/g, ''), ...settings,
  };
  activeJob = job;
  syncWorkflowJob(job);
  Promise.resolve()
    .then(() => prepareLocalGeneration(body, job, config))
    .then((prepared) => {
      if (job.cancelRequested) throw new Error('任务已取消');
      startGeneration(prepared, job);
    })
    .catch((error) => finishPreparation(job, error));
  return publicJob(job);
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    prompt: job.prompt,
    width: job.width,
    height: job.height,
    frames: job.frames,
    duration: job.duration,
    storyboard: job.storyboard,
    engine: job.engine,
    providerId: job.providerId || (job.engine === 'q2' ? 'local-h3-q2' : job.engine === 'int8' ? 'local-h3-int8' : null),
    providerLabel: job.providerLabel || null,
    providerModel: job.providerModel || null,
    rawRemoteStatus: job.rawRemoteStatus || null,
    cloud: REMOTE_PROVIDER_IDS.includes(job.engine),
    platform: PLATFORM_PROVIDER_IDS.includes(job.engine),
    handoff: job.handoff || null,
    optimization: job.optimization || null,
    segment: job.segment || null,
    segments: job.segments || null,
    recoveredShots: job.recoveredShots || 0,
    shotProgress: job.shotProgress || 0,
    samplingStep: job.samplingStep || 0,
    samplingSteps: job.samplingSteps || job.steps || 0,
    pauseAfterShot: job.pauseAfterShot === true,
    recoveryLevel: job.recoveryLevel || null,
    recoveryLevels: job.recoveryLevels || null,
    memoryGuard: job.memoryGuard || null,
    outputWidth: job.outputWidth || job.width,
    outputHeight: job.outputHeight || job.height,
    enhancement: job.enhancement || { mode: 'none', profile: 'balanced' },
    nativeOutputName: job.nativeOutputName || null,
    steps: job.steps,
    seed: job.seed,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
    elapsedSeconds: Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000),
    outputName: job.outputName || null,
    projectId: job.projectId || null,
    error: job.error || null,
    logs: job.logs.slice(-160),
  };
}

function startQ2Generation(body, preparedJob = null) {
  if (activeJob && activeJob.status === 'running' && activeJob !== preparedJob) throw new Error('已有任务正在生成，请等待完成或先取消');
  if (!q2Ready()) throw new Error('Q2 兼容运行时或模型文件缺失，请检查安装');

  const settings = normalizeSettings(body);
  const id = preparedJob?.id || `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const outputName = `H3-${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(-6)}.webm`;
  const outputPath = path.join(OUTPUT_DIR, outputName);
  const firstImage = saveDataImage(body.firstImage, '首帧', id);
  const lastImage = saveDataImage(body.lastImage, '尾帧', id);

  const args = [
    '--mode', 'vid_gen',
    '--diffusion-model', MODELS.diffusion,
    '--llm', MODELS.encoder,
    '--vae', MODELS.videoVae,
    '--audio-vae', MODELS.audioVae,
    '--prompt', settings.prompt,
    '--cfg-scale', '1.0',
    '--width', String(settings.width),
    '--height', String(settings.height),
    '--video-frames', String(settings.frames),
    '--steps', String(settings.steps),
    '--seed', String(settings.seed),
    '--fps', '24',
    ...buildQ2Args(resolvedOptimization, hardwareCache, { cpuThreads: hardwareCache?.cpuCores }),
    '--output', outputPath,
    '--verbose',
  ];
  if (firstImage) args.push('--init-img', firstImage);
  if (lastImage) args.push('--end-img', lastImage);

  const job = preparedJob || {};
  Object.assign(job, {
    id,
    status: 'running',
    phase: '载入模型',
    progress: 4,
    logs: job.logs || [],
    outputName,
    outputPath,
    firstImage,
    lastImage,
    startedAt: job.startedAt || Date.now(),
    ...settings,
    engine: 'q2',
    optimization: resolvedOptimization.id,
    projectId: String(body.projectId || job.projectId || '').replace(/[^a-zA-Z0-9-]/g, ''),
  });
  if (job.memoryGuard) job.memoryGuard.stage = 'video-generation';

  const child = spawn(RUNTIME, args, {
    cwd: ROOT_DIR,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  job.child = child;
  activeJob = job;
  syncWorkflowJob(job);

  child.stdout.on('data', (chunk) => updateProgress(job, chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => updateProgress(job, chunk.toString('utf8')));
  child.on('error', (error) => {
    job.error = error.message;
  });
  child.on('close', (code, signal) => {
    job.finishedAt = Date.now();
    if (job.cancelRequested) {
      job.status = 'cancelled';
      job.phase = '已取消';
      job.error = null;
    } else if (code === 0 && fs.existsSync(outputPath)) {
      job.status = 'completed';
      job.phase = '已完成';
      job.progress = 100;
    } else {
      job.status = 'failed';
      job.phase = '生成失败';
      job.error = job.error || `生成程序退出码 ${code}${signal ? `（${signal}）` : ''}`;
    }
    delete job.child;
    const stored = publicJob(job);
    history.unshift(stored);
    saveHistory();
    syncWorkflowJob(job);
  });

  return publicJob(job);
}

function appendJobLog(job, text) {
  for (const line of cleanLog(String(text)).split('\n').filter(Boolean)) {
    job.logs.push(line);
    if (job.logs.length > 320) job.logs.shift();
  }
}

function updateSamplingProgressFromLog(job, text) {
  job.samplingLogBuffer = `${job.samplingLogBuffer || ''}${String(text)}`.slice(-2048);
  const matches = [...job.samplingLogBuffer.matchAll(/(\d{1,3})%\|[^\r\n]*?\|\s*(\d+)\s*\/\s*(\d+)/g)];
  const match = matches.at(-1);
  if (!match) return;
  const step = Number(match[2]);
  const steps = Number(match[3]);
  if (!steps || step < 0 || step > steps) return;
  const shotProgress = Math.min(100, Math.max(0, (step / steps) * 100));
  job.shotProgress = Math.round(shotProgress * 10) / 10;
  job.samplingStep = step;
  job.samplingSteps = steps;
  const segment = Math.max(1, Number(job.segment) || 1);
  const segments = Math.max(1, Number(job.segments) || 1);
  const totalProgress = 8 + (((segment - 1) + shotProgress / 100) / segments) * 76;
  job.progress = Math.max(Number(job.progress) || 0, Math.round(totalProgress * 10) / 10);
  job.phase = `镜头 ${segment}/${segments} · 采样 ${step}/${steps}`;
}

function startInt8Generation(body, preparedJob = null) {
  if (activeJob && activeJob.status === 'running' && activeJob !== preparedJob) throw new Error('已有任务正在生成，请等待完成或先取消');
  if (!comfy.ready()) throw new Error('高质量 INT8 环境尚未完整安装，请在“环境与模型”中点击安装或继续下载');
  const settings = normalizeSettings({ ...body, engine: 'int8' });
  const id = preparedJob?.id || `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const recoveryId = crypto.createHash('sha256').update(JSON.stringify({
    prompt: settings.prompt,
    storyboard: settings.storyboard,
    duration: settings.duration,
    width: settings.width,
    height: settings.height,
    steps: settings.steps,
    seed: settings.seed,
    continuityMode: settings.continuityMode,
    generateAudio: settings.generateAudio,
    firstImage: body.firstImage || null,
    lastImage: body.lastImage || null,
  })).digest('hex').slice(0, 20);
  const firstImage = saveDataImage(body.firstImage, '首帧', id);
  const lastImage = saveDataImage(body.lastImage, '尾帧', id);
  const job = preparedJob || {};
  Object.assign(job, {
    id, status: 'running', engine: 'int8', phase: '启动 ComfyUI', progress: 8, logs: job.logs || [],
    firstImage, lastImage, recoveryId, startedAt: job.startedAt || Date.now(), optimization: resolvedOptimization.id, ...settings,
    projectId: String(body.projectId || job.projectId || '').replace(/[^a-zA-Z0-9-]/g, ''),
  });
  if (job.memoryGuard) job.memoryGuard.stage = 'video-generation';
  activeJob = job;
  syncWorkflowJob(job);

  comfy.runGeneration({ ...settings, firstImage, lastImage }, {
    jobId: id,
    recoveryId,
    outputDir: OUTPUT_DIR,
    onLog: (text) => {
      appendJobLog(job, text);
      updateSamplingProgressFromLog(job, text);
    },
    onProgress: (progress) => {
      job.phase = progress.phase || job.phase;
      if (Number.isFinite(Number(progress.progress))) job.progress = Math.max(Number(job.progress) || 0, Number(progress.progress));
      job.segment = progress.segment || job.segment;
      job.segments = progress.segments || job.segments;
      job.shotProgress = progress.shotProgress ?? job.shotProgress;
      job.samplingStep = progress.samplingStep ?? job.samplingStep;
      job.samplingSteps = progress.samplingSteps ?? job.samplingSteps;
      if (progress.resetSamplingLog) job.samplingLogBuffer = '';
      job.recoveryLevel = progress.recoveryLevel || job.recoveryLevel;
      job.recoveryLevels = progress.recoveryLevels || job.recoveryLevels;
      if (progress.recovered) job.recoveredShots = (job.recoveredShots || 0) + 1;
    },
    shouldPauseAfterShot: () => job.pauseAfterShot === true,
  }).then(async (nativeOutputPath) => {
    let outputPath = nativeOutputPath;
    if (settings.upscale && ['realesrgan', 'flashvsr'].includes(settings.enhancement?.mode)) {
      job.phase = settings.enhancement.mode === 'flashvsr' ? '等待显存释放后进行扩散二次采样' : '等待显存释放后进行 AI 清晰修复';
      job.progress = Math.max(job.progress, 93);
      await comfy.releaseModelsForPostprocess();
      outputPath = await qualityEnhancer.enhance(nativeOutputPath, settings, {
        onLog: (text) => appendJobLog(job, text),
        onProgress: (progress) => {
          job.phase = progress.phase || job.phase;
          if (Number.isFinite(Number(progress.progress))) job.progress = Math.max(Number(job.progress) || 0, Number(progress.progress));
        },
      });
      job.nativeOutputName = path.basename(nativeOutputPath);
    }
    job.finishedAt = Date.now();
    job.outputPath = outputPath;
    job.outputName = path.basename(outputPath);
    job.status = 'completed';
    job.phase = '已完成';
    job.progress = 100;
  }).catch((error) => {
    job.finishedAt = Date.now();
    if (job.cancelRequested || /已取消/.test(error.message)) {
      job.status = 'cancelled'; job.phase = '已取消'; job.error = null;
    } else if (/结束后安全暂停/.test(error.message)) {
      job.status = 'paused'; job.phase = error.message; job.error = null;
    } else {
      job.status = 'failed'; job.phase = '生成失败'; job.error = error.message;
      appendJobLog(job, error.stack || error.message);
    }
  }).finally(() => {
    history.unshift(publicJob(job));
    saveHistory();
    syncWorkflowJob(job);
  });
  return publicJob(job);
}

function startGeneration(body, preparedJob = null) {
  return videoProviders.get(body.engine).createTask(body, preparedJob);
}

function listHistory() {
  const files = new Map();
  for (const entry of fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(webm|mp4|avi)$/i.test(entry.name)) continue;
    const stat = fs.statSync(path.join(OUTPUT_DIR, entry.name));
    files.set(entry.name, { name: entry.name, size: stat.size, modifiedAt: stat.mtimeMs });
  }

  const merged = [];
  for (const job of history) {
    if (!job.outputName || !files.has(job.outputName)) continue;
    merged.push({ ...job, file: files.get(job.outputName) });
    files.delete(job.outputName);
  }
  for (const file of files.values()) merged.push({ status: 'completed', prompt: '本地生成视频', outputName: file.name, file });
  return merged.sort((a, b) => b.file.modifiedAt - a.file.modifiedAt).slice(0, 60);
}

function editorContext() {
  return {
    videos: listHistory().map((item) => ({
      name: item.outputName, size: item.file?.size || 0, modifiedAt: item.file?.modifiedAt || 0,
      projectId: item.projectId || '', label: item.projectId ? `${item.outputName} · 项目成片` : item.outputName,
    })),
    projects: workflowStore.list().map((project) => ({
      id: project.id, title: project.title, duration: project.duration, outputName: project.outputName || '', updatedAt: project.updatedAt,
    })),
  };
}

function safeOutputVideo(name) {
  const requested = String(name || '');
  const safe = path.basename(requested);
  if (!safe || safe !== requested || !/\.(mp4|webm|avi)$/i.test(safe)) throw new Error('请选择作品目录中的有效视频');
  const file = path.join(OUTPUT_DIR, safe);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('所选视频不存在或已移动');
  return file;
}

function deleteOutputVideo(name) {
  const file = safeOutputVideo(name);
  if (activeJob?.status === 'running' && activeJob.outputName === name) throw new Error('当前视频仍在生成，不能删除');
  fs.unlinkSync(file);
  if (activeJob?.outputName === name) activeJob = null;
  const previousLength = history.length;
  history = history.filter((item) => item.outputName !== name);
  if (history.length !== previousLength) saveHistory();
}

function probeVideo(file) {
  if (!existsOver(comfy.ffprobe)) throw new Error('字幕剪辑需要 FFmpeg，请先准备本地高质量环境');
  return new Promise((resolve, reject) => {
    execFile(comfy.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file], { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`无法读取视频信息：${String(stderr || error.message).trim()}`));
      try {
        const info = JSON.parse(stdout);
        const video = (info.streams || []).find((stream) => stream.codec_type === 'video') || {};
        resolve({
          duration: Number(info.format?.duration) || 0,
          width: Number(video.width) || 1920,
          height: Number(video.height) || 1080,
          hasAudio: (info.streams || []).some((stream) => stream.codec_type === 'audio'),
        });
      } catch { reject(new Error('无法解析视频信息')); }
    });
  });
}

function localEditorTimeline(screenplay, duration, defaultVoiceProfileId, voiceProfileBySpeaker = {}) {
  const extracted = buildScriptTimeline({ screenplay, duration, defaultVoiceProfileId, voiceProfileBySpeaker });
  let lines = extracted.cues;
  if (!lines.length) {
    const source = String(screenplay || '').replace(/\r/g, '').trim();
    const sentences = (source.match(/[^\n。！？!?；;]{3,80}[。！？!?；;]?/g) || [])
      .map((text) => text.replace(/^\s*(?:场\s*\d+[^\n]*|画面|剧情|动作|声音|镜头)\s*[：:]?\s*/i, '').trim())
      .filter(Boolean)
      .slice(0, Math.max(1, Math.min(24, Math.floor(duration / 2.8))));
    lines = sentences.flatMap((text) => splitSubtitleText(text, 22)).map((text) => ({ speaker: '旁白', kind: 'narration', text, voiceProfileId: defaultVoiceProfileId }));
  }
  if (!lines.length) return extracted;
  const window = Math.max(0.8, duration - 0.7);
  const cues = lines.map((line, index) => {
    const start = 0.35 + (window * index / lines.length);
    const spoken = Math.max(0.9, Math.min(5.8, Array.from(line.text).length / 4.2 + 0.35));
    return { ...line, start, end: Math.min(duration - 0.2, start + spoken) };
  });
  return { scriptHash: screenplayHash(screenplay), totalDuration: duration, cues: sanitizeTimelineCues(cues, duration, defaultVoiceProfileId) };
}

function editorStoryboardWindows(project, duration) {
  const shots = Array.isArray(project?.storyboard) ? project.storyboard : [];
  const plannedDuration = shots.reduce((sum, shot) => sum + Math.max(0, Number(shot?.seconds) || 0), 0);
  if (!shots.length || !plannedDuration) return [];
  const scale = duration / plannedDuration;
  let cursor = 0;
  return shots.map((shot, index) => {
    const start = cursor * scale;
    cursor += Math.max(0, Number(shot.seconds) || 0);
    return {
      shot: index + 1,
      start: Math.round(start * 100) / 100,
      end: Math.round(Math.min(duration, cursor * scale) * 100) / 100,
      title: String(shot.title || `镜头 ${index + 1}`).slice(0, 80),
      visual: stripSpokenContent(shot.prompt || '', 400).slice(0, 400),
    };
  });
}

async function createEditorDialogueTimeline(body) {
  if (!body.videoName) throw new Error('请先选择实际成片，再生成对应到秒的台词轴');
  const sourceFile = safeOutputVideo(body.videoName);
  const info = await probeVideo(sourceFile);
  const duration = Math.max(1, Math.min(4 * 60 * 60, Number(info.duration) || 0));
  const project = body.projectId ? workflowStore.load(body.projectId) : null;
  const screenplay = String(body.screenplay || project?.script?.screenplay || '').trim().slice(0, 60000);
  if (!screenplay) throw new Error('请粘贴剧本、故事大纲或对白内容');
  const defaultVoiceProfileId = String(body.voiceProfileId || project?.brief?.voiceProfileId || voice.loadSettings().profileId || 'female_narrator');
  const mappingProject = project || {
    timeline: { cues: [] }, script: { screenplay, outline: '' }, bible: {},
    brief: { duration, voiceProfileId: defaultVoiceProfileId },
  };
  const config = loadPromptProvider();
  const canUseAI = config.enabled && config.type === 'openai-compatible' && config.baseUrl && config.model;
  let rawCues = null;
  let source = 'local-postproduction';
  let warning = null;

  if (canUseAI && !(activeJob?.status === 'running' && promptApi.isSameDeviceProvider(config))) {
    try {
      if (promptApi.isSameDeviceProvider(config)) await comfy.freeMemory();
      const windows = editorStoryboardWindows(project, duration);
      const result = await promptApi.chat(config, [
        {
          role: 'system',
          content: `你是电影对白剪辑师。请根据真实成片时长和用户内容，生成精确到秒的中文台词时间轴，只返回 JSON 数组，不要 Markdown。每项严格使用 {"start":0.35,"end":5.31,"speaker":"旁白","kind":"narration","text":"台词"}。规则：所有时间在 0 到 ${duration.toFixed(3)} 秒内；按时间升序且不得重叠，相邻片段至少留 0.10 秒；单条通常 0.8–6 秒；中文约 3.5–5 字/秒；不要让台词填满整片，必须给环境声、动作声和呼吸留空；已有明确对白时优先保留原文，不得擅自改写人物关系；只有故事或大纲时，可生成简洁自然的旁白与对白；kind 只能是 dialogue 或 narration。`,
        },
        {
          role: 'user',
          content: `实际成片时长：${duration.toFixed(3)} 秒\n${windows.length ? `镜头窗口：\n${JSON.stringify(windows)}\n` : ''}剧本 / 故事内容：\n${screenplay}`,
        },
      ], { temperature: 0.32, maxTokens: 7000, timeoutMs: 240000 });
      rawCues = parseJsonContent(result.text);
      if (!Array.isArray(rawCues) || !rawCues.length) throw new Error('AI 没有返回可用台词');
      source = 'ai-postproduction';
    } catch (error) {
      warning = `AI 台词编排暂不可用，已使用本地时间轴：${error.message}`;
    }
  } else if (!canUseAI) {
    warning = '未连接文字模型，已使用本地时间轴；连接本地大语言模型后可按画面节奏智能编排。';
  } else {
    warning = '视频生成任务仍在运行，为避免争抢显存，本次使用本地时间轴且未中断生成。';
  }

  let timeline;
  if (rawCues) {
    const prepared = rawCues.map((cue) => ({
      ...cue,
      kind: /narration|旁白|画外音|解说/i.test(String(cue?.kind || cue?.speaker || '')) ? 'narration' : 'dialogue',
    }));
    const speakers = prepared.map((cue) => String(cue?.speaker || '').trim()).filter(Boolean);
    const voiceProfileBySpeaker = automaticVoiceMap(mappingProject, speakers);
    const cues = sanitizeTimelineCues(prepared, duration, defaultVoiceProfileId).map((cue) => ({
      ...cue,
      voiceProfileId: voiceProfileBySpeaker[cue.speaker] || defaultVoiceProfileId,
    }));
    timeline = { scriptHash: screenplayHash(screenplay), totalDuration: duration, cues };
  } else {
    const voiceProfileBySpeaker = automaticVoiceMap(mappingProject);
    timeline = localEditorTimeline(screenplay, duration, defaultVoiceProfileId, voiceProfileBySpeaker);
  }
  if (!timeline.cues.length) throw new Error('没有生成可用台词。请补充剧本、故事大纲或明确对白后重试。');
  const savedTimeline = { ...timeline, source, updatedAt: new Date().toISOString() };
  if (project) workflowStore.update(project.id, { timeline: savedTimeline });
  return { duration, source, warning, cues: savedTimeline.cues };
}

function subtitleSource(body, duration) {
  const project = body.projectId ? workflowStore.load(body.projectId) : null;
  const screenplay = String(body.screenplay || project?.script?.screenplay || '');
  const defaultVoiceProfileId = String(body.voiceProfileId || project?.brief?.voiceProfileId || voice.loadSettings().profileId || 'female_narrator');
  const storedTimeline = project?.timeline?.scriptHash === screenplayHash(screenplay) && project.timeline.cues?.length
    ? normalizeScriptTimeline(project.timeline, screenplay, duration, defaultVoiceProfileId)
    : buildScriptTimeline({ screenplay, duration, defaultVoiceProfileId });
  const timelineCues = Array.isArray(body.cues) && body.cues.length
    ? sanitizeTimelineCues(body.cues, duration, defaultVoiceProfileId)
    : storedTimeline.cues;
  const timeline = { scriptHash: screenplayHash(screenplay), totalDuration: duration, cues: timelineCues };
  const cues = timeline.cues.length
    ? timelineSubtitleCues(timeline.cues, body.includeSpeaker !== false, duration)
    : buildSubtitleCues({ screenplay, duration, includeSpeaker: body.includeSpeaker !== false });
  if (!cues.length) throw new Error('没有提取到台词。请在剧本中使用“角色：\u201c完整台词\u201d”或“旁白：内容”格式，也可以手动添加字幕。');
  const voiceCues = timeline.cues.map((cue) => ({
    start: cue.start, end: cue.end, text: cue.text, speaker: cue.speaker,
    kind: cue.kind, voiceProfileId: cue.voiceProfileId || defaultVoiceProfileId,
  })).filter((cue) => cue.text);
  return { project, timeline, cues, voiceCues, defaultVoiceProfileId };
}

function uniqueSubtitleOutput(videoName) {
  const preferred = subtitleOutputName(videoName);
  const parsed = path.parse(preferred);
  let candidate = preferred;
  let index = 2;
  while (fs.existsSync(path.join(OUTPUT_DIR, candidate))) {
    candidate = `${parsed.name}-${index}${parsed.ext}`;
    index += 1;
  }
  return candidate;
}

async function renderSubtitles(body) {
  if (activeJob?.status === 'running') throw new Error('视频生成期间暂不开始字幕渲染，请等待生成完成，避免争抢磁盘与编码资源');
  const source = safeOutputVideo(body.videoName);
  const info = await probeVideo(source);
  const { project, timeline, cues, voiceCues, defaultVoiceProfileId } = subtitleSource(body, info.duration || Number(body.duration) || 60);
  const outputName = uniqueSubtitleOutput(path.basename(source));
  const output = path.join(OUTPUT_DIR, outputName);
  const temp = `${output}.rendering.mp4`;
  const base = path.parse(outputName).name;
  const srtName = `${base}.srt`;
  const srt = path.join(OUTPUT_DIR, srtName);
  const ass = path.join(SUBTITLE_DIR, `${base}.ass`);
  const style = { ...(body.style || {}), playResX: info.width, playResY: info.height };
  fs.writeFileSync(srt, `\uFEFF${buildSrt(cues)}`, 'utf8');
  fs.writeFileSync(ass, `\uFEFF${buildAss(cues, style)}`, 'utf8');
  const addVoice = body.addVoice === true;
  const voiceFiles = [];
  try {
    if (addVoice) {
      if (!voice.ready()) throw new Error('后期配音需要 CosyVoice，请先在后期配音模块完成安装');
      const voiceSettings = voice.sanitizeSettings({ ...voice.loadSettings(), profileId: body.voiceProfileId || defaultVoiceProfileId, enabled: true });
      for (let index = 0; index < voiceCues.length; index += 1) {
        const cue = voiceCues[index];
        const wav = path.join(SUBTITLE_DIR, `${base}-voice-${String(index + 1).padStart(3, '0')}.wav`);
        await voice.synthesize(cue.text, cue.voiceProfileId || voiceSettings.profileId, wav, {
          instruction: voiceSettings.instruction,
          speed: voiceSettings.speed,
          pauseScale: voiceSettings.pauseScale,
          variation: voiceSettings.variation,
        });
        voiceFiles.push({ wav, delay: Math.max(0, Math.round(cue.start * 1000)) });
      }
    }
    await new Promise((resolve, reject) => {
      const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-i', source, ...voiceFiles.flatMap((item) => ['-i', item.wav])];
      args.push('-vf', `ass=filename='${escapeSubtitleFilterPath(ass)}'`);
      if (voiceFiles.length) {
        const speechFilters = voiceFiles.map((item, index) => `[${index + 1}:a]volume=1,adelay=${item.delay}|${item.delay}[speech${index}]`);
        const speechInputs = voiceFiles.map((_, index) => `[speech${index}]`).join('');
        const speechMix = `${speechInputs}amix=inputs=${voiceFiles.length}:duration=longest:dropout_transition=0,apad=pad_dur=${Math.ceil(info.duration || 60)}[speech]`;
        const audioFilter = info.hasAudio
          ? [...speechFilters, speechMix, '[0:a]volume=0.55[amb]', '[amb][speech]amix=inputs=2:duration=first:dropout_transition=0,aresample=async=1:first_pts=0[a]']
          : [...speechFilters, speechMix.replace('[speech]', '[a]')];
        args.push('-filter_complex', audioFilter.join(';'), '-map', '0:v:0', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
      } else if (info.hasAudio) {
        args.push('-map', '0:v:0', '-map', '0:a:0?', '-c:a', 'copy');
      } else {
        args.push('-map', '0:v:0', '-an');
      }
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', temp);
    const child = spawn(comfy.ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorText = '';
    child.stderr.on('data', (chunk) => { errorText = `${errorText}${chunk}`.slice(-6000); });
    child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`后期渲染失败：${errorText || `退出码 ${code}`}`)));
    });
    fs.renameSync(temp, output);
  } finally {
    for (const item of voiceFiles) { try { fs.unlinkSync(item.wav); } catch {} }
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {}
  }
  if (project) workflowStore.update(project.id, {
    timeline: { ...timeline, source: 'edited-postproduction', updatedAt: new Date().toISOString() },
  });
  const stat = fs.statSync(output);
  const item = {
    id: `editor-${Date.now()}`, status: 'completed', phase: addVoice ? '台词与字幕后期完成' : '字幕剪辑完成', progress: 100,
    prompt: addVoice ? 'LocalFrame 后期台 · 台词与字幕成片' : 'LocalFrame 后期台 · 剧本字幕成片', outputName, projectId: project?.id || '',
    startedAt: Date.now(), finishedAt: Date.now(), engine: 'editor',
  };
  history.unshift(item);
  saveHistory();
  return {
    outputName, url: `/media/${encodeURIComponent(outputName)}`, subtitleName: srtName,
    subtitleUrl: `/media/${encodeURIComponent(srtName)}`, cues: timeline.cues, subtitleCues: cues,
    voiceAdded: addVoice, file: { size: stat.size, modifiedAt: stat.mtimeMs },
  };
}

function serveFile(req, res, file, contentType) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const stat = fs.statSync(file);
  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? Number(match[1]) : 0;
    const end = match && match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) { res.writeHead(416); res.end(); return; }
    res.writeHead(206, {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function gpuInfo(callback) {
  execFile('nvidia-smi.exe', ['--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
    if (error) return callback(null);
    const parts = stdout.trim().split(',').map((item) => item.trim());
    callback({ name: parts[0], memoryTotal: Number(parts[1]), memoryUsed: Number(parts[2]), utilization: Number(parts[3]), temperature: Number(parts[4]) });
  });
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.webm': 'video/webm', '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.srt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const workflowCharacterMediaMatch = /^\/api\/workflow\/projects\/([^/]+)\/character-image\/([^/]+)$/.exec(url.pathname);
    const workflowMatch = /^\/api\/workflow\/projects\/([^/]+)(?:\/(script|timeline|storyboard|plan|produce|characters))?$/.exec(url.pathname);

    if (req.method === 'GET' && workflowCharacterMediaMatch) {
      const projectId = decodeURIComponent(workflowCharacterMediaMatch[1]);
      const fileName = path.basename(decodeURIComponent(workflowCharacterMediaMatch[2]));
      if (!/^[a-zA-Z0-9-]+-(front|side|back)\.(png|jpg|webp)$/.test(fileName)) throw new Error('角色参考图路径无效');
      workflowStore.load(projectId);
      const file = path.join(path.dirname(workflowStore.file(projectId)), 'characters', fileName);
      return serveFile(req, res, file, mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
    }

    if (req.method === 'GET' && url.pathname === '/api/workflow/projects') {
      return sendJson(res, 200, { projects: workflowStore.list() });
    }
    if (req.method === 'POST' && url.pathname === '/api/workflow/projects') {
      const body = await readJson(req, 256 * 1024);
      return sendJson(res, 201, { project: workflowStore.save(body) });
    }
    if (workflowMatch) {
      const projectId = decodeURIComponent(workflowMatch[1]);
      const action = workflowMatch[2] || '';
      if (req.method === 'GET' && !action) return sendJson(res, 200, { project: workflowStore.load(projectId) });
      if (req.method === 'PUT' && !action) {
        const body = await readJson(req, 512 * 1024);
        return sendJson(res, 200, { project: workflowStore.update(projectId, body) });
      }
      if (req.method === 'POST' && action === 'characters') {
        const body = await readJson(req, 48 * 1024 * 1024);
        const project = workflowStore.load(projectId);
        const requestedId = String(body.id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
        const characterId = requestedId || `character-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
        const existing = (project.characterModels || []).find((item) => item.id === characterId);
        const views = { ...(existing?.views || {}) };
        for (const view of ['front', 'side', 'back']) {
          const saved = saveWorkflowCharacterView(projectId, characterId, view, body.images?.[view]);
          if (saved) views[view] = saved;
        }
        const complete = Boolean(views.front && views.side && views.back);
        if (body.confirmed === true && !complete) throw new Error('请先上传角色正面、侧面和背面三张参考图');
        const character = {
          id: characterId,
          name: String(body.name || existing?.name || '未命名角色'),
          description: String(body.description || existing?.description || ''),
          views,
          confirmed: complete && body.confirmed === true,
          updatedAt: new Date().toISOString(),
        };
        const characterModels = (project.characterModels || []).filter((item) => item.id !== characterId);
        characterModels.push(character);
        const saved = workflowStore.update(projectId, { characterModels, currentStage: 'bible', status: 'planning' });
        return sendJson(res, 200, { project: saved, character: saved.characterModels.find((item) => item.id === characterId) });
      }
      if (req.method === 'POST' && action === 'script') {
        const project = workflowStore.load(projectId);
        if (!project.brief.idea) throw new Error('请先填写并保存核心创意');
        const generated = await createWorkflowScript(project);
        const saved = workflowStore.update(projectId, {
          status: 'planning', currentStage: 'script',
          script: {
            logline: generated.package.logline, outline: generated.package.outline,
            screenplay: generated.package.screenplay, source: generated.source,
          },
          bible: {
            characters: generated.package.characters, locations: generated.package.locations,
            visualRules: generated.package.visualRules, audioRules: generated.package.audioRules,
          },
          timeline: { source: '', scriptHash: '', updatedAt: '', totalDuration: 0, cues: [] },
        });
        return sendJson(res, 200, { project: saved, source: generated.source, warning: generated.warning || null });
      }
      if (req.method === 'POST' && action === 'timeline') {
        const project = workflowStore.load(projectId);
        if (!project.script.screenplay) throw new Error('请先生成或填写可拍摄剧本');
        const voiceProfileBySpeaker = automaticVoiceMap(project);
        const timeline = buildScriptTimeline({
          screenplay: project.script.screenplay,
          duration: project.brief.duration,
          defaultVoiceProfileId: project.brief.voiceProfileId || 'female_narrator',
          voiceProfileBySpeaker,
        });
        if (!timeline.cues.length) throw new Error('没有识别到真实台词。请使用“角色：\u201c完整台词\u201d”或“旁白：内容”格式。');
        const saved = workflowStore.update(projectId, {
          status: 'planning', currentStage: 'script',
          timeline: { ...timeline, source: 'auto-script', updatedAt: new Date().toISOString() },
        });
        return sendJson(res, 200, { project: saved, timeline: saved.timeline });
      }
      if (req.method === 'POST' && action === 'storyboard') {
        const project = workflowStore.load(projectId);
        if (!project.script.screenplay) throw new Error('请先生成或填写剧本与设定');
        const result = await createStoryboard({
          prompt: workflowStoryboardPrompt(project), duration: project.brief.duration, preferAI: true,
          maxShotSeconds: project.generation?.shotSeconds || 5,
          continuityMode: project.generation?.continuity || 'cut',
        });
        const saved = workflowStore.update(projectId, {
          status: 'planning', currentStage: 'storyboard', storyboard: result.storyboard, storyboardSource: result.source,
          production: { plan: null, lastError: '' },
        });
        return sendJson(res, 200, { project: saved, source: result.source, warning: result.warning || null });
      }
      if (req.method === 'POST' && action === 'plan') {
        const project = workflowStore.load(projectId);
        if (!project.storyboard.length) throw new Error('请先完成导演分镜');
        const plan = buildWorkflowPlan(project, await optimizationState());
        const saved = workflowStore.update(projectId, {
          status: 'ready', currentStage: 'plan', production: { plan, lastError: '' },
        });
        return sendJson(res, 200, { project: saved, plan });
      }
      if (req.method === 'POST' && action === 'produce') {
        const project = workflowStore.load(projectId);
        const plan = project.production.plan || buildWorkflowPlan(project, await optimizationState());
        if (!project.storyboard.length) throw new Error('请先完成导演分镜');
        const localPlan = plan.engine === 'int8' || plan.engine === 'q2';
        if (localPlan && !plan.environmentReady) throw new Error(plan.engine === 'int8'
          ? '高质量环境尚未就绪，请先点击“准备生成环境”，安装完成后再次开始生产'
          : 'Q2 兼容运行时尚未就绪，请先返回快速创作完成模型安装');
        if (plan.engine === 'q2' && project.brief.duration > 10) throw new Error('当前硬件只适合 Q2 预览，单次最多 10 秒；高质量长片需要 NVIDIA 显卡和 INT8 环境');
        const enhancementState = qualityEnhancer.status();
        if (project.brief.delivery === '2k' && plan.enhancement?.mode === 'none') throw new Error('2K 交付需要明确选择 Lanczos、Real-ESRGAN 或 FlashVSR 二次修复');
        if (['realesrgan', 'flashvsr'].includes(plan.enhancement?.mode) && !enhancementState.modes[plan.enhancement.mode].ready) {
          throw new Error(`${enhancementState.modes[plan.enhancement.mode].label} 尚未安装完整后端或权重，请先完成安装或改选 Lanczos`);
        }
        if (localPlan && plan.presetId !== resolvedOptimization.id) {
          saveOptimizationPreferences({ ...optimizationPreferences, presetId: plan.presetId });
          await comfy.restart();
        }
        const prompt = workflowStoryboardPrompt(project);
        const job = startGenerationPipeline({
          projectId, prompt, screenplay: project.script.screenplay, timeline: project.timeline, engine: plan.engine, width: plan.width, height: plan.height,
          outputWidth: plan.outputWidth, outputHeight: plan.outputHeight, upscale: plan.upscale,
          enhancement: plan.enhancement,
          duration: plan.duration, frames: plan.frames, steps: plan.steps, seed: plan.seed, randomSeed: false,
          shotSeconds: plan.shotSeconds, continuityMode: plan.continuityMode,
          generateAudio: plan.audioMode === 'ambience',
          storyboard: project.storyboard, directorMode: true, storyboardEdited: true,
          storyboardSource: project.storyboardSource || 'workflow', promptOptimizedByAi: true,
          voice: {
            ...voice.loadSettings(),
            enabled: false,
            profileId: project.brief.voiceProfileId || 'female_narrator',
            replaceNativeSpeech: true,
            nativeAudioVolume: 0.10,
            speechVolume: 1.0,
          },
        });
        const saved = workflowStore.update(projectId, {
          status: 'producing', currentStage: 'production',
          production: { plan: { ...plan, environmentReady: true }, jobId: job.id, jobStatus: job.status, lastError: '' },
        });
        return sendJson(res, 202, { project: saved, job });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/status/summary') {
      const job = publicJob(activeJob);
      return sendJson(res, 200, { job: job ? {
        id: job.id,
        projectId: job.projectId,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        segment: job.segment,
        segments: job.segments,
        shotProgress: job.shotProgress,
        samplingStep: job.samplingStep,
        samplingSteps: job.samplingSteps,
        finishedAt: job.finishedAt,
        outputName: job.outputName,
        error: job.error,
      } : null });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') return sendJson(res, 200, { job: publicJob(activeJob) });
    if (req.method === 'GET' && url.pathname === '/api/enhancement') return sendJson(res, 200, qualityEnhancer.status());
    if (req.method === 'GET' && url.pathname === '/api/history') return sendJson(res, 200, { items: listHistory() });
    const videoWorkMatch = /^\/api\/history\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'DELETE' && videoWorkMatch) {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: '不允许跨站请求' });
      deleteOutputVideo(decodeURIComponent(videoWorkMatch[1]));
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/editor/context') return sendJson(res, 200, editorContext());
    if (req.method === 'POST' && url.pathname === '/api/editor/dialogue/timeline') {
      const body = await readJson(req, 512 * 1024);
      return sendJson(res, 200, await createEditorDialogueTimeline(body));
    }
    if (req.method === 'POST' && url.pathname === '/api/editor/subtitles/preview') {
      const body = await readJson(req, 512 * 1024);
      const duration = Math.max(1, Math.min(4 * 60 * 60, Number(body.duration) || (body.projectId ? workflowStore.load(body.projectId).brief.duration : 60)));
      const { cues } = subtitleSource(body, duration);
      return sendJson(res, 200, { cues, srt: buildSrt(cues), duration });
    }
    if (req.method === 'POST' && url.pathname === '/api/editor/subtitles/render') {
      const body = await readJson(req, 512 * 1024);
      return sendJson(res, 200, await renderSubtitles(body));
    }
    if (req.method === 'GET' && url.pathname === '/api/prompt-provider') return sendJson(res, 200, publicPromptProvider());
    if (req.method === 'GET' && url.pathname === '/api/voice') return sendJson(res, 200, await voice.status());
    if (req.method === 'POST' && url.pathname === '/api/voice/settings') {
      const body = await readJson(req, 64 * 1024);
      return sendJson(res, 200, { settings: voice.saveSettings(body), status: await voice.status() });
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/install') {
      return sendJson(res, 202, { install: voice.startInstall(), status: await voice.status() });
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/custom') {
      const body = await readJson(req, 30 * 1024 * 1024);
      const profile = voice.saveCustomVoice(body);
      return sendJson(res, 201, { profile: (({ referenceFile, promptText, ...value }) => value)(profile), status: await voice.status() });
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/preview') {
      const body = await readJson(req, 64 * 1024);
      const name = `voice-preview-${Date.now()}.wav`;
      await voice.synthesize(body.text || '从一个想法，到一部完整作品。欢迎使用 LocalFrame。', body.profileId, path.join(OUTPUT_DIR, name), {
        instruction: body.instruction, speed: body.speed, pauseScale: body.pauseScale, variation: body.variation,
      });
      return sendJson(res, 200, { name, url: `/media/${encodeURIComponent(name)}` });
    }
    if (req.method === 'GET' && url.pathname === '/api/video-providers') {
      return sendJson(res, 200, videoProviderStore.publicState());
    }
    if (req.method === 'POST' && url.pathname === '/api/video-providers') {
      const body = await readJson(req, 64 * 1024);
      const providerId = String(body.providerId || '');
      if (!PROVIDER_PRESETS[providerId]) throw new Error('请选择有效的视频提供商');
      if (REMOTE_PROVIDER_IDS.includes(providerId)) videoProviderStore.saveProvider(providerId, body);
      if (body.select !== false) videoProviderStore.select(providerId);
      return sendJson(res, 200, { state: videoProviderStore.publicState(), message: PLATFORM_PROVIDER_IDS.includes(providerId) ? '平台协作已启用，无需 API 凭据' : '视频提供商凭据已隔离保存到本机用户目录，接口不会返回明文' });
    }
    if (req.method === 'POST' && url.pathname === '/api/video-providers/test') {
      const body = await readJson(req, 64 * 1024);
      const providerId = String(body.providerId || '');
      if (!REMOTE_PROVIDER_IDS.includes(providerId)) throw new Error('本地 H3 无需云端凭据测试');
      const saved = videoProviderStore.load().providers[providerId] || {};
      const config = sanitizeProviderConfig(providerId, body, saved);
      const result = createCloudAdapter(providerId, config).validateConfiguration();
      return sendJson(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/video-providers/discover') {
      const body = await readJson(req, 64 * 1024);
      const hint = String(body.providerId || '');
      if (!REMOTE_PROVIDER_IDS.includes(hint)) throw new Error('请选择需要识别的视频服务');
      const state = videoProviderStore.load();
      const providerId = inferVideoProviderId(body.baseUrl || state.providers[hint]?.baseUrl, hint);
      const saved = state.providers[providerId] || {};
      const sameOrigin = !body.baseUrl || new URL(body.baseUrl).origin === new URL(saved.baseUrl).origin;
      const config = sanitizeProviderConfig(providerId, { ...body, providerId }, sameOrigin ? saved : {});
      const result = await discoverProviderModels(config, { providerHint: providerId });
      videoProviderStore.rememberDiscovery(config, result);
      return sendJson(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/prompt-provider') {
      const body = await readJson(req, 64 * 1024);
      return sendJson(res, 200, { provider: savePromptProvider(body), message: 'API 配置已保存到本机用户数据目录' });
    }
    if (req.method === 'POST' && url.pathname === '/api/storyboard') {
      const body = await readJson(req, 128 * 1024);
      return sendJson(res, 200, await createStoryboard(body));
    }
    if (req.method === 'POST' && url.pathname === '/api/prompt-provider/test') {
      const body = await readJson(req, 64 * 1024);
      return sendJson(res, 200, await testPromptProvider(body));
    }
    if (req.method === 'POST' && url.pathname === '/api/prompt-provider/detect') {
      const body = await readJson(req, 64 * 1024);
      const saved = loadPromptProvider();
      return sendJson(res, 200, await promptApi.detectLocalProviders({
        ...body,
        apiKey: body.apiKey || saved.apiKey || '',
        authMode: body.authMode || saved.authMode || 'bearer',
      }));
    }
    if (req.method === 'POST' && url.pathname === '/api/prompt/optimize') {
      const body = await readJson(req, 64 * 1024);
      const optimizedPrompt = await optimizePrompt(body);
      return sendJson(res, 200, { optimizedPrompt, provider: publicPromptProvider() });
    }
    if (req.method === 'GET' && url.pathname === '/api/environment') return sendJson(res, 200, environmentStatus());
    if (req.method === 'GET' && url.pathname === '/api/professional') return sendJson(res, 200, await professionalStatus());
    if (req.method === 'POST' && url.pathname === '/api/professional/start') {
      return sendJson(res, 202, await startProfessionalMode());
    }
    if (req.method === 'GET' && url.pathname === '/api/optimization') return sendJson(res, 200, await optimizationState());
    if (req.method === 'POST' && url.pathname === '/api/optimization') {
      if (activeJob?.status === 'running') throw new Error('生成期间不能切换优化方案，请先等待完成或取消任务');
      const body = await readJson(req, 64 * 1024);
      saveOptimizationPreferences(body);
      const restarted = await comfy.restart();
      return sendJson(res, 200, { ...(await optimizationState()), restarted });
    }
    if (req.method === 'POST' && url.pathname === '/api/environment/install') {
      const body = await readJson(req, 16 * 1024);
      const job = await startEnvironmentInstall(body.planId || 'auto');
      return sendJson(res, 202, { status: job.status, progress: job.progress, phase: job.phase });
    }
    if (req.method === 'POST' && url.pathname === '/api/environment/open') {
      fs.mkdirSync(COMFY_INSTALL_ROOT, { recursive: true });
      spawn('explorer.exe', [COMFY_INSTALL_ROOT], { detached: true, stdio: 'ignore' }).unref();
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/system') {
      const optimization = await optimizationState();
      const cloudProviders = videoProviderStore.publicState().providers.filter((item) => item.kind === 'cloud');
      const cloudEngines = Object.fromEntries(cloudProviders.map((item) => [item.id, item.enabled && item.configured]));
      const platformEngines = Object.fromEntries(PLATFORM_PROVIDER_IDS.map((id) => [id, true]));
      return gpuInfo((gpu) => sendJson(res, 200, {
        ready: comfy.ready() || q2Ready() || Object.values(cloudEngines).some(Boolean) || PLATFORM_PROVIDER_IDS.length > 0,
        engines: { int8: comfy.ready(), q2: q2Ready(), ...cloudEngines, ...platformEngines },
        gpu, root: ROOT_DIR, outputDir: OUTPUT_DIR,
        model: comfy.ready() ? 'MiniMax H3 Fused Turbo INT8 ConvRot' : 'MiniMax H3 Q2 兼容预览',
        hardware: optimization.hardware,
        optimization: { selected: optimization.selected, recommended: optimization.recommended, warnings: optimization.warnings },
      }));
    }
    if (req.method === 'POST' && url.pathname === '/api/white-model/render') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return sendJson(res, 415, { error: '需要 JSON 请求' });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: '不允许跨站上传' });
      if (whiteModelRendering) return sendJson(res, 409, { error: '已有 AI 白模渲染正在处理，请等待完成' });
      const body = await readJson(req, 12 * 1024 * 1024);
      whiteModelRendering = true;
      try { return sendJson(res, 200, await renderWhiteModel(body)); }
      finally { whiteModelRendering = false; }
    }
    if (req.method === 'GET' && url.pathname === '/api/white-model/video/status') return sendJson(res, 200, whiteModelVideo.status());
    const whiteVideoResult = /^\/api\/white-model\/video\/([a-f\d-]{36})\/result$/.exec(url.pathname);
    if (req.method === 'GET' && whiteVideoResult) return serveFile(req, res, whiteModelVideo.result(whiteVideoResult[1]), 'video/mp4');
    if (req.method === 'POST' && url.pathname === '/api/white-model/video') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: '不允许跨站上传' });
      if (req.headers['content-type'] !== 'video/mp4') return sendJson(res, 415, { error: '请上传 MP4 视频' });
      if (imageStudio.busy || activeJob?.status === 'running') return sendJson(res, 409, { error: '本机已有图片或视频生成任务，请等待完成' });
      const settings = { model: url.searchParams.get('model'), prompt: url.searchParams.get('prompt'), strength: url.searchParams.get('strength') };
      return sendJson(res, 202, await whiteModelVideo.start(req, settings));
    }
    if (req.method === 'GET' && url.pathname === '/api/local-image/models') {
      return sendJson(res, 200, { models: localImage.checkpoints(COMFY_DIR), modelDirectory: path.join(COMFY_DIR, 'models', 'checkpoints'), qwen: { variants: qwenImage.VARIANTS, installed: qwenImage.installed(COMFY_DIR), components: qwenImage.components(COMFY_DIR), modelDirectory: path.join(COMFY_DIR, 'models', 'diffusion_models'), download: qwenDownload } });
    }
    if (req.method === 'GET' && url.pathname === '/api/local-image/status') return sendJson(res, 200, imageStudio.status());
    if (req.method === 'GET' && url.pathname === '/api/local-image/works') return sendJson(res, 200, { items: imageLibrary.list() });
    const imageWorkMatch = /^\/api\/local-image\/works\/([^/]+)\/file$/.exec(url.pathname);
    if (req.method === 'GET' && imageWorkMatch) return serveFile(req, res, imageLibrary.file(decodeURIComponent(imageWorkMatch[1])), 'image/png');
    const imageDeleteMatch = /^\/api\/local-image\/works\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'DELETE' && imageDeleteMatch) {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: '不允许跨站请求' });
      const id = decodeURIComponent(imageDeleteMatch[1]);
      if (imageStudio.status().status === 'running' && imageStudio.status().result?.id === id) throw new Error('当前图片仍在生成，不能删除');
      imageLibrary.delete(id);
      imageStudio.forgetResult(id);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/local-image/qwen/download') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: '不允许跨站请求' });
      if (qwenDownload.status === 'downloading') return sendJson(res, 409, { error: '已有模型正在下载' });
      const body = await readJson(req, 1024);
      if (!qwenImage.VARIANTS.includes(body.variant)) return sendJson(res, 400, { error: '不支持的量化版本' });
      if (qwenImage.installed(COMFY_DIR).includes(body.variant)) return sendJson(res, 409, { error: '该版本已经安装' });
      qwenDownload = { status: 'downloading', variant: body.variant, received: 0, total: 0, speed: 0, error: '' };
      let sampleAt = Date.now(), sampleBytes = null;
      qwenImage.download(body.variant, COMFY_DIR, (received, total) => {
        qwenDownload.received = received; qwenDownload.total = total;
        const now = Date.now();
        if (sampleBytes == null) { sampleBytes = received; sampleAt = now; }
        else if (now - sampleAt >= 1000) {
          qwenDownload.speed = Math.max(0, Math.round((received - sampleBytes) * 1000 / (now - sampleAt)));
          sampleBytes = received; sampleAt = now;
        }
      })
        .then(() => { qwenDownload.status = 'completed'; qwenDownload.speed = 0; })
        .catch(error => { qwenDownload.status = 'failed'; qwenDownload.speed = 0; qwenDownload.error = error.message; });
      return sendJson(res, 202, qwenDownload);
    }
    if (req.method === 'POST' && url.pathname === '/api/local-image/api/generate') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: '不允许跨站请求' });
      const body = await readJson(req, 16 * 1024);
      return sendJson(res, 202, { job: imageStudio.start('api', body) });
    }
    if (req.method === 'POST' && url.pathname === '/api/local-image/generate') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: '不允许跨站请求' });
      if (whiteModelVideo.status().status === 'running' || activeJob?.status === 'running') return sendJson(res, 409, { error: '本机已有视频生成任务，请等待完成' });
      const body = await readJson(req, 8 * 1024);
      return sendJson(res, 202, { job: imageStudio.start(body.engine === 'qwen-image-2.1' ? 'qwen-image-2.1' : 'local', body) });
    }
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const body = await readJson(req);
      await optimizationState();
      return sendJson(res, 202, { job: startGenerationPipeline(body) });
    }
    if (req.method === 'POST' && url.pathname === '/api/platform-handoff/import') {
      const body = await readJson(req, 32 * 1024);
      return sendJson(res, 200, { job: await importPlatformVideo(body) });
    }
    if (req.method === 'POST' && url.pathname === '/api/cancel') {
      if (!activeJob || activeJob.status !== 'running') return sendJson(res, 409, { error: '当前没有可取消的任务' });
      activeJob.cancelRequested = true;
      activeJob.phase = '正在取消';
      let message = '正在停止任务';
      if (PLATFORM_PROVIDER_IDS.includes(activeJob.engine)) {
        activeJob.status = 'cancelled';
        activeJob.phase = '平台协作已取消';
        activeJob.finishedAt = Date.now();
        activeJob.handoff = null;
        pendingPlatformJobStore.remove(activeJob.id);
        history.unshift(publicJob(activeJob));
        saveHistory();
        syncWorkflowJob(activeJob);
        message = '平台协作已取消；平台官网中已经开始的任务需要由你自行停止';
      } else if (REMOTE_PROVIDER_IDS.includes(activeJob.engine)) {
        const config = videoProviderStore.load().providers[activeJob.providerId];
        const result = await videoProviders.get(activeJob.providerId).cancelTask(activeJob.remoteTaskId, activeJob.remote || {});
        message = result.message;
        appendJobLog(activeJob, `[取消] ${message}`);
      } else await videoProviders.get(activeJob.engine).cancelTask(activeJob.id);
      return sendJson(res, 200, { ok: true, message });
    }
    if (req.method === 'POST' && url.pathname === '/api/pause-after-shot') {
      if (!activeJob || activeJob.status !== 'running' || activeJob.engine !== 'int8') return sendJson(res, 409, { error: '当前没有可在镜头边界暂停的 INT8 任务' });
      activeJob.pauseAfterShot = true;
      activeJob.phase = `将在镜头 ${activeJob.segment || 1}/${activeJob.segments || '?'} 完成后安全暂停`;
      appendJobLog(activeJob, '[任务] 已请求在当前镜头保存并校验后安全暂停');
      return sendJson(res, 200, { job: publicJob(activeJob) });
    }
    if (req.method === 'POST' && url.pathname === '/api/shutdown') {
      sendJson(res, 200, { ok: true });
      setTimeout(() => {
        comfy.shutdown();
        server.close(() => process.exit(0));
      }, 100);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/open-output') {
      spawn('explorer.exe', [OUTPUT_DIR], { detached: true, stdio: 'ignore' }).unref();
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      const name = path.basename(decodeURIComponent(url.pathname.slice('/media/'.length)));
      const file = path.join(OUTPUT_DIR, name);
      return serveFile(req, res, file, mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
    }

    const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const file = path.resolve(PUBLIC_DIR, requested);
    if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    return serveFile(req, res, file, mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (error) {
    return sendJson(res, 400, { error: error.message || '请求失败' });
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`MiniMax H3 Studio 已在 http://${HOST}:${PORT} 运行`);
    process.exit(0);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  console.log(`MiniMax H3 Studio: http://${HOST}:${PORT}`);
  resumePendingPlatformJobs();
  resumePendingCloudJobs();
});

function cleanup() {
  voice.shutdown();
  comfy.shutdown();
  try { if (fs.readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) fs.unlinkSync(PID_FILE); } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
