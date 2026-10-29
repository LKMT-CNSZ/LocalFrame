'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const localImage = require('./local-image');

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', data => { stdout += data.toString(); if (stdout.length > 100000) stdout = stdout.slice(-100000); });
    child.stderr.on('data', data => { stderr += data.toString(); if (stderr.length > 100000) stderr = stderr.slice(-100000); });
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`FFmpeg 退出码 ${code}：${stderr.slice(-700)}`)); });
  });
}
function validate(input, models) {
  const config = localImage.settings({ ...input, width: 768, height: 768 }, models);
  const strength = Number(input.strength ?? 0.35);
  if (!Number.isFinite(strength) || strength < 0.15 || strength > 0.55) throw new Error('画风强度须为 0.15 至 0.55');
  return { ...config, strength };
}
class WhiteModelVideo {
  constructor({ comfy, comfyDir, ffmpeg, ffprobe, outputDir }) {
    Object.assign(this, { comfy, comfyDir, ffmpeg, ffprobe, outputDir });
    this.job = null;
  }
  status() {
    if (!this.job) return { status: 'idle' };
    const { id, status, phase, frame, total, error, result } = this.job;
    return { id, status, phase, frame, total, error, result: result ? `/api/white-model/video/${id}/result` : null };
  }
  async start(req, input) {
    if (this.job?.status === 'running') throw new Error('已有白模视频渲染正在进行');
    if (!fs.existsSync(this.ffmpeg) || !fs.existsSync(this.ffprobe)) throw new Error('需要先安装本地 FFmpeg 环境');
    if (this.comfy.isBusy()) throw new Error('H3 视频任务正在运行，请等待完成');
    const config = validate(input, localImage.checkpoints(this.comfyDir));
    const id = crypto.randomUUID();
    const dir = path.join(this.outputDir, 'white-model', id);
    fs.mkdirSync(dir, { recursive: true });
    const source = path.join(dir, 'source.mp4');
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(source, { flags: 'wx' });
      let bytes = 0;
      req.on('data', chunk => { bytes += chunk.length; if (bytes > 150 * 1024 * 1024) { req.destroy(); output.destroy(); reject(new Error('视频不得超过 150MB')); } });
      req.on('error', reject); output.on('error', reject); output.on('finish', resolve); req.pipe(output);
    });
    const job = this.job = { id, status: 'running', phase: '正在检查视频', frame: 0, total: 0, error: null, result: null };
    this.process(job, source, dir, config).catch(error => { job.status = 'failed'; job.phase = '渲染失败'; job.error = error.message; });
    return this.status();
  }
  async process(job, source, dir, config) {
    const probe = JSON.parse(await run(this.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', source], 30000));
    const video = probe.streams?.find(stream => stream.codec_type === 'video');
    const duration = Number(probe.format?.duration);
    if (!video || !Number.isFinite(duration) || duration < 0.5 || duration > 20 || video.width > 3840 || video.height > 2160) throw new Error('请选择 0.5 至 20 秒、最高 4K 的有效 MP4 白模视频');
    if (this.comfy.isBusy()) throw new Error('H3 视频任务正在运行，请等待完成');
    await this.comfy.ensureServer(null, { mode: 'professional' });
    const queue = await localImage.request(this.comfy.baseUrl, '/queue');
    if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI 队列已有任务，请等待完成');
    const frames = path.join(dir, 'source-frames'), rendered = path.join(dir, 'rendered-frames');
    fs.mkdirSync(frames); fs.mkdirSync(rendered);
    job.phase = '正在提取原视频帧';
    const factor = Math.min(768 / video.width, 768 / video.height, 1);
    const frameWidth = Math.max(64, Math.round(video.width * factor / 64) * 64);
    const frameHeight = Math.max(64, Math.round(video.height * factor / 64) * 64);
    const fit = `fps=8,scale=${frameWidth}:${frameHeight}:force_original_aspect_ratio=decrease,pad=${frameWidth}:${frameHeight}:(ow-iw)/2:(oh-ih)/2`;
    await run(this.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-vf', fit, path.join(frames, '%05d.png')], 180000);
    const files = fs.readdirSync(frames).filter(name => /^\d{5}\.png$/.test(name)).sort();
    if (!files.length || files.length > 161) throw new Error('视频帧数超出限制');
    job.total = files.length;
    for (let index = 0; index < files.length; index++) {
      if (this.comfy.isBusy()) throw new Error('H3 视频任务占用了 ComfyUI；已保留已完成画面');
      job.phase = `AI 渲染第 ${index + 1}/${files.length} 帧`;
      const remote = await this.comfy.uploadImage(path.join(frames, files[index]), job.id, `frame-${index}`);
      const workflow = localImage.editWorkflow({ ...config, seed: config.seed }, remote, config.strength, `LocalFrame-white-${idSafe(job.id)}`);
      const output = await localImage.queueImage(workflow, this.comfy);
      fs.copyFileSync(output, path.join(rendered, files[index]));
      job.frame = index + 1;
    }
    job.phase = '正在合成动画与原音轨';
    const target = path.join(dir, 'rendered.mp4');
    await run(this.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', '8', '-i', path.join(rendered, '%05d.png'), '-i', source,
      '-map', '0:v:0', '-map', '1:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', target], 180000);
    if (!fs.existsSync(target) || fs.statSync(target).size < 1024) throw new Error('合成视频无效');
    job.result = target; job.status = 'completed'; job.phase = '已完成';
  }
  result(id) {
    if (!this.job || this.job.id !== id || this.job.status !== 'completed') throw new Error('视频尚未完成');
    return this.job.result;
  }
}
const idSafe = value => value.replace(/[^a-z\d-]/gi, '');
module.exports = { WhiteModelVideo, validate };
