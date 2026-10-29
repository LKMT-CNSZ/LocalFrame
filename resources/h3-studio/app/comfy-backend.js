'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { buildComfyLaunchArgs, buildWorkflowOptimization } = require('./optimizer');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function existsOver(file, minBytes = 1024) {
  try { return fs.statSync(file).size >= minBytes; } catch { return false; }
}

function requestJson(baseUrl, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body == null ? null : Buffer.from(JSON.stringify(options.body));
    const request = http.request(new URL(pathname, baseUrl), {
      method: options.method || 'GET',
      timeout: options.timeout || 15000,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {},
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = {};
        try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(parsed.error?.message || parsed.error || `ComfyUI 返回 ${response.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy(new Error('ComfyUI 请求超时')));
    request.on('error', reject);
    if (body) request.end(body); else request.end();
  });
}

function probeTcp(baseUrl, timeout = 800) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(baseUrl); } catch { resolve(false); return; }
    const socket = net.createConnection({ host: url.hostname, port: Number(url.port) || 80 });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function uploadMultipart(baseUrl, file, remoteName) {
  return new Promise((resolve, reject) => {
    const boundary = `----H3Studio${Date.now().toString(16)}`;
    const data = fs.readFileSync(file);
    const ext = path.extname(remoteName).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${remoteName.replace(/"/g, '')}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\ninput\r\n--${boundary}--\r\n`);
    const length = head.length + data.length + tail.length;
    const request = http.request(new URL('/upload/image', baseUrl), {
      method: 'POST', timeout: 120000,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': length },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(parsed.error || `上传参考图失败（${response.statusCode}）`));
        resolve(parsed);
      });
    });
    request.on('error', reject);
    request.write(head); request.write(data); request.end(tail);
  });
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); options.onLog?.(chunk.toString('utf8')); });
    child.stderr.on('data', (chunk) => { output += chunk.toString('utf8'); options.onLog?.(chunk.toString('utf8')); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`${path.basename(executable)} 退出码 ${code}\n${output.slice(-3000)}`)));
  });
}

function gridFrames(seconds) {
  const desired = Math.max(5, Math.round(seconds * 24));
  return 5 + Math.max(0, Math.round((desired - 5) / 17)) * 17;
}

function fitDimensions(width, height, maxPixels) {
  const pixels = width * height;
  if (pixels <= maxPixels) return { width, height };
  const scale = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(256, Math.floor((width * scale) / 32) * 32),
    height: Math.max(256, Math.floor((height * scale) / 32) * 32),
  };
}

function buildShotRetryPlans(settings) {
  const original = { width: settings.width, height: settings.height, steps: settings.steps, label: '原始规格' };
  const medium = fitDimensions(settings.width, settings.height, 750000);
  const safe = fitDimensions(settings.width, settings.height, 530000);
  const candidates = [
    original,
    { ...original, label: '清理显存后同规格重试' },
    { ...medium, steps: settings.steps, label: '稳定渲染后还原高清' },
    { ...safe, steps: settings.steps, label: '保底渲染后还原高清' },
  ];
  const plans = [];
  for (const item of candidates) {
    const previous = plans[plans.length - 1];
    if (previous && previous.width === item.width && previous.height === item.height && previous.label !== '原始规格') continue;
    plans.push(item);
  }
  return plans;
}

function parseSamplingProgress(text) {
  const source = String(text || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r/g, '\n');
  let latest = null;
  for (const match of source.matchAll(/(?:^|\s)(\d{1,3})%\|[^\n]*?\|\s*(\d+)\/(\d+)/g)) {
    latest = { percent: Number(match[1]), step: Number(match[2]), total: Number(match[3]) };
  }
  return latest;
}

function classifyComfyFailure(error) {
  const message = String(error?.message || error || '');
  if (/hostbuf_file_reader_read failed|HostBuffer\.read_file_slice failed|read_tensor_file_slice_into/i.test(message)) {
    return { code: 'host-buffer-io', safeIoMode: true, label: '主机缓冲磁盘直读失败' };
  }
  if (/采样进度.*未推进|sampling progress.*stalled/i.test(message)) {
    return { code: 'sampling-stall', safeIoMode: true, label: '采样进度停滞' };
  }
  if (/CUDA out of memory|out of memory|显存不足/i.test(message)) {
    return { code: 'out-of-memory', safeIoMode: false, label: '显存或内存不足' };
  }
  return { code: 'workflow-error', safeIoMode: false, label: '工作流执行失败' };
}

function summarizeComfyError(status, item) {
  const messages = Array.isArray(status?.messages) ? status.messages : [];
  const lines = [];
  for (const record of messages) {
    const payload = Array.isArray(record) ? record[1] : record;
    if (!payload || typeof payload !== 'object') continue;
    for (const value of [payload.exception_type, payload.exception_message]) {
      if (typeof value === 'string' && value.trim()) lines.push(value.trim());
    }
    if (Array.isArray(payload.traceback)) {
      lines.push(...payload.traceback.filter((line) => typeof line === 'string').slice(-8).map((line) => line.trim()));
    }
  }
  const unique = [...new Set(lines.filter(Boolean))];
  if (unique.length) return unique.join('\n').slice(-4000);
  const fallback = String(item?.status?.status_str || status?.status_str || '未知错误');
  return fallback.slice(-1000);
}

function qualityPrompt(prompt, steps) {
  if (steps < 6) return prompt;
  return `${prompt}\n\n高质量拍摄约束：人物数量严格遵循原始描述；每个人的头部、躯干和四肢连接自然，左右关系清楚，每只手保持五根结构清晰的手指。复杂手部动作按时间先后完成，不让多只手在同一小区域重叠。人物与衣物、道具、家具及其他主体接触时保持正确遮挡和空间深度，不穿透、不融合。脸部可见时始终合焦，双眼、鼻、嘴和面部轮廓稳定清晰，肤质自然且跨帧一致。保持身份、发型、服装和体型一致；运动遵循物理惯性。避免额外肢体、重复手指、关节反折、面部融化、重影、穿模、闪烁和运动涂抹。`;
}

function collectMedia(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectMedia(item, out);
  } else if (typeof value === 'object') {
    if (typeof value.filename === 'string' && /\.(mp4|webm|mov|mkv)$/i.test(value.filename)) out.push(value);
    for (const nested of Object.values(value)) collectMedia(nested, out);
  }
  return out;
}

class ComfyBackend {
  constructor(options) {
    Object.assign(this, options);
    this.baseUrl = options.baseUrl || 'http://127.0.0.1:8188';
    this.process = null;
    this.cancelRequested = false;
    this.activePromptId = null;
    this.onProcessLog = null;
    this.hardware = options.hardware || {};
    this.optimization = options.optimization || {};
    this.preferences = options.preferences || {};
    this.safeIoMode = false;
    this.lastResponsiveAt = 0;
    this.lastProcessOutputAt = 0;
    this.samplingProgress = null;
    this.processLogTail = '';
    this.launchMode = null;
    this.serverStartPromise = null;
  }

  setOptimization({ hardware, optimization, preferences }) {
    this.hardware = hardware || this.hardware;
    this.optimization = optimization || this.optimization;
    this.preferences = preferences || this.preferences;
  }

  components() {
    const useW4a8 = this.shouldUseW4a8();
    const items = [
      ['runtime', 'ComfyUI 运行环境', this.python, 64 * 1024],
      ['core', 'ComfyUI 核心', this.mainPy, 1024],
      ['diffusion', 'INT8 主视频模型 · 21GB', this.models.diffusion, 20_980_178_976, !useW4a8],
      ['encoder', 'NVFP4 自由文本编码器 · 15.7GB', this.models.encoder, 15_683_129_587, !useW4a8],
      ['videoVae', 'INT8 视频 VAE · 3.2GB', this.models.videoVae, 3_171_670_912, !useW4a8],
      ['audioVae', 'FP32 音频 VAE · 605MB', this.models.audioVae, 605_254_808, !useW4a8],
      ['mainodes', 'ComfyUI-MAINodes', path.join(this.customNodes, 'ComfyUI-MAINodes'), 1, !useW4a8],
      ['kjnodes', 'ComfyUI-KJNodes', path.join(this.customNodes, 'ComfyUI-KJNodes'), 1, !useW4a8],
      ['sla', 'H3 SLA 稀疏注意力节点', path.join(this.customNodes, 'ComfyUI-PlagueKind-Nodes'), 1, !useW4a8],
      ['spectrum', 'Spectrum H3 跳步加速（可选）', path.join(this.customNodes, 'ComfyUI-Spectrum-MiniMax-H3'), 1, false],
      ['manager', 'ComfyUI Manager（专业版）', path.join(this.customNodes, 'ComfyUI-Manager'), 1, false],
      ['ffmpeg', '长视频拼接 / 1080p 输出', this.ffmpeg, 10_000_000],
      ['workflowText', '低显存文生视频工作流', this.workflows.text, 1000, !useW4a8],
      ['workflowImage', '低显存首帧/首尾帧工作流', this.workflows.image, 1000, !useW4a8],
      ['w4a8Diffusion', 'W4A8 低显存主模型 · 12.5GB', this.models.w4a8?.diffusion, 12_500_000_000, useW4a8],
      ['w4a8Encoder', '4B FP8 文本编码器 · 5.2GB', this.models.w4a8?.encoder, 5_200_000_000, useW4a8],
      ['w4a8Projection', '4B ClipProj 投影 · 304MB', this.models.w4a8?.projection, 300_000_000, useW4a8],
      ['w4a8Lora', 'H3 Turbo 4 步 LoRA · 298MB', this.models.w4a8?.lora, 290_000_000, useW4a8],
      ['w4a8VideoVae', 'H3 FP16 视频 VAE · 5.2GB', this.models.w4a8?.videoVae, 5_200_000_000, useW4a8],
      ['clipproj', 'ComfyUI ClipProj 低显存节点', path.join(this.customNodes, 'ComfyUI-ClipProj'), 1, useW4a8],
      ['w4a8WorkflowText', 'H3 Lite W4A8 文生视频工作流', this.workflows.w4a8Text, 1000, useW4a8],
      ['w4a8WorkflowImage', 'H3 Lite W4A8 图生视频工作流', this.workflows.w4a8Image, 1000, useW4a8],
    ].map(([id, label, file, minBytes, required = true]) => {
      let size = 0;
      let partial = false;
      try {
        const stat = fs.statSync(file);
        size = stat.isDirectory() ? 1 : stat.size;
        partial = !stat.isDirectory() && fs.existsSync(`${file}.aria2`);
      } catch {}
      return { id, label, file, size, partial, ready: size >= minBytes && !partial, required };
    });
    return items;
  }

  ready() { return this.components().filter((item) => item.required).every((item) => item.ready); }

  spectrumAvailable() { return Boolean(this.components().find((item) => item.id === 'spectrum')?.ready); }

  syncBundledCustomNodes() {
    const sourceRoot = this.bundledNodes;
    if (!sourceRoot || !fs.existsSync(sourceRoot)) return { installed: [], existing: [] };
    const installed = [];
    const existing = [];
    for (const name of ['ComfyUI-Spectrum-MiniMax-H3']) {
      const source = path.join(sourceRoot, name);
      const target = path.join(this.customNodes, name);
      if (!fs.existsSync(path.join(source, '__init__.py'))) continue;
      if (fs.existsSync(path.join(target, '__init__.py'))) {
        existing.push(name);
        continue;
      }
      fs.mkdirSync(this.customNodes, { recursive: true });
      const staging = `${target}.installing-${process.pid}-${Date.now()}`;
      fs.cpSync(source, staging, {
        recursive: true,
        filter: (entry) => !entry.split(path.sep).includes('.git'),
      });
      fs.renameSync(staging, target);
      installed.push(name);
    }
    return { installed, existing };
  }

  w4a8Available() {
    const pack = this.models.w4a8;
    return Boolean(pack
      && [pack.diffusion, pack.encoder, pack.projection, pack.lora, pack.videoVae, pack.audioVae].every((file) => existsOver(file))
      && fs.existsSync(path.join(this.customNodes, 'ComfyUI-ClipProj'))
      && existsOver(this.workflows.w4a8Text)
      && existsOver(this.workflows.w4a8Image));
  }

  shouldUseW4a8() {
    if (!this.w4a8Available()) return false;
    const gpu = (this.hardware?.gpus || []).find((item) => item.vendor === 'nvidia');
    return !gpu || Number(gpu.vramGb || 0) < 16;
  }

  w4a8LaunchPolicy() {
    if (!this.shouldUseW4a8() || this.safeIoMode) return {};
    return { launch: {
      dynamicVram: true,
      asyncOffload: 2,
      fastDisk: false,
      reserveVram: 0.75,
    } };
  }

  isProcessAlive() {
    return Boolean(this.process && this.process.exitCode == null && !this.process.killed);
  }

  isBusy() { return Boolean(this.activePromptId); }

  async ping(options = {}) {
    const timeout = Number(options.timeout) || 2500;
    try {
      await requestJson(this.baseUrl, '/system_stats', { timeout });
      this.lastResponsiveAt = Date.now();
      return true;
    } catch { return false; }
  }

  async connectionState(options = {}) {
    const busy = this.isBusy() || options.jobRunning === true;
    const ownedProcessAlive = this.isProcessAlive();
    if (busy && ownedProcessAlive) {
      return { alive: true, responsive: false, busy: true, safeIoMode: this.safeIoMode, lastResponsiveAt: this.lastResponsiveAt };
    }
    const responsive = await this.ping({ timeout: options.timeout || 2500 });
    if (responsive) {
      return { alive: true, responsive: true, busy, safeIoMode: this.safeIoMode, lastResponsiveAt: this.lastResponsiveAt };
    }
    const alive = ownedProcessAlive || await probeTcp(this.baseUrl, options.tcpTimeout || 800);
    return { alive, responsive: false, busy: alive && busy, safeIoMode: this.safeIoMode, lastResponsiveAt: this.lastResponsiveAt };
  }

  observeProcessLog(chunk) {
    const now = Date.now();
    this.lastProcessOutputAt = now;
    const source = `${this.processLogTail}${String(chunk || '')}`;
    this.processLogTail = source.replace(/\r/g, '\n').split('\n').pop().slice(-1000);
    const progress = parseSamplingProgress(source.slice(-4000));
    if (!progress) return;
    if (!this.samplingProgress || progress.step !== this.samplingProgress.step || progress.total !== this.samplingProgress.total) {
      this.samplingProgress = { ...progress, advancedAt: now };
    } else {
      this.samplingProgress.percent = progress.percent;
    }
  }

  samplingIsStalled(timeoutMs, now = Date.now()) {
    const advancedAt = Number(this.samplingProgress?.advancedAt) || 0;
    return advancedAt > 0 && now - advancedAt >= timeoutMs;
  }

  async freeMemory(onLog) {
    if (!await this.ping()) return { running: false, released: false };
    const queue = await requestJson(this.baseUrl, '/queue', { timeout: 5000 });
    const running = Array.isArray(queue.queue_running) ? queue.queue_running.length : 0;
    const pending = Array.isArray(queue.queue_pending) ? queue.queue_pending.length : 0;
    if (running || pending) throw new Error('ComfyUI 专业版仍有任务运行或排队，请先等待完成，防止两个生成任务争抢显存');
    await requestJson(this.baseUrl, '/free', {
      method: 'POST', body: { unload_models: true, free_memory: true }, timeout: 15000,
    });
    onLog?.('[显存保护] 已要求 ComfyUI 卸载视频模型并清理缓存\n');
    return { running: true, released: true };
  }

  basicCustomNodeWhitelist() {
    if (!this.shouldUseW4a8()) return [];
    const names = ['ComfyUI-ClipProj'];
    if (this.spectrumAvailable()) names.push('ComfyUI-Spectrum-MiniMax-H3');
    return names;
  }

  async ensureServer(onLog, options = {}) {
    if (onLog) this.onProcessLog = onLog;
    if (!this.serverStartPromise) {
      this.serverStartPromise = this.ensureServerOnce(onLog, options)
        .finally(() => { this.serverStartPromise = null; });
    }
    return this.serverStartPromise;
  }

  async ensureServerOnce(onLog, options = {}) {
    const mode = options.mode === 'professional' ? 'professional' : 'basic';
    const tcpAlive = await probeTcp(this.baseUrl, this.isProcessAlive() ? 350 : 160);
    if (tcpAlive && await this.ping({ timeout: 700 })) {
      if (mode !== 'professional' || this.launchMode !== 'basic') return;
      const queue = await requestJson(this.baseUrl, '/queue', { timeout: 3000 });
      const running = Array.isArray(queue.queue_running) ? queue.queue_running.length : 0;
      const pending = Array.isArray(queue.queue_pending) ? queue.queue_pending.length : 0;
      if (running || pending || this.isBusy()) {
        throw new Error('基础版仍有任务运行或排队，完成后再打开完整 ComfyUI，避免中断生成');
      }
      onLog?.('[启动优化] 正在从基础版精简节点模式切换到完整 ComfyUI\n');
      await this.restart();
    }
    if (!this.ready()) throw new Error('高质量 INT8 环境尚未安装完整，请先在“环境与模型”中完成安装');
    if (!this.process || this.process.exitCode != null) {
      const env = {
        ...process.env,
        HF_HOME: this.cacheDir,
        HUGGINGFACE_HUB_CACHE: path.join(this.cacheDir, 'huggingface'),
        TORCH_HOME: path.join(this.cacheDir, 'torch'),
        TRITON_CACHE_DIR: path.join(this.cacheDir, 'triton'),
        PIP_CACHE_DIR: path.join(this.cacheDir, 'pip'),
        TEMP: this.tempDir,
        TMP: this.tempDir,
      };
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.mkdirSync(this.tempDir, { recursive: true });
      fs.mkdirSync(env.TRITON_CACHE_DIR, { recursive: true });
      const w4a8Launch = this.w4a8LaunchPolicy();
      const customNodeWhitelist = mode === 'basic' ? this.basicCustomNodeWhitelist() : [];
      const launchArgs = buildComfyLaunchArgs(this.optimization, this.hardware, {
        ...this.preferences, ...w4a8Launch, safeIoMode: this.safeIoMode, customNodeWhitelist,
      });
      if (this.safeIoMode) onLog?.('[稳定恢复] 已切换传统内存卸载模式，关闭动态显存磁盘直读与异步卸载\n');
      if (customNodeWhitelist.length) onLog?.(`[启动优化] 基础版仅加载 ${customNodeWhitelist.join('、')}，跳过无关专业节点\n`);
      onLog?.(`[优化] ${this.optimization.label || '自动'} · ComfyUI ${launchArgs.join(' ')}\n`);
      const launchedAt = Date.now();
      this.process = spawn(this.python, [this.mainPy, ...launchArgs], {
        cwd: this.comfyDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.launchMode = mode;
      const feed = (chunk) => {
        const text = chunk.toString('utf8');
        this.observeProcessLog(text);
        this.onProcessLog?.(text);
      };
      this.process.stdout.on('data', feed);
      this.process.stderr.on('data', feed);
      this.process.on('error', (error) => onLog?.(`ComfyUI 启动错误：${error.message}`));
      this.process.once('exit', () => {
        this.launchMode = null;
      });
      this.process.readyLog = () => onLog?.(`[启动优化] ComfyUI 已就绪，用时 ${((Date.now() - launchedAt) / 1000).toFixed(1)} 秒\n`);
    }
    const started = Date.now();
    while (Date.now() - started < 120000) {
      if (await this.ping({ timeout: 700 })) {
        const readyLog = this.process?.readyLog;
        if (readyLog) {
          this.process.readyLog = null;
          readyLog();
        }
        return;
      }
      if (this.process?.exitCode != null) throw new Error(`ComfyUI 启动失败，退出码 ${this.process.exitCode}`);
      await wait(350);
    }
    throw new Error('ComfyUI 启动超过 2 分钟，请查看运行日志');
  }

  buildWorkflow({ prompt, width, height, frames, steps, seed, firstRemote, lastRemote, prefix }) {
    const optimized = buildWorkflowOptimization(this.optimization, this.preferences, {
      firstRemote: Boolean(firstRemote), steps, spectrumAvailable: this.spectrumAvailable(),
    });
    if (this.shouldUseW4a8()) {
      const pack = this.models.w4a8;
      const templateFile = firstRemote ? this.workflows.w4a8Image : this.workflows.w4a8Text;
      const workflow = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
      workflow['1'].inputs.clip_name = path.basename(pack.encoder);
      workflow['1'].inputs.projection = path.basename(pack.projection);
      workflow['2'].inputs.unet_name = path.basename(pack.diffusion);
      workflow['4'].inputs.vae_name = path.basename(pack.videoVae);
      workflow['5'].inputs.vae_name = path.basename(pack.audioVae);
      workflow['105:201'].inputs.lora_name = path.basename(pack.lora);
      workflow['6'].inputs.prompt = qualityPrompt(prompt, steps);
      workflow['6'].inputs.width = width;
      workflow['6'].inputs.height = height;
      workflow['6'].inputs.length = frames;
      workflow['9'].inputs.steps = steps;
      workflow['10'].inputs.noise_seed = seed;
      workflow['15'].inputs.filename_prefix = prefix;
      if (firstRemote) workflow['20'].inputs.image = firstRemote;
      if (lastRemote) {
        workflow['21'] = { class_type: 'LoadImage', inputs: { image: lastRemote }, _meta: { title: 'LAST FRAME' } };
        workflow['6'].inputs.last_frame = ['21', 0];
      }
      this.applySpectrum(workflow, optimized, '105:201', ['7', '9']);
      return workflow;
    }
    const templateFile = firstRemote ? this.workflows.image : this.workflows.text;
    const workflow = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
    workflow['1'].inputs.value = qualityPrompt(prompt, steps);
    workflow['128'].inputs.clip_name = path.basename(this.models.encoder);
    workflow['127'].inputs.unet_name = path.basename(this.models.diffusion);
    workflow['119'].inputs.vae_name = path.basename(this.models.videoVae);
    workflow['120'].inputs.vae_name = path.basename(this.models.audioVae);
    workflow['129'].inputs.noise_seed = seed;
    workflow['124'].inputs.steps = steps;
    workflow['900'].inputs.enabled = optimized.enabled;
    workflow['900'].inputs.sparsity_ratio = optimized.sparsityRatio;
    workflow['900'].inputs.min_seq_len = optimized.minSeqLen;
    workflow['900'].inputs.dense_last_steps = optimized.denseLastSteps;
    workflow['900'].inputs.dense_steps = optimized.denseSteps;
    workflow['900'].inputs.use_int8_qk = optimized.useInt8Qk;
    workflow['900'].inputs.reference_protection = optimized.referenceProtection;
    workflow['900'].inputs.protect_audio = true;
    workflow['900'].inputs.block_size = '64';
    workflow['900'].inputs.dense_backend = 'comfy_kitchen';
    workflow['900'].inputs.disable_fp16_accum = true;
    workflow['900'].inputs.engine = 'comfy_kitchen';
    const chunkNode = firstRemote ? '902' : '901';
    if (workflow[chunkNode]?.inputs) workflow[chunkNode].inputs.chunks = optimized.chunks;
    this.applySpectrum(workflow, optimized, '142', ['124', '126']);
    workflow['131'].inputs.width = width;
    workflow['131'].inputs.height = height;
    workflow['131'].inputs.length = frames;
    workflow['92'].inputs.filename_prefix = prefix;
    if (firstRemote) workflow['901'].inputs.image = firstRemote;
    if (lastRemote) {
      workflow['903'] = { class_type: 'LoadImage', inputs: { image: lastRemote }, _meta: { title: 'LAST FRAME' } };
      workflow['131'].inputs.last_frame = ['903', 0];
    }
    return workflow;
  }

  applySpectrum(workflow, optimized, sourceNode, consumerNodes) {
    if (optimized.spectrum.id === 'off') return false;
    workflow['910'] = {
      class_type: 'SpectrumApplyMiniMaxH3',
      inputs: {
        model: [sourceNode, 0], enabled: true,
        blend_weight: optimized.spectrum.blendWeight,
        degree: 1, ridge_lambda: 0.10, window_size: 2.0, flex_window: 0.75,
        warmup_steps: optimized.spectrum.warmupSteps,
        tail_actual_steps: optimized.spectrum.tailActualSteps,
        max_history: 8, debug: false,
        history_storage: 'system_ram', bootstrap_first_forecast: optimized.spectrum.warmupSteps <= 1,
        offline_smoothing_replay: optimized.spectrum.offlineReplay,
        audio_blend_weight: 0.0, offline_archive_storage: 'system_ram',
        model_aware_mode: 'off', sa_pece_forecast_policy: optimized.spectrum.id === 'max_speed' ? 'max_speed' : 'balanced',
      },
    };
    for (const id of consumerNodes) workflow[id].inputs.model = ['910', 0];
    return true;
  }

  async queueAndWait(workflow, onProgress, onLog, options = {}) {
    this.samplingProgress = null;
    const queued = await requestJson(this.baseUrl, '/prompt', { method: 'POST', body: { prompt: workflow, client_id: `h3-studio-${Date.now()}` } });
    const promptId = queued.prompt_id;
    if (!promptId) throw new Error(queued.error?.message || 'ComfyUI 没有返回任务编号');
    this.activePromptId = promptId;
    const started = Date.now();
    const maxWaitMs = Math.max(60 * 60 * 1000, Number(options.maxWaitMs) || 4 * 60 * 60 * 1000);
    const stallTimeoutMs = Math.max(60 * 1000, Number(options.stallTimeoutMs) || 6 * 60 * 1000);
    let pollFailures = 0;
    let lastBusyLogAt = 0;
    while (true) {
      if (this.cancelRequested) throw new Error('任务已取消');
      if (this.samplingIsStalled(stallTimeoutMs)) {
        const progress = this.samplingProgress;
        this.activePromptId = null;
        throw new Error(`ComfyUI 采样进度在第 ${progress.step}/${progress.total} 步超过 ${Math.round(stallTimeoutMs / 60000)} 分钟未推进，触发稳定恢复`);
      }
      if (Date.now() - started > maxWaitMs) {
        try { await requestJson(this.baseUrl, '/interrupt', { method: 'POST', body: {}, timeout: 10000 }); } catch {}
        this.activePromptId = null;
        throw new Error(`单镜头运行超过 ${Math.round(maxWaitMs / 3600000)} 小时，已安全中断并进入降载重试`);
      }
      let history;
      try {
        history = await requestJson(this.baseUrl, `/history/${encodeURIComponent(promptId)}`, { timeout: 30000 });
        pollFailures = 0;
      } catch (error) {
        pollFailures += 1;
        if (this.process?.exitCode != null) {
          this.activePromptId = null;
          throw new Error(`ComfyUI 进程异常退出（${this.process.exitCode}），将自动重启并恢复镜头`);
        }
        const now = Date.now();
        if (now - lastBusyLogAt >= 120000) {
          const reason = /请求超时/.test(error.message) ? '等待当前采样步结束' : error.message;
          onLog?.(`[后台生成中] ComfyUI 控制接口暂时繁忙，${reason}\n`);
          lastBusyLogAt = now;
        }
        if (pollFailures >= 60) {
          this.activePromptId = null;
          throw new Error('ComfyUI 连续 60 次无响应，将重启后从当前镜头恢复');
        }
        onProgress?.({ phase: 'ComfyUI 正在计算，等待控制接口恢复', indeterminate: true });
        await wait(Math.min(30000, 3000 + pollFailures * 500));
        continue;
      }
      const item = history[promptId];
      if (item) {
        const status = item.status || {};
        if (status.status_str === 'error' || status.completed === false) {
          const detail = summarizeComfyError(status, item);
          this.activePromptId = null;
          throw new Error(`ComfyUI 工作流执行失败：${detail}`);
        }
        if (status.completed || item.outputs) {
          this.activePromptId = null;
          const media = collectMedia(item.outputs);
          if (!media.length) throw new Error('ComfyUI 已完成，但没有找到视频输出');
          return media[media.length - 1];
        }
      }
      const elapsed = Math.floor((Date.now() - started) / 1000);
      onProgress?.({ phase: elapsed < 30 ? '载入 INT8 模型' : '生成视频与原生音频', indeterminate: true });
      await wait(1500);
    }
  }

  async normalizeShotOutput(source, target, requested, rendered, seconds, onLog) {
    if (rendered.width === requested.width && rendered.height === requested.height) {
      fs.copyFileSync(source, target);
      return;
    }
    if (!existsOver(this.ffmpeg)) throw new Error('降载恢复需要 FFmpeg 才能还原目标高清分辨率');
    onLog?.(`[降载恢复] ${rendered.width}×${rendered.height} 渲染完成，正在高质量还原为 ${requested.width}×${requested.height}\n`);
    const scale = `scale=${requested.width}:${requested.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${requested.width}:${requested.height},unsharp=5:5:0.28:3:3:0.08,fps=24`;
    await this.runFfmpegResilient([
      '-y', '-hide_banner', '-loglevel', 'warning', '-i', source, '-t', String(seconds),
      '-vf', scale, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
      '-af', 'aresample=async=1:first_pts=0,apad', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', target,
    ], '高清还原', onLog);
  }

  resolveComfyOutput(media) {
    const subfolder = String(media.subfolder || '').replace(/[\\/]+/g, path.sep);
    const file = path.resolve(this.outputDir, subfolder, path.basename(media.filename));
    const root = path.resolve(this.outputDir) + path.sep;
    if (!file.startsWith(root) || !existsOver(file)) throw new Error('ComfyUI 返回了无效的输出文件路径');
    return file;
  }

  async uploadImage(file, jobId, label) {
    if (!file) return null;
    const remote = `${jobId}-${label}${path.extname(file).toLowerCase() || '.png'}`;
    const result = await uploadMultipart(this.baseUrl, file, remote);
    return [result.subfolder, result.name].filter(Boolean).join('/');
  }

  ffmpegArgsForConcat(listFile, outputFile) {
    return ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputFile];
  }

  async runFfmpegResilient(args, label, onLog, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try { return await runProcess(this.ffmpeg, args, { onLog }); }
      catch (error) {
        lastError = error;
        onLog?.(`[成片恢复] ${label}第 ${attempt}/${attempts} 次未完成：${error.message}\n`);
        if (attempt < attempts) await wait(2500 * attempt);
      }
    }
    throw lastError;
  }

  async probeMedia(file) {
    if (!existsOver(this.ffprobe)) throw new Error('缺少 FFprobe，无法校验长视频镜头');
    const raw = await runProcess(this.ffprobe, [
      '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
    ]);
    try { return JSON.parse(raw); } catch { throw new Error(`无法读取镜头媒体信息：${path.basename(file)}`); }
  }

  async validateShot(file, settings, seconds) {
    if (!existsOver(file)) throw new Error('镜头文件不存在或不完整');
    const info = await this.probeMedia(file);
    const video = info.streams?.find((stream) => stream.codec_type === 'video');
    const audio = info.streams?.find((stream) => stream.codec_type === 'audio');
    if (!video) throw new Error('镜头缺少视频轨道');
    if (settings.generateAudio !== false && !audio) throw new Error('镜头缺少 H3 原生音频轨道');
    if (Number(video.width) !== settings.width || Number(video.height) !== settings.height) {
      throw new Error(`镜头分辨率异常：${video.width}×${video.height}`);
    }
    const [num, den] = String(video.avg_frame_rate || video.r_frame_rate || '0/1').split('/').map(Number);
    const fps = den ? num / den : 0;
    if (fps < 23 || fps > 25) throw new Error(`镜头帧率异常：${fps.toFixed(2)} fps`);
    const duration = Number(info.format?.duration || video.duration || 0);
    if (!duration || duration < Math.max(0.7, seconds * 0.82)) throw new Error(`镜头时长不足：${duration.toFixed(2)} 秒`);
    return info;
  }

  findRecoveredShot(shotDir, number) {
    const stem = `shot-${String(number).padStart(2, '0')}`;
    try {
      const name = fs.readdirSync(shotDir).find((entry) => entry.startsWith(`${stem}.`) && /\.(mp4|webm|mov|mkv)$/i.test(entry));
      return name ? path.join(shotDir, name) : null;
    } catch { return null; }
  }

  async runGeneration(settings, hooks = {}) {
    this.cancelRequested = false;
    await this.ensureServer(hooks.onLog, { mode: 'basic' });
    hooks.onLog?.(this.shouldUseW4a8()
      ? '[低显存加速] 已启用 H3 Lite W4A8 + 4B FP8 + ClipProj + Turbo 4 步组件集\n'
      : '[本地模型] 使用原有 H3 INT8 / 32B NVFP4 组件集\n');
    const shotDir = path.join(hooks.outputDir, '.segments', hooks.recoveryId || hooks.jobId);
    fs.mkdirSync(shotDir, { recursive: true });
    const plan = Array.isArray(settings.storyboard) && settings.storyboard.length
      ? settings.storyboard
      : (() => {
          const fallback = [];
          let remaining = settings.duration;
          while (remaining > 0.01) {
            const seconds = Math.min(10, remaining);
            fallback.push({ seconds, prompt: settings.prompt });
            remaining -= seconds;
          }
          return fallback;
        })();
    const shots = [];
    let carryFrame = settings.firstImage;
    hooks.onLog?.(settings.continuityMode === 'carry'
      ? '[镜头策略] 已启用末帧续接，适合连续运动镜头\n'
      : '[镜头策略] 已启用独立短分镜，各镜头单独采样后优先无损合片，避免动作循环\n');

    for (let index = 0; index < plan.length; index += 1) {
      if (this.cancelRequested) throw new Error('任务已取消');
      const number = index + 1;
      const shot = plan[index];
      const baseProgress = 8 + Math.round((index / plan.length) * 76);
      let shotFile = this.findRecoveredShot(shotDir, number);
      if (shotFile) {
        try {
          await this.validateShot(shotFile, settings, shot.seconds);
          hooks.onLog?.(`[恢复] 镜头 ${number}/${plan.length} 已校验，跳过重新生成\n`);
          hooks.onProgress?.({ phase: `恢复镜头 ${number}/${plan.length}`, progress: baseProgress, segment: number, segments: plan.length, shotProgress: 100, recovered: true });
        } catch (error) {
          hooks.onLog?.(`[恢复] 镜头 ${number} 不可用，将重新生成：${error.message}\n`);
          shotFile = null;
        }
      }

      if (!shotFile) {
        hooks.onProgress?.({ phase: `生成镜头 ${number}/${plan.length}`, progress: baseProgress, segment: number, segments: plan.length, shotProgress: 0, samplingStep: 0, samplingSteps: settings.steps, resetSamplingLog: true });
        const firstRemote = await this.uploadImage(carryFrame, hooks.jobId, `shot-${number}-first`);
        const useLast = index === plan.length - 1 ? settings.lastImage : null;
        const lastRemote = await this.uploadImage(useLast, hooks.jobId, `shot-${number}-last`);
        let lastError = null;
        const retryPlans = buildShotRetryPlans(settings);
        for (let attempt = 1; attempt <= retryPlans.length; attempt += 1) {
          if (this.cancelRequested) throw new Error('任务已取消');
          const render = retryPlans[attempt - 1];
          try {
            if (attempt > 1) {
              hooks.onLog?.(`[重试] 镜头 ${number}/${plan.length} 第 ${attempt}/${retryPlans.length} 次 · ${render.label} · ${render.width}×${render.height} · ${render.steps} 步\n`);
              hooks.onProgress?.({ phase: `${render.label} · 镜头 ${number}/${plan.length}`, progress: baseProgress, segment: number, segments: plan.length, shotProgress: 0, samplingStep: 0, samplingSteps: render.steps, resetSamplingLog: true, recoveryLevel: attempt, recoveryLevels: retryPlans.length });
            }
            const workflow = this.buildWorkflow({
              prompt: shot.prompt || settings.prompt,
              width: render.width,
              height: render.height,
              frames: gridFrames(shot.seconds),
              steps: render.steps,
              seed: (settings.seed + index) % 2147483647,
              firstRemote,
              lastRemote,
              prefix: `h3-studio/${hooks.jobId}-shot-${number}-try-${attempt}`,
            });
            const media = await this.queueAndWait(
              workflow,
              (progress) => {
                const hasLocalProgress = Number.isFinite(Number(progress.progress));
                const localProgress = hasLocalProgress ? Math.min(100, Math.max(0, Number(progress.progress))) : null;
                const shotStart = 8 + (index / plan.length) * 76;
                const shotSpan = 76 / plan.length;
                hooks.onProgress?.({
                  ...progress,
                  progress: hasLocalProgress ? Math.round((shotStart + (localProgress / 100) * shotSpan) * 10) / 10 : Math.round(shotStart * 10) / 10,
                  segment: number,
                  segments: plan.length,
                  shotProgress: hasLocalProgress ? localProgress : undefined,
                });
              },
              hooks.onLog,
              { maxWaitMs: 4 * 60 * 60 * 1000 },
            );
            const source = this.resolveComfyOutput(media);
            const renderSettings = { ...settings, width: render.width, height: render.height };
            await this.validateShot(source, renderSettings, shot.seconds);
            shotFile = path.join(shotDir, `shot-${String(number).padStart(2, '0')}.mp4`);
            await this.normalizeShotOutput(source, shotFile, settings, render, shot.seconds, hooks.onLog);
            await this.validateShot(shotFile, settings, shot.seconds);
            if (hooks.postProcessShot) {
              shotFile = await hooks.postProcessShot({ shot, shotFile, number, settings }) || shotFile;
              await this.validateShot(shotFile, settings, shot.seconds);
            }
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (this.cancelRequested || /已取消/.test(error.message)) throw error;
            const failure = classifyComfyFailure(error);
            hooks.onLog?.(`[恢复] 镜头 ${number} 第 ${attempt}/${retryPlans.length} 次未完成（${failure.label}）：${error.message}\n`);
            if (attempt < retryPlans.length) {
              hooks.onProgress?.({ phase: `清理显存并恢复镜头 ${number}/${plan.length}`, progress: baseProgress, segment: number, segments: plan.length, recoveryLevel: attempt + 1, recoveryLevels: retryPlans.length });
              if (failure.safeIoMode && !this.safeIoMode) {
                this.safeIoMode = true;
                hooks.onLog?.('[稳定恢复] 检测到主机缓冲磁盘直读失败，正在重启 ComfyUI 并切换传统内存卸载模式\n');
                const stopped = await this.restart();
                if (!stopped && this.isProcessAlive()) throw new Error('ComfyUI 无法安全重启以切换稳定恢复模式');
              } else {
                try { await this.freeMemory(hooks.onLog); } catch (cleanupError) { hooks.onLog?.(`[恢复] 显存清理等待：${cleanupError.message}\n`); }
              }
              await this.ensureServer(hooks.onLog);
              await wait(Math.min(15000, 3000 * attempt));
            }
          }
        }
        if (lastError || !shotFile) throw new Error(`镜头 ${number} 已完成 ${retryPlans.length} 级恢复仍未成功：${lastError?.message || '未知错误'}`);
      }
      shots.push(shotFile);

      if (number < plan.length && settings.continuityMode === 'carry') {
        if (!existsOver(this.ffmpeg)) throw new Error('长视频续帧需要 FFmpeg，请重新运行环境安装补齐组件');
        const frame = path.join(shotDir, `shot-${String(number).padStart(2, '0')}-last.png`);
        await runProcess(this.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-sseof', '-0.30', '-i', shotFile, '-frames:v', '1', frame], { onLog: hooks.onLog });
        carryFrame = frame;
      } else if (number < plan.length) {
        carryFrame = null;
      }
      hooks.onProgress?.({
        phase: `镜头 ${number}/${plan.length} 已保存`,
        progress: Math.round((8 + (number / plan.length) * 76) * 10) / 10,
        segment: number,
        segments: plan.length,
        shotProgress: 100,
        samplingStep: settings.steps,
        samplingSteps: settings.steps,
      });
      if (number < plan.length && hooks.shouldPauseAfterShot?.()) {
        throw new Error(`任务已在镜头 ${number}/${plan.length} 结束后安全暂停`);
      }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalFile = path.join(hooks.outputDir, `H3-INT8-${stamp}-${hooks.jobId.slice(-6)}.mp4`);
    let joined = shots[0];
    if (shots.length > 1) {
      hooks.onProgress?.({ phase: '拼接镜头与音频', progress: 88 });
      const listFile = path.join(shotDir, 'concat.txt');
      fs.writeFileSync(listFile, shots.map((file) => `file '${file.replace(/'/g, "''")}'`).join('\r\n'), 'utf8');
      joined = path.join(shotDir, 'joined.mp4');
      try {
        await this.runFfmpegResilient(this.ffmpegArgsForConcat(listFile, joined), '无损拼接', hooks.onLog, 2);
      } catch (error) {
        hooks.onLog?.(`[拼接] 无损拼接失败，自动启用统一编码兜底：${error.message}\n`);
        await this.runFfmpegResilient([
          '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', listFile,
          '-vf', 'fps=24', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
          '-af', 'aresample=async=1:first_pts=0', '-c:a', 'aac', '-b:a', '192k', joined,
        ], '统一编码拼接', hooks.onLog);
      }
    }

    const deferAiUpscale = settings.upscale && ['realesrgan', 'flashvsr'].includes(settings.enhancement?.mode);
    if (settings.upscale && !deferAiUpscale) {
      if (!existsOver(this.ffmpeg)) throw new Error('1080p 输出需要 FFmpeg，请重新运行环境安装补齐组件');
      hooks.onProgress?.({ phase: `精确裁时并输出 ${settings.outputWidth}×${settings.outputHeight}`, progress: 94 });
      const scale = `scale=${settings.outputWidth}:${settings.outputHeight}:force_original_aspect_ratio=increase:flags=lanczos,crop=${settings.outputWidth}:${settings.outputHeight},unsharp=5:5:0.35:3:3:0.10,fps=24`;
      const finalArgs = [
        '-y', '-hide_banner', '-loglevel', 'warning', '-i', joined, '-t', String(settings.duration),
        '-vf', scale, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
      ];
      if (settings.generateAudio === false) finalArgs.push('-an');
      else finalArgs.push('-af', 'aresample=async=1:first_pts=0,apad', '-c:a', 'aac', '-b:a', '192k');
      finalArgs.push('-movflags', '+faststart', finalFile);
      await this.runFfmpegResilient(finalArgs, settings.generateAudio === false ? '纯画面无音轨输出' : '最终成片编码', hooks.onLog);
    } else if (settings.generateAudio === false) {
      if (!existsOver(this.ffmpeg)) throw new Error('纯画面无音轨输出需要 FFmpeg');
      hooks.onProgress?.({ phase: '移除模型音轨并无损输出画面', progress: 94 });
      await this.runFfmpegResilient([
        '-y', '-hide_banner', '-loglevel', 'warning', '-i', joined, '-t', String(settings.duration),
        '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', finalFile,
      ], '纯画面无音轨输出', hooks.onLog);
    } else {
      hooks.onLog?.('[合片] 所有短分镜规格一致，已使用视频与音频流复制完成无损拼接\n');
      fs.copyFileSync(joined, finalFile);
    }
    const expectedWidth = deferAiUpscale ? settings.width : settings.outputWidth;
    const expectedHeight = deferAiUpscale ? settings.height : settings.outputHeight;
    await this.validateShot(finalFile, { ...settings, width: expectedWidth, height: expectedHeight }, settings.duration);
    return finalFile;
  }

  async cancel() {
    this.cancelRequested = true;
    try { await requestJson(this.baseUrl, '/interrupt', { method: 'POST', body: {} }); } catch {}
  }

  async releaseModelsForPostprocess() {
    const queue = await requestJson(this.baseUrl, '/queue');
    const running = Array.isArray(queue.queue_running) ? queue.queue_running.length : 0;
    const pending = Array.isArray(queue.queue_pending) ? queue.queue_pending.length : 0;
    if (running || pending) throw new Error('ComfyUI 仍有生成任务，不能启动 AI 二次修复');
    await requestJson(this.baseUrl, '/free', { method: 'POST', body: { unload_models: true, free_memory: true } });
  }

  async restart() {
    if (!this.process || this.process.exitCode != null) return false;
    const child = this.process;
    try { child.kill(); } catch { return false; }
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (child.exitCode != null) {
        if (this.process === child) this.process = null;
        this.activePromptId = null;
        return true;
      }
      await wait(200);
    }
    return false;
  }

  shutdown() {
    this.cancelRequested = true;
    if (this.process && this.process.exitCode == null) {
      try { this.process.kill(); } catch {}
    }
  }
}

module.exports = {
  ComfyBackend, existsOver, fitDimensions, buildShotRetryPlans, parseSamplingProgress, classifyComfyFailure, summarizeComfyError, probeTcp,
};
