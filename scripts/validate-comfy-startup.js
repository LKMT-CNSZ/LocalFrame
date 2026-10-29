'use strict';

const path = require('node:path');
const { ComfyBackend } = require('../resources/h3-studio/app/comfy-backend');
const { PRESETS } = require('../resources/h3-studio/app/optimizer');

const projectRoot = path.resolve(__dirname, '..');
const installRoot = process.env.H3_COMFY_ROOT || 'D:\\AI\\ComfyUI-H3';
const portable = path.join(installRoot, 'ComfyUI_windows_portable');
const comfyDir = path.join(portable, 'ComfyUI');
const model = (...parts) => path.join(comfyDir, 'models', ...parts);

const backend = new ComfyBackend({
  baseUrl: 'http://127.0.0.1:8188',
  comfyDir,
  python: path.join(portable, 'python_embeded', 'python.exe'),
  mainPy: path.join(comfyDir, 'main.py'),
  customNodes: path.join(comfyDir, 'custom_nodes'),
  outputDir: path.join(comfyDir, 'output'),
  cacheDir: path.join(installRoot, 'cache'),
  tempDir: path.join(installRoot, 'temp'),
  ffmpeg: path.join(installRoot, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe'),
  ffprobe: path.join(installRoot, 'tools', 'ffmpeg', 'bin', 'ffprobe.exe'),
  bundledNodes: path.join(projectRoot, 'resources', 'h3-studio', 'bundled-nodes'),
  models: {
    w4a8: {
      diffusion: model('diffusion_models', 'minimax_h3_fl2va_pruned_w4a8_mixed.safetensors'),
      encoder: model('text_encoders', 'qwen3vl_4b_fp8_scaled.safetensors'),
      projection: model('clip_projections', 'mmh3-4b-ClipProj-celeb-mlp.safetensors'),
      lora: model('loras', 'minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_resized_avg_rank_21_bf16.safetensors'),
      videoVae: model('vae', 'minimax_h3_video_vae_fp16.safetensors'),
      audioVae: model('vae', 'minimax_h3_audio_vae_fp32.safetensors'),
    },
  },
  workflows: {
    w4a8Text: path.join(projectRoot, 'resources', 'h3-studio', 'app', 'workflows', '05_h3lite_w4a8_t2v_compat.api.json'),
    w4a8Image: path.join(projectRoot, 'resources', 'h3-studio', 'app', 'workflows', '06_h3lite_w4a8_i2v_compat.api.json'),
  },
  hardware: { gpus: [{ name: 'NVIDIA GPU', vendor: 'nvidia', vramGb: 12 }], storage: { fast: true } },
  optimization: PRESETS.balanced,
  preferences: { spectrumMode: 'balanced', fastDisk: false },
});

(async () => {
  const sync = backend.syncBundledCustomNodes();
  const started = Date.now();
  try {
    await backend.ensureServer((line) => process.stdout.write(line), { mode: 'basic' });
    const info = await fetch(`${backend.baseUrl}/object_info`).then((response) => response.json());
    const required = ['ClipProjLoader', 'SpectrumApplyMiniMaxH3'];
    const missing = required.filter((name) => !info[name]);
    if (missing.length) throw new Error(`精简基础版缺少节点：${missing.join('、')}`);
    console.log(JSON.stringify({
      ok: true,
      elapsedSeconds: Math.round((Date.now() - started) / 100) / 10,
      installedBundledNodes: sync.installed,
      customNodeWhitelist: backend.basicCustomNodeWhitelist(),
      requiredNodes: Object.fromEntries(required.map((name) => [name, true])),
    }, null, 2));
  } finally {
    if (backend.isProcessAlive()) await backend.restart();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
