'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

const ENHANCEMENT_MODES = ['none', 'lanczos', 'realesrgan', 'flashvsr'];
const ENHANCEMENT_PROFILES = ['fast', 'balanced', 'quality'];

function existsFile(value) {
  try { return Boolean(value && fs.statSync(value).isFile()); } catch { return false; }
}

function firstExisting(values) {
  return values.find(existsFile) || '';
}

function commandOnPath(command) {
  try {
    const result = execFileSync('where.exe', [command], { windowsHide: true, timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return String(result).split(/\r?\n/).map((item) => item.trim()).find(existsFile) || '';
  } catch { return ''; }
}

function locateFlashVsr() {
  const roots = [
    process.env.LOCALFRAME_FLASHVSR_ROOT,
    process.env.H3LITE_FLASHVSR_ROOT,
    'D:\\AI\\FlashVSR',
    'D:\\AI\\ComfyUI-FlashVSR_Stable',
    path.join(os.homedir(), 'FlashVSR'),
  ].filter(Boolean);
  for (const root of roots) {
    const cli = firstExisting([
      path.join(root, 'cli_main.py'),
      path.join(root, 'ComfyUI-FlashVSR_Stable', 'cli_main.py'),
    ]);
    const python = firstExisting([
      path.join(root, 'env', 'python.exe'),
      path.join(root, '.venv', 'Scripts', 'python.exe'),
      path.join(root, 'python_embeded', 'python.exe'),
    ]) || commandOnPath('python.exe');
    const modelRoots = [
      process.env.LOCALFRAME_FLASHVSR_MODELS,
      path.join(root, 'models'),
      path.join(root, 'ComfyUI', 'models'),
    ].filter(Boolean);
    const modelsDir = modelRoots.find((candidate) => {
      try {
        return fs.existsSync(candidate) && fs.readdirSync(candidate, { recursive: true }).some((entry) => /diffusion_pytorch_model_streaming_dmd\.safetensors$/i.test(String(entry)));
      } catch { return false; }
    }) || '';
    if (cli && python) return { root, cli, python, modelsDir, ready: Boolean(modelsDir) };
  }
  return { root: '', cli: '', python: '', modelsDir: '', ready: false };
}

function locateRealEsrgan() {
  const executable = firstExisting([
    process.env.LOCALFRAME_REALESRGAN_EXE,
    path.resolve(__dirname, '..', '..', 'ai-enhancers', 'realesrgan', 'realesrgan-ncnn-vulkan.exe'),
    'D:\\AI\\Real-ESRGAN\\realesrgan-ncnn-vulkan.exe',
    'D:\\AI\\Video2X\\realesrgan-ncnn-vulkan.exe',
    path.join(os.homedir(), 'Real-ESRGAN', 'realesrgan-ncnn-vulkan.exe'),
  ].filter(Boolean)) || commandOnPath('realesrgan-ncnn-vulkan.exe');
  const modelDir = executable ? path.join(path.dirname(executable), 'models') : '';
  const modelReady = Boolean(modelDir && existsFile(path.join(modelDir, 'realesrgan-x4plus.param')) && existsFile(path.join(modelDir, 'realesrgan-x4plus.bin')));
  return { executable, modelDir: modelReady ? modelDir : '', ready: Boolean(executable && modelReady) };
}

function normalizeEnhancement(input = {}, upscale = false) {
  const requested = String(input.mode || 'none').toLowerCase();
  const mode = ENHANCEMENT_MODES.includes(requested) ? requested : 'none';
  const requestedProfile = String(input.profile || 'balanced').toLowerCase();
  const profile = ENHANCEMENT_PROFILES.includes(requestedProfile) ? requestedProfile : 'balanced';
  return { mode: upscale ? mode : 'none', profile };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || path.dirname(command), windowsHide: true,
      env: { ...process.env, ...(options.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let tail = '';
    const onChunk = (chunk) => {
      const text = String(chunk);
      tail = `${tail}${text}`.slice(-12000);
      const visible = options.suppressPercentLines
        ? text.split(/\r?\n/).filter((line) => !/^\s*\d{1,3}(?:\.\d+)?%\s*$/.test(line)).join('\n')
        : text;
      if (visible.trim()) options.onLog?.(`${visible.trimEnd()}\n`);
      const match = /(\d{1,3})(?:\.\d+)?%/.exec(text);
      if (match) options.onProgress?.(Math.min(99, Number(match[1])));
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve({ tail });
      else reject(new Error(`${options.label || path.basename(command)}失败（退出码 ${code}${signal ? `，${signal}` : ''}）${tail ? `：${tail.slice(-1000)}` : ''}`));
    });
  });
}

class QualityEnhancer {
  constructor({ ffmpeg, ffprobe, tempRoot, comfyBaseUrl = 'http://127.0.0.1:8188' }) {
    this.ffmpeg = ffmpeg;
    this.ffprobe = ffprobe;
    this.tempRoot = tempRoot;
    this.comfyBaseUrl = comfyBaseUrl;
  }

  status() {
    const flashvsr = locateFlashVsr();
    const realesrgan = locateRealEsrgan();
    return {
      modes: {
        none: { ready: true, label: '关闭' },
        lanczos: { ready: existsFile(this.ffmpeg), label: 'Lanczos 高清还原', kind: 'interpolation' },
        realesrgan: { ready: realesrgan.ready, label: 'AI 清晰修复 · Real-ESRGAN', kind: 'neural-inference', path: realesrgan.executable || '' },
        flashvsr: { ready: flashvsr.ready, label: '视频扩散二次采样 · FlashVSR', kind: 'diffusion-resampling', path: flashvsr.root || '', weightsReady: Boolean(flashvsr.modelsDir) },
      },
      notice: 'AI 修复默认关闭，只在视频生成与合片完成后运行；FlashVSR 权重不会随安装包自动下载。',
    };
  }

  async probe(file) {
    if (!existsFile(this.ffprobe)) throw new Error('缺少 FFprobe，无法校验超分结果');
    const stdout = await new Promise((resolve, reject) => {
      const child = require('node:child_process').execFile(this.ffprobe, [
        '-v', 'error', '-count_frames', '-show_entries',
        'format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames,nb_read_frames', '-of', 'json', file,
      ], { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (error, value, stderr) => {
        if (error) reject(new Error(`FFprobe 校验失败：${stderr || error.message}`)); else resolve(value);
      });
      child.unref?.();
    });
    const data = JSON.parse(stdout);
    const video = (data.streams || []).find((item) => item.codec_type === 'video');
    const audio = (data.streams || []).find((item) => item.codec_type === 'audio');
    return {
      duration: Number(data.format?.duration) || 0,
      width: Number(video?.width) || 0,
      height: Number(video?.height) || 0,
      frames: Number(video?.nb_read_frames || video?.nb_frames) || 0,
      fps: video?.r_frame_rate || '', audio: Boolean(audio),
    };
  }

  async enhance(input, settings, hooks = {}) {
    const enhancement = normalizeEnhancement(settings.enhancement, settings.upscale);
    if (enhancement.mode === 'none') return input;
    if (!existsFile(input)) throw new Error('找不到待增强的视频');
    if (!existsFile(this.ffmpeg) || !existsFile(this.ffprobe)) throw new Error('AI 修复需要 FFmpeg 与 FFprobe');
    const targetWidth = Number(settings.outputWidth);
    const targetHeight = Number(settings.outputHeight);
    if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight)) throw new Error('AI 修复目标分辨率无效');
    const before = await this.probe(input);
    const suffix = enhancement.mode === 'flashvsr' ? 'FlashVSR' : enhancement.mode === 'realesrgan' ? 'RealESRGAN' : 'Lanczos';
    const output = path.join(path.dirname(input), `${path.parse(input).name}-${targetWidth}x${targetHeight}-${suffix}.mp4`);
    if (enhancement.mode === 'lanczos') {
      hooks.onProgress?.({ phase: `Lanczos 输出 ${targetWidth}×${targetHeight}`, progress: 95 });
      await this.finishVideo(input, input, output, settings, targetWidth, targetHeight, true, hooks, before);
    } else if (enhancement.mode === 'realesrgan') {
      await this.runRealEsrgan(input, output, settings, enhancement, hooks);
    } else {
      await this.runFlashVsr(input, output, settings, enhancement, hooks, before);
    }
    const after = await this.probe(output);
    if (after.width !== targetWidth || after.height !== targetHeight) throw new Error(`超分尺寸校验失败：期望 ${targetWidth}×${targetHeight}，实际 ${after.width}×${after.height}`);
    if (before.frames && after.frames && before.frames !== after.frames) throw new Error(`超分帧数校验失败：输入 ${before.frames} 帧，输出 ${after.frames} 帧`);
    if (!after.frames || !after.width || !after.height) throw new Error('超分输出缺少有效视频帧');
    if (before.fps !== after.fps) throw new Error(`超分帧率校验失败：${before.fps} → ${after.fps}`);
    if (before.duration && Math.abs(before.duration - after.duration) > Math.max(0.25, before.duration * 0.02)) throw new Error('超分后时长与源视频不一致');
    if (settings.generateAudio !== false && before.audio && !after.audio) throw new Error('超分输出丢失了源音轨');
    hooks.onLog?.(`[画质增强] ${suffix} 校验通过：${after.width}×${after.height}，${after.frames || '未知'} 帧，${after.audio ? '保留音轨' : '无音轨'}\n`);
    return output;
  }

  async runRealEsrgan(input, output, settings, enhancement, hooks) {
    const backend = locateRealEsrgan();
    if (!backend.ready) throw new Error('未检测到 Real-ESRGAN。请安装官方 realesrgan-ncnn-vulkan，并设置 LOCALFRAME_REALESRGAN_EXE。');
    const taskDir = fs.mkdtempSync(path.join(this.tempRoot, 'localframe-realesrgan-'));
    const inputFrames = path.join(taskDir, 'input');
    const outputFrames = path.join(taskDir, 'output');
    fs.mkdirSync(inputFrames); fs.mkdirSync(outputFrames);
    try {
      hooks.onProgress?.({ phase: '拆分无损帧序列', progress: 94 });
      await run(this.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'warning', '-i', input, '-map', '0:v:0', '-an', path.join(inputFrames, '%08d.png')], { label: '视频拆帧', onLog: hooks.onLog });
      hooks.onProgress?.({ phase: 'Real-ESRGAN 二次神经推理', progress: 95 });
      const totalFrames = fs.readdirSync(inputFrames).filter((name) => /\.png$/i.test(name)).length;
      await run(backend.executable, ['-i', inputFrames, '-o', outputFrames, '-n', 'realesrgan-x4plus', '-s', '4', '-f', 'png'], {
        label: 'Real-ESRGAN', onLog: hooks.onLog, suppressPercentLines: true,
        onProgress: () => {
          const completed = fs.readdirSync(outputFrames).filter((name) => /\.png$/i.test(name)).length;
          hooks.onProgress?.({ phase: `Real-ESRGAN 二次神经推理 ${completed}/${totalFrames}`, progress: 95 + (completed / Math.max(1, totalFrames)) * 3 });
        },
      });
      await this.finishFrames(outputFrames, input, output, settings, hooks);
    } finally {
      try { fs.rmSync(taskDir, { recursive: true, force: true }); } catch {}
    }
  }

  async runFlashVsr(input, output, settings, enhancement, hooks, before) {
    const backend = locateFlashVsr();
    if (!backend.ready) throw new Error('未检测到完整 FlashVSR 环境或 v1.1 权重。请设置 LOCALFRAME_FLASHVSR_ROOT 与 LOCALFRAME_FLASHVSR_MODELS。');
    const raw = `${output}.flashvsr-raw.mp4`;
    try { if (existsFile(raw)) fs.unlinkSync(raw); } catch {}
    const profileArgs = enhancement.profile === 'fast'
      ? ['--mode', 'tiny-long', '--vae_model', 'LightVAE_W2.1', '--frame_chunk_size', '16']
      : enhancement.profile === 'quality'
        ? ['--mode', 'tiny', '--vae_model', 'Wan2.1', '--frame_chunk_size', '32']
        : ['--mode', 'tiny', '--vae_model', 'Wan2.1', '--frame_chunk_size', '20'];
    const requestedScale = Math.max(Number(settings.outputWidth) / Math.max(1, before.width), Number(settings.outputHeight) / Math.max(1, before.height));
    const flashScale = requestedScale > 2.05 ? 4 : 2;
    const cliRoot = path.dirname(backend.cli);
    const bootstrap = `import runpy,sys; p=${JSON.stringify(cliRoot)}; sys.path.insert(0,p); sys.argv[0]=p+r'\\cli_main.py'; runpy.run_path(sys.argv[0],run_name='__main__')`;
    // Triton on Windows decodes this environment variable as UTF-8 even when the
    // host code page is not UTF-8. Keep the cache path ASCII-only so projects in
    // Chinese-named folders do not fail before inference starts.
    const tritonCache = path.join(os.tmpdir(), 'LocalFrame', 'flashvsr-triton-cache');
    fs.mkdirSync(tritonCache, { recursive: true });
    hooks.onProgress?.({ phase: 'FlashVSR 视频扩散二次采样', progress: 94 });
    try {
      const result = await run(backend.python, ['-c', bootstrap, '--models_dir', backend.modelsDir, '--model', 'FlashVSR-v1.1', ...profileArgs,
        '--scale', String(flashScale), '--input', input, '--output', raw, '--tiled_dit', '--tiled_vae', '--tile_size', '256', '--tile_overlap', '64', '--keep_models_on_cpu', '--unload_dit'], {
        cwd: path.dirname(backend.cli), label: 'FlashVSR', onLog: hooks.onLog,
        env: { PYTHONIOENCODING: 'utf-8', TRITON_CACHE_DIR: tritonCache },
        onProgress: (value) => hooks.onProgress?.({ phase: 'FlashVSR 视频扩散二次采样', progress: 94 + value * 0.04 }),
      });
      if (/Error during processing:/i.test(result.tail) || !existsFile(raw) || fs.statSync(raw).size < 1024) {
        throw new Error('FlashVSR 未生成有效视频；后端可能在错误返回 0 退出码时提前终止');
      }
      const rawInfo = await this.probe(raw);
      if (rawInfo.frames !== before.frames) throw new Error(`FlashVSR 输出截断：输入 ${before.frames} 帧，输出 ${rawInfo.frames} 帧`);
      await this.finishVideo(raw, input, output, settings, settings.outputWidth, settings.outputHeight, false, hooks, before);
    } finally {
      try { if (existsFile(raw)) fs.unlinkSync(raw); } catch {}
    }
  }

  async finishFrames(framesDir, source, output, settings, hooks) {
    const before = await this.probe(source);
    const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-framerate', before.fps || '24', '-i', path.join(framesDir, '%08d.png'), '-i', source,
      '-vf', `scale=${settings.outputWidth}:${settings.outputHeight}:force_original_aspect_ratio=increase:flags=lanczos,crop=${settings.outputWidth}:${settings.outputHeight},format=yuv420p`,
      '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16'];
    if (settings.generateAudio === false) args.push('-an');
    else args.push('-map', '1:a:0?', '-c:a', 'aac', '-b:a', '192k');
    if (before.duration > 0) args.push('-t', before.duration.toFixed(6));
    args.push('-movflags', '+faststart', output);
    hooks.onProgress?.({ phase: '重组视频并恢复音轨', progress: 98 });
    await run(this.ffmpeg, args, { label: '超分视频重组', onLog: hooks.onLog });
  }

  async finishVideo(video, source, output, settings, width, height, sharpen, hooks, before = {}) {
    const duration = before.duration || 0;
    const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}${sharpen ? ',unsharp=5:5:0.35:3:3:0.10' : ''},format=yuv420p`;
    const args = ['-y', '-hide_banner', '-loglevel', 'warning', '-i', video, '-i', source, '-vf', filter,
      '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16'];
    if (settings.generateAudio === false) args.push('-an');
    else args.push('-map', '1:a:0?', '-c:a', 'aac', '-b:a', '192k');
    if (duration > 0) args.push('-t', duration.toFixed(6));
    args.push('-movflags', '+faststart', output);
    hooks.onProgress?.({ phase: '精确缩放并恢复音轨', progress: 98 });
    await run(this.ffmpeg, args, { label: '最终超分封装', onLog: hooks.onLog });
  }
}

module.exports = { QualityEnhancer, normalizeEnhancement, locateFlashVsr, locateRealEsrgan, ENHANCEMENT_MODES, ENHANCEMENT_PROFILES };
