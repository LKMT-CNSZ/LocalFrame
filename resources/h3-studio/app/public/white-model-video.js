'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let sourceUrl = null;
  const videoMemory = LastSettings.create('localframe.last.whiteVideo.v1', ['videoModel', 'videoPrompt', 'videoStrength']);
  videoMemory.restore(['videoPrompt', 'videoStrength']);
  videoMemory.listen();
  videoMemory.notice(document.querySelector('.video-settings h2'));
  $('videoStrengthValue').textContent = $('videoStrength').value;
  async function models() {
    const response = await fetch('/api/local-image/models'); const data = await response.json();
    $('videoModel').replaceChildren(...data.models.map(name => { const option = document.createElement('option'); option.value = option.textContent = name; return option; }));
    videoMemory.restore(['videoModel']);
    $('videoModelStatus').textContent = data.models.length ? `${data.models.length} 个本地检查点可用。建议使用标准 SD/SDXL 模型。` : `尚无本地图片检查点。请将模型放入 ${data.modelDirectory} 并刷新。`;
    $('renderVideo').disabled = !data.models.length || !$('whiteVideo').files.length;
  }
  $('refreshVideoModels').addEventListener('click', () => models().catch(error => { $('videoStatus').textContent = error.message; }));
  $('whiteVideo').addEventListener('change', () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const file = $('whiteVideo').files[0];
    $('sourceVideo').hidden = !file;
    $('sourceVideo').src = file ? (sourceUrl = URL.createObjectURL(file)) : '';
    $('renderVideo').disabled = !file || !$('videoModel').value;
    $('videoStatus').textContent = file ? `已选择 ${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB` : '请选择白模视频。';
  });
  $('videoStrength').addEventListener('input', () => { $('videoStrengthValue').textContent = $('videoStrength').value; });
  async function poll() {
    const response = await fetch('/api/white-model/video/status'); const data = await response.json();
    if (data.status === 'idle') return;
    $('videoStatus').textContent = `${data.phase}${data.total ? ` · ${data.frame}/${data.total} 帧` : ''}${data.error ? `：${data.error}` : ''}`;
    $('videoProgress').hidden = !data.total;
    $('videoProgress').value = data.total ? Math.round(data.frame * 100 / data.total) : 0;
    $('renderVideo').disabled = data.status === 'running' || !$('videoModel').value || !$('whiteVideo').files.length;
    if (data.status === 'completed' && data.result) {
      $('renderedVideo').src = data.result; $('renderedVideo').hidden = false;
      $('downloadVideo').href = data.result; $('downloadVideo').hidden = false;
    }
  }
  $('renderVideo').addEventListener('click', async () => {
    const file = $('whiteVideo').files[0]; if (!file) return;
    if (file.size > 150 * 1024 * 1024 || !/\.mp4$/i.test(file.name)) { $('videoStatus').textContent = '请选择不超过 150MB 的 MP4 视频'; return; }
    $('renderVideo').disabled = true; $('videoStatus').textContent = '正在将白模视频交给本机渲染服务…';
    try {
      const params = new URLSearchParams({ model: $('videoModel').value, prompt: $('videoPrompt').value, strength: $('videoStrength').value });
      const response = await fetch(`/api/white-model/video?${params}`, { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: file });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '无法提交视频');
      await poll();
    } catch (error) { $('videoStatus').textContent = `未完成：${error.message}`; $('renderVideo').disabled = false; }
  });
  models().then(poll).catch(error => { $('videoStatus').textContent = error.message; });
  setInterval(() => poll().catch(() => {}), 2000);
  window.addEventListener('pagehide', () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); });
})();
