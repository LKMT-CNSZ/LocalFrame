'use strict';

// Remote ComfyUI is reached only through a loopback SSH tunnel.  The SSH
// client owns authentication; no password, token or private key is stored here.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { ComfyBackend, requestJson, collectMedia, summarizeComfyError } = require('./comfy-backend');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function noRetry(message) { const error = new Error(message); error.noRetry = true; return error; }
function tunnelUrl(port) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('SSH 隧道端口必须是 1024–65535');
  return `http://127.0.0.1:${n}`;
}
function writeJournal(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function readJournal(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw noRetry('远程任务记录无法读取，请检查记录后再操作'); }
}
async function readChecks(paths, request, concurrency = 3) {
  const results = new Array(paths.length);
  let next = 0;
  async function worker() {
    while (next < paths.length) {
      const index = next++;
      let error;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { results[index] = await request(paths[index]); error = null; break; }
        catch (cause) { error = cause; if (attempt < 2) await delay(1500 * (attempt + 1)); }
      }
      if (error) throw new Error(`云端连接检查失败（${paths[index]}）：${error.message}。请检查 SSH 隧道或网络后再试`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker));
  return results;
}

class RemoteComfyBackend extends ComfyBackend {
  constructor(options) {
    super({ ...options, baseUrl: tunnelUrl(options.port), preferences: { spectrumMode: 'off' } });
    this.journalDir = options.journalDir;
    this.remoteMode = true;
  }
  shouldUseW4a8() { return false; }
  spectrumAvailable() { return false; }
  buildWorkflow(options) {
    const workflow = super.buildWorkflow(options);
    // The local quality suffix explicitly describes hands and people. Adding it
    // to a pure landscape prompt can introduce unwanted people into the shot.
    const person = /人|人物|双手|手指|手臂|脸|面部|男|女|孩|演员|肖像|person|people|human|man\b|woman|child|face|hand|finger|portrait|actor|character/i;
    const noPeople = /无人|没有人|无人物|没有人物|no (?:people|person|humans|characters)/i;
    if (!person.test(options.prompt) || noPeople.test(options.prompt)) {
      workflow['1'].inputs.value = `${options.prompt}\n\n保持镜头运动自然、空间关系稳定，减少闪烁和画面变形。`;
    }
    return workflow;
  }
  async ensureServer() {
    const graphs = [this.workflows.text, this.workflows.image].filter(Boolean).map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
    const nodes = graphs.flatMap(graph => Object.values(graph));
    const classes = [...new Set(nodes.map(node => node.class_type))];
    const paths = ['/system_stats', ...classes.map(name => `/object_info/${encodeURIComponent(name)}`)];
    const [stats, ...definitions] = await readChecks(paths, pathname => requestJson(this.baseUrl, pathname, { timeout: 30000, freshConnection: true }));
    const info = Object.assign({}, ...definitions);
    const missing = [...new Set(nodes.map(node => node.class_type))].filter(name => !info[name]);
    for (const node of nodes) {
      const spec = info[node.class_type]?.input;
      if (!spec) continue;
      const available = { ...spec.required, ...spec.optional, ...spec.hidden };
      for (const key of Object.keys(node.inputs || {})) if (!Object.hasOwn(available, key)) missing.push(`${node.class_type}.${key}`);
    }
    const required = [
      ['UNETLoader', 'unet_name', path.basename(this.models.diffusion)],
      ['CLIPLoader', 'clip_name', path.basename(this.models.encoder)],
      ['VAELoader', 'vae_name', path.basename(this.models.videoVae)],
      ['VAELoader', 'vae_name', path.basename(this.models.audioVae)],
    ];
    for (const [node, field, name] of required) {
      const choices = info[node]?.input?.required?.[field]?.[0];
      if (!Array.isArray(choices) || !choices.includes(name)) missing.push(name);
    }
    if (missing.length) throw noRetry(`云端 H3 环境未就绪：${missing.join('、')}`);
    if (!stats.devices?.some(device => device.type === 'cuda')) throw noRetry('云端 ComfyUI 未报告 CUDA 显卡');
  }
  async queueAndWait(workflow, onProgress, onLog, options = {}) {
    const key = String(options.journalKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!key) throw noRetry('缺少远程任务恢复标识');
    const file = path.join(this.journalDir, `${key}.json`);
    let journal = readJournal(file);
    if (journal && journal.state === 'submitting') throw noRetry('上次提交结果未知，不能自动重试；请先检查云端队列及任务记录');
    if (!journal) {
      const clientId = `localframe-${crypto.randomUUID()}`;
      journal = { state: 'submitting', clientId, startedAt: Date.now(), endpoint: this.baseUrl };
      writeJournal(file, journal);
      let queued;
      try { queued = await requestJson(this.baseUrl, '/prompt', { method: 'POST', body: { prompt: workflow, client_id: clientId }, timeout: 30000, freshConnection: true }); }
      catch (error) { throw noRetry(`提交结果未知，请检查云端队列，避免重复付费：${error.message}`); }
      if (!queued.prompt_id) throw noRetry('云端没有返回任务编号，请检查云端队列和任务记录');
      journal = { ...journal, state: 'submitted', promptId: queued.prompt_id };
      writeJournal(file, journal);
    }
    if (journal.endpoint !== this.baseUrl || !journal.promptId) throw noRetry('任务记录与当前连接不一致，请先检查云端任务');
    this.activePromptId = journal.promptId;
    onLog?.(`[云端任务] ${journal.promptId}；网络中断时会继续查询此任务\n`);
    const deadline = Date.now() + Math.max(3600000, Number(options.maxWaitMs) || 14400000);
    let socket;
    if (typeof WebSocket === 'function') {
      const url = new URL('/ws', this.baseUrl);
      url.protocol = 'ws:';
      url.searchParams.set('clientId', journal.clientId);
      socket = new WebSocket(url);
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          const value = Number(message.data?.value), total = Number(message.data?.max);
          if (message.type === 'progress' && message.data?.prompt_id === journal.promptId && total > 0 && value >= 0 && value <= total) {
            onProgress?.({ phase: `云端采样 ${value}/${total}`, progress: value / total * 100, samplingStep: value, samplingSteps: total });
          }
        } catch {}
      };
      socket.onerror = () => {}; // The history poll remains authoritative.
    }
    try { while (Date.now() < deadline) {
      if (this.cancelRequested) throw noRetry('已停止本机等待；云端任务可能仍在运行，请在云端检查');
      let item;
      try { item = (await requestJson(this.baseUrl, `/history/${encodeURIComponent(journal.promptId)}`, { timeout: 30000, freshConnection: true }))[journal.promptId]; }
      catch { onProgress?.({ phase: '云端连接暂时中断，等待重连', indeterminate: true }); await delay(5000); continue; }
      if (item?.status?.status_str === 'error') {
        journal.state = 'failed'; writeJournal(file, journal);
        throw noRetry(`云端工作流失败：${summarizeComfyError(item.status, item)}`);
      }
      if (item && (item.status?.completed || item.outputs)) {
        const media = collectMedia(item.outputs);
        if (!media.length) throw noRetry('云端任务完成但未返回视频；请检查云端历史记录');
        journal.state = 'completed'; journal.media = media[media.length - 1]; writeJournal(file, journal);
        this.activePromptId = null;
        return journal.media;
      }
      onProgress?.({ phase: '云端生成中，等待实际进度', indeterminate: true });
      await delay(3000);
    }
    throw noRetry('等待超时，云端任务可能仍在运行；请重新连接并查询原任务');
    } finally { socket?.close(); }
  }
  async resolveComfyOutput(media, shotDir) {
    const filename = String(media.filename || '');
    if (!filename || /[\\/]/.test(filename) || filename !== path.posix.basename(filename) || !/\.(mp4|webm|mov|mkv)$/i.test(filename)) throw noRetry('云端返回的视频文件名无效');
    const query = new URLSearchParams({ filename, subfolder: String(media.subfolder || ''), type: String(media.type || 'output') });
    if (query.get('type') !== 'output' || query.get('subfolder').split(/[\\/]/).includes('..')) throw noRetry('云端返回的视频位置无效');
    const target = path.join(shotDir, `remote-${crypto.createHash('sha256').update(query.toString()).digest('hex').slice(0, 16)}${path.extname(filename)}`);
    const temp = `${target}.part`;
    await new Promise((resolve, reject) => {
      const req = http.get(new URL(`/view?${query}`, this.baseUrl), { timeout: 120000 }, res => {
        if (res.statusCode !== 200) { res.resume(); reject(noRetry(`下载视频失败：HTTP ${res.statusCode}`)); return; }
        let size = 0;
        const out = fs.createWriteStream(temp, { flags: 'w' });
        res.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 ** 3) req.destroy(noRetry('云端视频超过 2 GiB 下载上限')); });
        res.on('error', reject); res.on('aborted', () => reject(noRetry('云端视频下载中断，可重新连接并取回原任务'))); out.on('error', reject);
        out.on('finish', () => {
          if (size < 1024) return reject(noRetry('云端视频文件过小'));
          try { fs.renameSync(temp, target); resolve(); } catch (error) { reject(noRetry(`保存云端视频失败：${error.message}`)); }
        });
        res.pipe(out);
      });
      req.on('timeout', () => req.destroy(noRetry('下载视频超时'))); req.on('error', reject);
    });
    return target;
  }
  async cancel() { this.cancelRequested = true; return { cancelled: false, message: '已停止本机等待；云端任务可能仍在运行，请在云端检查' }; }
  async releaseModelsForPostprocess() {} // Local postprocessing does not own the cloud GPU.
  shutdown() { this.cancelRequested = true; }
}

module.exports = { RemoteComfyBackend, tunnelUrl, readChecks };
