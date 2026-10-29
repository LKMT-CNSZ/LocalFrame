'use strict';
const $ = id => document.getElementById(id);
let state = { models: [], qwen: { variants: [], installed: [], components: {}, download: {} } };
let busy = false;
let shownResultId = '';
let handledJobId = '';
let firstJobPoll = true;
let pendingImageDelete = '';
let viewerScale = 1;
let viewerDrag = null;
let viewerDragged = false;

async function json(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function update() {
  const engine = $('engine').value, q = state.qwen;
  $('localFields').hidden = engine !== 'local'; $('qwenFields').hidden = engine !== 'qwen-image-2.1'; $('apiFields').hidden = engine !== 'api';
  $('stepsField').hidden = engine === 'api';
  const available = engine === 'local' ? state.models.length > 0 : engine === 'qwen-image-2.1'
    ? q.installed.includes($('variant').value) && q.components.encoder && q.components.vae && q.components.ggufNode : true;
  $('generate').disabled = busy || !available;
  $('generate').textContent = busy ? '正在生成…' : engine === 'api' ? '调用第三方 API 生图' : '在本机生成图片';
  $('modelStatus').textContent = state.models.length ? `发现 ${state.models.length} 个本地检查点` : `尚无标准图片模型。模型目录：${state.modelDirectory || ''}`;
  const missing = [!q.components.encoder && 'Qwen3VL 8B 文本编码器', !q.components.vae && 'Qwen Image 2.1 VAE', !q.components.ggufNode && 'Qwen 2.1 兼容版 ComfyUI-GGUF 节点'].filter(Boolean);
  const d = q.download || {};
  $('qwenStatus').textContent = `已安装：${q.installed.join('、') || '无'}。${missing.length ? `运行前还需：${missing.join('、')}。` : '配套组件已发现。'}${d.status === 'failed' ? ` 下载失败：${d.error}` : d.status === 'completed' ? ` ${d.variant} 下载完成。` : ''}`;
  renderDownload(d);
  $('downloadModel').disabled = d.status === 'downloading' || q.installed.includes($('variant').value);
}

function renderDownload(d) {
  const downloading = d.status === 'downloading';
  $('modelDownloadProgress').hidden = !downloading;
  if (downloading) {
    const received = Math.max(0, Number(d.received) || 0), total = Math.max(0, Number(d.total) || 0);
    const percent = total ? Math.min(100, received / total * 100) : 0;
    $('modelDownloadTitle').textContent = `正在下载 ${d.variant}`;
    $('modelDownloadPercent').textContent = total ? `${percent.toFixed(1)}%` : '等待文件大小';
    if (total) $('modelDownloadBar').value = percent;
    else $('modelDownloadBar').removeAttribute('value');
    const size = bytes => `${(bytes / 1048576).toFixed(1)} MB`;
    const speed = Number(d.speed) > 0 ? `${size(d.speed)}/秒` : '正在测量速度';
    $('modelDownloadDetails').textContent = `${size(received)}${total ? ` / ${size(total)}` : ''} · ${received >= total && total ? '正在校验文件' : speed}`;
  }
}

async function refresh() {
  state = await json('/api/local-image/models');
  const oldModel = $('model').value, oldVariant = $('variant').value || 'Q6_K';
  $('model').replaceChildren(...state.models.map(name => { const option = document.createElement('option'); option.value = option.textContent = name; return option; }));
  if (state.models.includes(oldModel)) $('model').value = oldModel;
  $('variant').replaceChildren(...state.qwen.variants.map(name => { const option = document.createElement('option'); option.value = option.textContent = name; return option; }));
  $('variant').value = state.qwen.variants.includes(oldVariant) ? oldVariant : 'Q6_K';
  update();
  if ($('status').textContent === '正在检查本机图片模型…') $('status').textContent = '选择生成方式，填写提示词后开始。';
}

function workDayKey(ms) {
  const date = new Date(ms), pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function dayLabel(key) {
  const date = new Date(`${key}T00:00:00`), today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - date) / 86400000);
  const formatted = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
  if (days === 0) return `今天 · ${formatted}`;
  if (days === 1) return `昨天 · ${formatted}`;
  return date.getFullYear() === today.getFullYear() ? formatted : `${date.getFullYear()}年 ${formatted}`;
}
function groupState() { try { return JSON.parse(localStorage.getItem('localframe.image.groups') || '{}'); } catch { return {}; } }
function saveGroupState(key, open) { try { localStorage.setItem('localframe.image.groups', JSON.stringify({ ...groupState(), [key]: open })); } catch {} }
function updateGroupToggle() {
  const groups = [...$('worksList').querySelectorAll('.work-group')];
  $('toggleGroups').disabled = !groups.length;
  $('toggleGroups').textContent = groups.some(group => group.open) ? '全部折叠' : '全部展开';
}

function showWork(item) {
  shownResultId = item.id;
  $('emptyState').hidden = true;
  $('progressState').hidden = true;
  $('result').hidden = false;
  $('resultImage').src = item.url;
  $('backToProgress').hidden = !busy;
  $('showProgress').hidden = !busy;
  $('download').href = item.url;
  $('download').download = item.name;
  const dimensions = item.width && item.height ? `${item.width} × ${item.height}` : 'PNG 图片';
  $('resultInfo').textContent = `${item.model || '本地图片'} · ${dimensions}${item.seed == null ? '' : ` · seed ${item.seed}`}`;
  $('stageBadge').className = 'stage-badge';
  $('stageBadge').textContent = '作品预览';
  $('status').textContent = busy ? '新图片仍在生成；可以继续查看过往作品。' : '作品保存在本机；可下载 PNG，或在下方选择其他作品。';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showProgress() {
  if (!busy) return;
  shownResultId = '';
  $('result').hidden = true;
  $('progressState').hidden = false;
  $('backToProgress').hidden = true;
  $('showProgress').hidden = true;
  $('stageBadge').className = 'stage-badge running';
  $('stageBadge').textContent = '生成中';
  $('progressState').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setViewerScale(scale, anchorX, anchorY) {
  const image = $('viewerImage'), canvas = $('viewerCanvas');
  const before = image.getBoundingClientRect();
  const hasAnchor = Number.isFinite(anchorX) && Number.isFinite(anchorY) && before.width > 0 && before.height > 0;
  const relativeX = hasAnchor ? Math.max(0, Math.min(1, (anchorX - before.left) / before.width)) : 0;
  const relativeY = hasAnchor ? Math.max(0, Math.min(1, (anchorY - before.top) / before.height)) : 0;
  viewerScale = Math.max(1, Math.min(8, scale));
  if (image.naturalWidth && image.naturalHeight) {
    const fit = Math.min(1, (canvas.clientWidth - 40) / image.naturalWidth, (canvas.clientHeight - 40) / image.naturalHeight);
    image.style.width = `${Math.round(image.naturalWidth * fit * viewerScale)}px`;
    image.style.height = `${Math.round(image.naturalHeight * fit * viewerScale)}px`;
  }
  if (hasAnchor && viewerScale > 1) {
    const after = image.getBoundingClientRect();
    canvas.scrollLeft += after.left + relativeX * after.width - anchorX;
    canvas.scrollTop += after.top + relativeY * after.height - anchorY;
  } else if (viewerScale === 1) {
    canvas.scrollLeft = 0;
    canvas.scrollTop = 0;
  }
  $('viewerImage').classList.toggle('zoomed', viewerScale > 1);
  $('zoomValue').textContent = viewerScale === 1 ? '适应窗口' : `${Math.round(viewerScale * 100)}%`;
  $('zoomOut').disabled = viewerScale === 1;
  $('zoomIn').disabled = viewerScale === 8;
}

function openImageViewer() {
  const src = $('resultImage').getAttribute('src');
  if (!src) return;
  $('viewerImage').src = src;
  $('viewerInfo').textContent = $('resultInfo').textContent || '图片浏览';
  $('imageViewer').showModal();
  setViewerScale(1);
}

$('openImageViewer').addEventListener('click', openImageViewer);
$('closeImageViewer').addEventListener('click', () => $('imageViewer').close());
$('imageViewer').addEventListener('close', () => { viewerDrag = null; $('viewerImage').removeAttribute('src'); $('viewerImage').style.width = ''; $('viewerImage').style.height = ''; setViewerScale(1); });
$('zoomIn').addEventListener('click', () => setViewerScale(viewerScale + 0.5));
$('zoomOut').addEventListener('click', () => setViewerScale(viewerScale - 0.5));
$('zoomFit').addEventListener('click', () => setViewerScale(1));
$('viewerCanvas').addEventListener('wheel', event => {
  event.preventDefault();
  setViewerScale(viewerScale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX, event.clientY);
}, { passive: false });
$('viewerCanvas').addEventListener('pointerdown', event => {
  if (event.button !== 0 || viewerScale <= 1) return;
  event.preventDefault();
  viewerDragged = false;
  viewerDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
});
$('viewerCanvas').addEventListener('pointermove', event => {
  if (!viewerDrag || event.pointerId !== viewerDrag.id) return;
  const deltaX = event.clientX - viewerDrag.x, deltaY = event.clientY - viewerDrag.y;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 2) viewerDragged = true;
  event.currentTarget.scrollLeft -= deltaX;
  event.currentTarget.scrollTop -= deltaY;
  viewerDrag.x = event.clientX; viewerDrag.y = event.clientY;
});
function finishViewerDrag(event) {
  if (!viewerDrag || event.pointerId !== viewerDrag.id) return;
  viewerDrag = null;
  try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
}
$('viewerCanvas').addEventListener('pointerup', finishViewerDrag);
$('viewerCanvas').addEventListener('pointercancel', finishViewerDrag);
$('viewerImage').addEventListener('dragstart', event => event.preventDefault());
$('viewerImage').addEventListener('click', () => {
  if (viewerDragged) { viewerDragged = false; return; }
  setViewerScale(viewerScale === 1 ? 2 : 1);
});
$('viewerImage').addEventListener('load', () => setViewerScale(viewerScale));
$('backToProgress').addEventListener('click', showProgress);
$('showProgress').addEventListener('click', showProgress);

async function loadWorks() {
  const { items } = await json('/api/local-image/works');
  $('worksList').replaceChildren();
  $('worksEmpty').hidden = items.length > 0;
  const groups = new Map();
  for (const item of items) {
    const key = workDayKey(item.modifiedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const saved = groupState();
  let index = 0;
  for (const [key, works] of groups) {
    const group = document.createElement('details'); group.className = 'work-group'; group.dataset.day = key;
    group.open = Object.hasOwn(saved, key) ? Boolean(saved[key]) : index === 0;
    const summary = document.createElement('summary');
    const title = document.createElement('strong'); title.textContent = dayLabel(key);
    const count = document.createElement('span'); count.textContent = `${works.length} 张图片`;
    summary.append(title, count);
    const grid = document.createElement('div'); grid.className = 'work-grid';
    for (const item of works) {
      const tile = document.createElement('div'); tile.className = 'work-tile';
      const card = document.createElement('button'); card.type = 'button'; card.className = 'work-card';
      card.setAttribute('aria-label', `预览 ${item.prompt || item.name}`);
      const image = document.createElement('img'); image.src = item.url; image.alt = ''; image.loading = 'lazy';
      const copy = document.createElement('span'); copy.className = 'work-card-copy';
      const name = document.createElement('strong'); name.textContent = item.prompt || item.model || '本地生成图片';
      const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.modifiedAt));
      const meta = document.createElement('small'); meta.textContent = `${time} · ${item.model || (item.engine === 'api' ? '第三方 API' : '本机生成')}`;
      copy.append(name, meta); card.append(image, copy);
      card.addEventListener('click', () => showWork(item));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'work-delete'; remove.textContent = '删除';
      remove.setAttribute('aria-label', `删除图片 ${item.name}`);
      remove.addEventListener('click', () => { pendingImageDelete = item.id; $('deleteImageDialog').showModal(); });
      tile.append(card, remove); grid.append(tile);
    }
    group.append(summary, grid);
    group.addEventListener('toggle', () => { saveGroupState(key, group.open); updateGroupToggle(); });
    $('worksList').append(group);
    index++;
  }
  updateGroupToggle();
  return items;
}

$('cancelImageDelete').addEventListener('click', () => $('deleteImageDialog').close());
$('deleteImageDialog').addEventListener('close', () => { pendingImageDelete = ''; });
$('confirmImageDelete').addEventListener('click', async () => {
  const id = pendingImageDelete;
  if (!id) return;
  $('confirmImageDelete').disabled = true;
  try {
    await json(`/api/local-image/works/${encodeURIComponent(id)}`, { method: 'DELETE' });
    $('deleteImageDialog').close();
    if (shownResultId === id) {
      if ($('imageViewer').open) $('imageViewer').close();
      shownResultId = '';
      $('resultImage').removeAttribute('src'); $('download').removeAttribute('href');
      $('result').hidden = true; $('emptyState').hidden = false;
      $('stageBadge').textContent = '等待创作';
    }
    await loadWorks();
    $('status').textContent = '图片作品已删除。';
  } catch (error) { $('status').textContent = `删除失败：${error.message}`; }
  finally { $('confirmImageDelete').disabled = false; }
});

function renderJob(job) {
  busy = job.status === 'running';
  update();
  if (busy) {
    const browsingWork = Boolean(shownResultId && !$('result').hidden);
    $('emptyState').hidden = true; $('result').hidden = !browsingWork; $('progressState').hidden = browsingWork;
    $('backToProgress').hidden = !browsingWork;
    $('showProgress').hidden = !browsingWork;
    $('stageBadge').className = 'stage-badge running'; $('stageBadge').textContent = '生成中';
    $('progressTitle').textContent = job.phase || '正在生成图片';
    $('progressDetail').textContent = job.engine === 'api' ? '已向所选服务商提交请求，正在等待返回。' : '采样步数来自本机 ComfyUI；准备和保存阶段会持续显示状态。';
    if (job.total > 0) {
      $('generationProgress').value = Math.min(100, Math.round(job.step * 100 / job.total));
      $('progressCount').textContent = `采样 ${job.step} / ${job.total} 步`;
    } else {
      $('generationProgress').removeAttribute('value');
      $('progressCount').textContent = job.engine === 'api' ? '服务商未提供实时进度' : '等待采样数据';
    }
    $('progressElapsed').textContent = `已用 ${Math.max(0, Math.floor((Date.now() - job.startedAt) / 1000))} 秒`;
    $('activeProgress').hidden = false;
    $('activeProgressText').textContent = `${job.phase || '正在生成图片'} · ${job.total > 0 ? `采样 ${job.step}/${job.total} 步` : '等待采样数据'}`;
    if (job.total > 0) $('activeProgressBar').value = Math.min(100, Math.round(job.step * 100 / job.total));
    else $('activeProgressBar').removeAttribute('value');
    $('status').textContent = job.phase || '正在生成图片';
  } else if (job.status === 'completed' && job.result && handledJobId !== job.id) {
    handledJobId = job.id;
    $('activeProgress').hidden = true;
    $('backToProgress').hidden = true;
    $('showProgress').hidden = true;
    if (!shownResultId || $('result').hidden) {
      showWork(job.result);
      $('stageBadge').textContent = '生成完成';
      $('status').textContent = '图片已生成；作品已保存在本机。';
    } else {
      $('stageBadge').textContent = '新图片已生成';
      $('status').textContent = '新图片已生成；打开作品栏即可查看，当前预览保持不变。';
    }
    if (!$('libraryContent').hidden) loadWorks().catch(error => { $('status').textContent = `作品栏刷新失败：${error.message}`; });
  } else if (job.status === 'failed' && handledJobId !== job.id) {
    handledJobId = job.id;
    $('activeProgress').hidden = true;
    $('backToProgress').hidden = true;
    $('showProgress').hidden = true;
    $('progressState').hidden = true; $('emptyState').hidden = !($('result').hidden);
    $('stageBadge').className = 'stage-badge failed'; $('stageBadge').textContent = '生成未完成';
    $('status').textContent = `未完成：${job.error || '请查看生成服务状态'}`;
  }
}

async function pollJob() {
  const job = await json('/api/local-image/status');
  if (firstJobPoll) {
    firstJobPoll = false;
    if (job.status !== 'running') { busy = false; update(); return; }
  }
  renderJob(job);
}

const imageMemory = LastSettings.create('localframe.last.image.v1', ['engine', 'model', 'variant', 'prompt', 'negative', 'size', 'steps', 'apiBaseUrl', 'apiModel']);
imageMemory.restore(['engine', 'prompt', 'negative', 'size', 'steps', 'apiBaseUrl', 'apiModel']);
imageMemory.listen();
imageMemory.notice(document.querySelector('.image-settings .muted'));
$('clearPrompts').addEventListener('click', () => {
  for (const id of ['prompt', 'negative']) {
    const field = $(id);
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  $('promptClearStatus').textContent = '已清空；下次打开也不会恢复旧提示词';
  $('prompt').focus();
});
for (const id of ['prompt', 'negative']) $(id).addEventListener('input', () => {
  if ($(id).value) $('promptClearStatus').textContent = '同时清空提示词和反向提示词';
});
update();
$('engine').addEventListener('change', update);
$('variant').addEventListener('change', update);
$('refresh').addEventListener('click', () => refresh().catch(error => { $('status').textContent = error.message; }));
$('refreshWorks').addEventListener('click', () => loadWorks().catch(error => { $('status').textContent = error.message; }));
$('toggleLibrary').addEventListener('click', () => {
  const open = $('libraryContent').hidden;
  $('libraryContent').hidden = !open;
  $('toggleLibrary').textContent = open ? '收起过往图片' : '查看过往图片';
  $('toggleLibrary').setAttribute('aria-expanded', String(open));
  $('toggleGroups').hidden = $('refreshWorks').hidden = !open;
  if (open) loadWorks().catch(error => { $('status').textContent = error.message; });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!$('libraryContent').hidden) $('toggleLibrary').click();
  if (busy) { pollJob().catch(() => {}); return; }
  shownResultId = '';
  $('resultImage').removeAttribute('src'); $('download').removeAttribute('href');
  $('result').hidden = true;
  $('emptyState').hidden = busy;
  $('progressState').hidden = !busy;
  $('stageBadge').className = busy ? 'stage-badge running' : 'stage-badge';
  $('stageBadge').textContent = busy ? '生成中' : '等待创作';
  if (!busy) $('status').textContent = '选择生成方式并填写提示词，开始创作新图片。';
});
$('toggleGroups').addEventListener('click', () => {
  const groups = [...$('worksList').querySelectorAll('.work-group')], open = !groups.some(group => group.open);
  groups.forEach(group => { group.open = open; saveGroupState(group.dataset.day, open); });
  updateGroupToggle();
});
$('downloadModel').addEventListener('click', async () => {
  $('downloadModel').disabled = true;
  try {
    await json('/api/local-image/qwen/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant: $('variant').value }) });
    $('status').textContent = `正在下载 ${$('variant').value}；请保持工作台运行。`;
  } catch (error) { $('status').textContent = error.message; } finally { await refresh(); }
});
$('generate').addEventListener('click', async () => {
  const engine = $('engine').value;
  firstJobPoll = false;
  shownResultId = '';
  renderJob({ status: 'running', engine, phase: '正在提交任务', step: 0, total: 0, startedAt: Date.now() });
  try {
    const [width, height] = $('size').value.split('x').map(Number);
    const body = engine === 'api' ? { baseUrl: $('apiBaseUrl').value, model: $('apiModel').value, apiKey: $('apiKey').value, confirmed: $('apiConfirmed').checked, prompt: $('prompt').value, width, height }
      : { engine, model: $('model').value, variant: $('variant').value, prompt: $('prompt').value, negative: $('negative').value, width, height, steps: Number($('steps').value) };
    const route = engine === 'api' ? '/api/local-image/api/generate' : '/api/local-image/generate';
    const data = await json(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    renderJob(data.job);
    await pollJob();
  } catch (error) {
    renderJob({ id: `submit-${Date.now()}`, status: 'failed', error: error.message });
  }
});

Promise.allSettled([refresh().then(() => { imageMemory.restore(['model', 'variant']); update(); }), pollJob()]).then(results => {
  for (const result of results) if (result.status === 'rejected') $('status').textContent = result.reason.message;
});
setInterval(() => {
  if (state.qwen.download?.status === 'downloading') refresh().catch(() => {});
  pollJob().catch(error => { if (busy) $('status').textContent = `暂时无法读取生成进度：${error.message}`; });
}, 1500);
