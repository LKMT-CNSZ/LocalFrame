'use strict';

const crypto = require('node:crypto');

class ImageStudio {
  constructor({ localImage, imageApi, comfy, comfyDir, library }) {
    Object.assign(this, { localImage, imageApi, comfy, comfyDir, library });
    this.job = null;
  }

  get busy() { return this.job?.status === 'running'; }

  status() { return this.job ? { ...this.job } : { status: 'idle' }; }

  forgetResult(id) {
    if (this.job?.status === 'completed' && this.job.result?.id === id) this.job = null;
  }

  start(engine, input) {
    if (this.busy) throw new Error('已有图片正在生成');
    if (!['local', 'qwen-image-2.1', 'api'].includes(engine)) throw new Error('不支持的图片生成方式');
    if (engine === 'api' && input.confirmed !== true) throw new Error('请先确认提示词上传与可能计费');
    const job = {
      id: crypto.randomUUID(), status: 'running', engine,
      phase: engine === 'api' ? '等待第三方 API 返回' : '准备本机生成',
      step: 0, total: 0, startedAt: Date.now(), finishedAt: null,
      result: null, error: '',
    };
    this.job = job;
    Promise.resolve().then(async () => {
      try {
        const result = engine === 'api'
          ? await this.imageApi.generate(input)
          : await this.localImage.generate({ ...input, engine }, this.comfy, this.comfyDir, progress => {
            if (this.job !== job || job.status !== 'running') return;
            if (progress.phase) job.phase = progress.phase;
            if (Number.isFinite(progress.step) && Number.isFinite(progress.total) && progress.total > 0) {
              job.step = progress.step; job.total = progress.total;
            }
          });
        const buffer = engine === 'api' ? Buffer.from(result.image.split(',')[1], 'base64') : result.buffer;
        const saved = this.library.save(buffer, {
          engine, model: result.model, prompt: input.prompt, seed: result.seed, sourceName: result.sourceName,
        });
        job.result = saved;
        job.status = 'completed';
        job.phase = '图片已保存到本地作品栏';
        job.finishedAt = Date.now();
      } catch (error) {
        job.status = 'failed';
        job.phase = '生成未完成';
        job.error = error.message;
        job.finishedAt = Date.now();
      }
    });
    return this.status();
  }
}

module.exports = { ImageStudio };
