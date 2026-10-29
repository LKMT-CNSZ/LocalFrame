'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(url) {
  for (let index = 0; index < 50; index += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start: ${url}`);
}

test('provider settings route saves configuration and performs actual API calls', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'localframe-server-'));
  const mock = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer integration-secret');
    if (request.method === 'GET') {
      assert.equal(request.url, '/v1/models');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'integration-model' }, { id: 'second-model' }] }));
      return;
    }
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const isTest = payload.messages?.some((message) => message.content === '只回复：连接成功');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: isTest ? '连接成功' : '优化后的电影感提示词' } }] }));
    });
  });
  const mockPort = await listen(mock);
  const mockVideo = http.createServer((request, response) => {
    if (request.url === '/result.mp4') {
      const bytes = Buffer.alloc(2048, 9);
      response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': bytes.length });
      response.end(bytes);
      return;
    }
    assert.equal(request.headers.authorization, 'Bearer video-integration-secret');
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'MiniMax-Hailuo-02' }, { id: 'video-01' }] }));
      return;
    }
    if (request.url === '/v1/video_generation') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ task_id: 'integration-video-task', status: 'submitted' }));
      return;
    }
    if (request.url.startsWith('/v1/query/video_generation')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ task_id: 'integration-video-task', status: 'Success', download_url: `http://127.0.0.1:${mockVideo.address().port}/result.mp4` }));
      return;
    }
    response.writeHead(404); response.end();
  });
  const mockVideoPort = await listen(mockVideo);
  const appPort = await freePort();
  const serverScript = path.join(__dirname, '..', 'resources', 'h3-studio', 'app', 'server.js');
  const child = spawn(process.execPath, [serverScript], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      H3_STUDIO_PORT: String(appPort),
      H3_ROOT_DIR: temp,
      H3_STORAGE_ROOT: temp,
      H3_DATA_DIR: path.join(temp, 'data'),
      H3_OUTPUT_DIR: path.join(temp, 'output'),
      H3_INSTALLER: path.join(temp, 'missing-installer.ps1'),
    },
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise((resolve) => mock.close(resolve));
    await new Promise((resolve) => mockVideo.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${appPort}`;
  await waitFor(`${base}/api/prompt-provider`);
  const optimizationResponse = await fetch(`${base}/api/optimization`);
  assert.equal(optimizationResponse.status, 200);
  const optimization = await optimizationResponse.json();
  assert.ok(Array.isArray(optimization.presets));
  assert.ok(optimization.presets.some((item) => item.id === 'q2_preview'));
  assert.ok(optimization.hardware.cpuThreads >= 1);
  const environmentResponse = await fetch(`${base}/api/environment`);
  assert.equal(environmentResponse.status, 200);
  const environment = await environmentResponse.json();
  assert.ok(Array.isArray(environment.components));
  assert.ok(Array.isArray(environment.assessment.checks));
  assert.equal(environment.assessment.plan.id, 'h3_int8');
  const professionalResponse = await fetch(`${base}/api/professional`);
  assert.equal(professionalResponse.status, 200);
  const professional = await professionalResponse.json();
  assert.equal(professional.edition, 'professional');
  assert.equal(professional.url, 'http://127.0.0.1:8188/');
  assert.ok(professional.features.some((item) => item.includes('ComfyUI')));
  const saveOptimizationResponse = await fetch(`${base}/api/optimization`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      presetId: 'q2_preview', slaMode: 'fast', spectrumMode: 'off', fastDisk: false,
    }),
  });
  assert.equal(saveOptimizationResponse.status, 200);
  const savedOptimization = await saveOptimizationResponse.json();
  assert.equal(savedOptimization.selected.id, 'q2_preview');
  assert.equal(savedOptimization.preferences.slaMode, 'fast');
  const settingsResponse = await fetch(`${base}/api/prompt-provider`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      enabled: true,
      baseUrl: `http://127.0.0.1:${mockPort}/v1/chat/completions`,
      model: 'integration-model', endpointMode: 'chat-completions', authMode: 'bearer', apiKey: 'integration-secret'
    })
  });
  assert.equal(settingsResponse.status, 200);
  const settings = await settingsResponse.json();
  assert.equal(settings.provider.hasApiKey, true);
  assert.equal(JSON.stringify(settings).includes('integration-secret'), false);

  const videoProviderResponse = await fetch(`${base}/api/video-providers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      providerId: 'minimax', enabled: true, baseUrl: `http://127.0.0.1:${mockVideoPort}`, model: 'MiniMax-Hailuo-02', apiKey: 'video-integration-secret', select: true,
    }),
  });
  assert.equal(videoProviderResponse.status, 200);
  const videoProviderState = (await videoProviderResponse.json()).state;
  assert.equal(videoProviderState.selectedProviderId, 'minimax');
  assert.equal(videoProviderState.providers.find((item) => item.id === 'minimax').configured, true);
  assert.equal(JSON.stringify(videoProviderState).includes('video-integration-secret'), false);
  const videoProviderTestResponse = await fetch(`${base}/api/video-providers/test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'minimax' }),
  });
  assert.equal(videoProviderTestResponse.status, 200);
  assert.match((await videoProviderTestResponse.json()).message, /不会产生费用/);
  const videoProviderDiscoveryResponse = await fetch(`${base}/api/video-providers/discover`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'minimax' }),
  });
  assert.equal(videoProviderDiscoveryResponse.status, 200);
  const videoProviderDiscovery = await videoProviderDiscoveryResponse.json();
  assert.equal(videoProviderDiscovery.providerId, 'minimax');
  assert.equal(videoProviderDiscovery.enumerated, true);
  assert.deepEqual(videoProviderDiscovery.models.map((item) => item.id), ['MiniMax-Hailuo-02', 'video-01']);
  assert.equal(videoProviderDiscovery.models[0].available, null);
  assert.equal(videoProviderDiscovery.models[0].verified, true);
  const videoProviderListResponse = await fetch(`${base}/api/video-providers`);
  const videoProviders = await videoProviderListResponse.json();
  assert.equal(videoProviders.providers.length, 8);
  assert.equal(videoProviders.providers.find((item) => item.id === 'kling-platform').configured, true);
  assert.equal(videoProviders.providers.find((item) => item.id === 'jimeng-platform').kind, 'platform');
  assert.equal(JSON.stringify(videoProviders).includes('video-integration-secret'), false);
  const generateVideoResponse = await fetch(`${base}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      prompt: '小满推门进入。\n小满：“这句不得发给视频模型。”\n声音：雨声渐近。',
      screenplay: '小满：“这句只能来自剧本。”', engine: 'minimax', width: 1366, height: 768, outputWidth: 1366, outputHeight: 768,
      nativeResolution: '768P', duration: 6, frames: 141, steps: 6, seed: 42,
    }),
  });
  assert.equal(generateVideoResponse.status, 202);
  let cloudJob;
  for (let index = 0; index < 50; index += 1) {
    const statusResponse = await fetch(`${base}/api/status`);
    cloudJob = (await statusResponse.json()).job;
    if (cloudJob?.status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(cloudJob.status, 'completed');
  assert.equal(cloudJob.providerId, 'minimax');
  assert.equal(cloudJob.cloud, true);
  assert.match(cloudJob.prompt, /小满推门进入/);
  assert.doesNotMatch(cloudJob.prompt, /这句不得发给视频模型|这句只能来自剧本/);
  assert.match(cloudJob.prompt, /雨声渐近/);
  assert.match(cloudJob.prompt, /禁止人物说话/);
  assert.ok(cloudJob.outputName.endsWith('.mp4'));
  const cloudHistory = await (await fetch(`${base}/api/history`)).json();
  assert.ok(cloudHistory.items.some((item) => item.id === cloudJob.id && item.providerId === 'minimax'));

  const platformSelectResponse = await fetch(`${base}/api/video-providers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'kling-platform', select: true }),
  });
  assert.equal(platformSelectResponse.status, 200);
  const platformGenerateResponse = await fetch(`${base}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      prompt: '雨夜中的红伞缓慢穿过街道', engine: 'kling-platform', width: 1280, height: 720,
      outputWidth: 1280, outputHeight: 720, duration: 5, frames: 124, steps: 1, seed: 42,
    }),
  });
  assert.equal(platformGenerateResponse.status, 202);
  const platformJob = (await platformGenerateResponse.json()).job;
  assert.equal(platformJob.platform, true);
  assert.equal(platformJob.handoff.shotNumber, 1);
  assert.match(platformJob.handoff.platformUrl, /^https:\/\/klingai\.kuaishou\.com\//);
  const inbox = path.join(temp, 'data', 'platform-inbox', platformJob.id);
  await fs.mkdir(inbox, { recursive: true });
  await fs.writeFile(path.join(inbox, 'download.mp4'), Buffer.alloc(4096, 7));
  const platformImportResponse = await fetch(`${base}/api/platform-handoff/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: platformJob.id, fileName: 'download.mp4' }),
  });
  assert.equal(platformImportResponse.status, 200);
  let importedPlatformJob;
  for (let index = 0; index < 30; index += 1) {
    importedPlatformJob = (await (await fetch(`${base}/api/status`)).json()).job;
    if (importedPlatformJob?.status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(importedPlatformJob.status, 'completed');
  assert.equal(importedPlatformJob.providerId, 'kling-platform');
  assert.ok(importedPlatformJob.outputName.endsWith('.mp4'));
  await fetch(`${base}/api/video-providers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'local-h3-int8', select: true }),
  });

  const editorContextResponse = await fetch(`${base}/api/editor/context`);
  assert.equal(editorContextResponse.status, 200);
  const editorContext = await editorContextResponse.json();
  assert.ok(editorContext.videos.some((item) => item.name === cloudJob.outputName));
  assert.ok(Array.isArray(editorContext.projects));

  const subtitlePreviewResponse = await fetch(`${base}/api/editor/subtitles/preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      screenplay: '苏小满：“这句字幕来自剧本。”\n旁白：所有准确文字都在后期加入。', duration: 4, includeSpeaker: true,
    }),
  });
  assert.equal(subtitlePreviewResponse.status, 200);
  const subtitlePreview = await subtitlePreviewResponse.json();
  assert.deepEqual(subtitlePreview.cues.map((cue) => cue.text), ['苏小满：这句字幕来自剧本。', '所有准确文字都在后期加入。']);

  const detectResponse = await fetch(`${base}/api/prompt-provider/detect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      baseUrl: `http://127.0.0.1:${mockPort}/v1/chat/completions`, endpointMode: 'auto', authMode: 'bearer'
    })
  });
  assert.equal(detectResponse.status, 200);
  const detection = await detectResponse.json();
  assert.ok(detection.services.some((item) => item.models.includes('integration-model')));
  assert.equal(detection.services.find((item) => item.models.includes('integration-model')).baseUrl, `http://127.0.0.1:${mockPort}/v1/chat/completions`);

  const testResponse = await fetch(`${base}/api/prompt-provider/test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(testResponse.status, 200);
  assert.equal((await testResponse.json()).ok, true);

  const optimizeResponse = await fetch(`${base}/api/prompt/optimize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: '一只猫走过雨夜' })
  });
  assert.equal(optimizeResponse.status, 200);
  const optimizedPrompt = (await optimizeResponse.json()).optimizedPrompt;
  assert.match(optimizedPrompt, /^优化后的电影感提示词/);
  assert.match(optimizedPrompt, /禁止出现字幕/);

  const createProjectResponse = await fetch(`${base}/api/workflow/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      title: '雨夜归途', brief: { idea: '一只猫在雨夜寻找回家的路', duration: 180, aspect: '9:16', delivery: '1080p' },
      generation: { quality: 'balanced', steps: 10, shotSeconds: 4, continuity: 'cut', audioMode: 'silent' },
    }),
  });
  assert.equal(createProjectResponse.status, 201);
  const project = (await createProjectResponse.json()).project;
  assert.ok(project.id);

  const viewBytes = Buffer.alloc(2048, 7);
  const viewData = `data:image/png;base64,${viewBytes.toString('base64')}`;
  const characterResponse = await fetch(`${base}/api/workflow/projects/${project.id}/characters`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      name: '林夏', description: '黑色短发，橙色夹克，银色腕表', confirmed: true,
      images: { front: viewData, side: viewData, back: viewData },
    }),
  });
  assert.equal(characterResponse.status, 200);
  const characterData = await characterResponse.json();
  assert.equal(characterData.character.confirmed, true);
  assert.deepEqual(Object.keys(characterData.character.views), ['front', 'side', 'back']);
  const characterImageResponse = await fetch(`${base}/api/workflow/projects/${project.id}/character-image/${characterData.character.views.front}`);
  assert.equal(characterImageResponse.status, 200);
  assert.equal((await characterImageResponse.arrayBuffer()).byteLength, viewBytes.length);

  const scriptResponse = await fetch(`${base}/api/workflow/projects/${project.id}/script`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(scriptResponse.status, 200);
  const scripted = (await scriptResponse.json()).project;
  assert.match(scripted.script.screenplay, /雨夜/);
  assert.match(scripted.script.screenplay, /主角：“[^”]+”/);
  assert.equal(scripted.script.source, 'local-template');

  const timelineResponse = await fetch(`${base}/api/workflow/projects/${project.id}/timeline`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(timelineResponse.status, 200);
  const timelined = (await timelineResponse.json()).project;
  assert.ok(timelined.timeline.cues.length >= 1);
  assert.match(timelined.timeline.scriptHash, /^[a-f0-9]{64}$/);
  assert.ok(timelined.timeline.cues.every((cue) => cue.end > cue.start && cue.text && cue.speaker && cue.voiceProfileId));
  assert.ok(timelined.timeline.cues.every((cue) => ['dialogue', 'narration'].includes(cue.kind)));
  const projectTimelinePreview = await fetch(`${base}/api/editor/subtitles/preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, duration: 180, includeSpeaker: false }),
  });
  assert.equal(projectTimelinePreview.status, 200);
  assert.deepEqual((await projectTimelinePreview.json()).cues.map((cue) => cue.text), timelined.timeline.cues.map((cue) => cue.text));

  const storyboardResponse = await fetch(`${base}/api/workflow/projects/${project.id}/storyboard`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(storyboardResponse.status, 200);
  const storyboarded = (await storyboardResponse.json()).project;
  assert.equal(storyboarded.characterModels[0].name, '林夏');
  assert.equal(storyboarded.storyboard.length, 45);
  assert.equal(storyboarded.storyboard.reduce((sum, shot) => sum + shot.seconds, 0), 180);
  assert.ok(storyboarded.storyboard.every((shot) => !/(?:[㐀-鿿A-Za-z0-9·]{1,16}\s*[：:]\s*[“"]|旁白\s*[：:]|声音\s*[：:])/.test(shot.prompt)));
  assert.ok(storyboarded.storyboard.every((shot) => /禁止出现字幕/.test(shot.prompt)));

  await fetch(`${base}/api/video-providers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'jimeng-platform', select: true }),
  });
  const platformPlanResponse = await fetch(`${base}/api/workflow/projects/${project.id}/plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(platformPlanResponse.status, 200);
  const platformPlan = (await platformPlanResponse.json()).plan;
  assert.equal(platformPlan.engine, 'jimeng-platform');
  assert.equal(platformPlan.environmentReady, true);
  assert.equal(platformPlan.segments, 45);
  assert.equal(platformPlan.audioMode, 'silent');
  await fetch(`${base}/api/video-providers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: 'local-h3-int8', select: true }),
  });

  const planResponse = await fetch(`${base}/api/workflow/projects/${project.id}/plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(planResponse.status, 200);
  const planned = await planResponse.json();
  assert.equal(planned.project.status, 'ready');
  assert.ok(['int8', 'q2'].includes(planned.plan.engine));
  assert.equal(planned.plan.segments, 45);
  assert.equal(planned.plan.steps, 10);
  assert.equal(planned.plan.continuityMode, 'cut');
  assert.equal(planned.plan.audioMode, 'silent');
  assert.equal(planned.plan.outputHeight, 1920);
  assert.ok(planned.plan.reasons.length >= 4);

  const customVoiceResponse = await fetch(`${base}/api/voice/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      name: '集成测试声音', promptText: '这是参考音频中准确说出的文字。',
      audioData: `data:audio/wav;base64,${Buffer.alloc(2048, 5).toString('base64')}`,
    }),
  });
  assert.equal(customVoiceResponse.status, 201);
  const customVoice = await customVoiceResponse.json();
  assert.equal(customVoice.profile.custom, true);
  assert.ok(customVoice.status.voices.some((item) => item.id === customVoice.profile.id));
  assert.equal(JSON.stringify(customVoice).includes('referenceFile'), false);

  const listProjectsResponse = await fetch(`${base}/api/workflow/projects`);
  assert.equal(listProjectsResponse.status, 200);
  assert.equal((await listProjectsResponse.json()).projects[0].id, project.id);

  const imagePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z8AARMAAAgMBApWl7QAAAABJRU5ErkJggg==';
  const mockImage = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer image-test-secret');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: [{ b64_json: imagePng }] }));
  });
  const imagePort = await listen(mockImage);
  t.after(() => new Promise(resolve => mockImage.close(resolve)));
  const imageStart = await fetch(`${base}/api/local-image/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: `http://127.0.0.1:${imagePort}`, model: 'test-image', apiKey: 'image-test-secret', confirmed: true, prompt: '一只猫', width: 512, height: 512 }),
  });
  assert.equal(imageStart.status, 202);
  assert.equal((await imageStart.json()).job.status, 'running');
  let imageStatus;
  for (let index = 0; index < 50; index += 1) {
    imageStatus = await (await fetch(`${base}/api/local-image/status`)).json();
    if (imageStatus.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(imageStatus.status, 'completed');
  assert.equal(JSON.stringify(imageStatus).includes('image-test-secret'), false);
  const works = await (await fetch(`${base}/api/local-image/works`)).json();
  assert.equal(works.items.length, 1);
  assert.equal(works.items[0].prompt, '一只猫');
  assert.equal(JSON.stringify(works).includes('image-test-secret'), false);
  const picture = await fetch(`${base}${works.items[0].url}`);
  assert.equal(picture.status, 200);
  assert.equal(picture.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await picture.arrayBuffer()).toString('base64'), imagePng);
  const denyImageDelete = await fetch(`${base}/api/local-image/works/${encodeURIComponent(works.items[0].id)}`, { method: 'DELETE', headers: { Origin: 'http://foreign.example' } });
  assert.equal(denyImageDelete.status, 403);
  assert.equal((await (await fetch(`${base}/api/local-image/works`)).json()).items.length, 1);
  const imageDelete = await fetch(`${base}/api/local-image/works/${encodeURIComponent(works.items[0].id)}`, { method: 'DELETE' });
  assert.equal(imageDelete.status, 200);
  assert.equal((await (await fetch(`${base}/api/local-image/works`)).json()).items.length, 0);
  assert.equal((await (await fetch(`${base}/api/local-image/status`)).json()).status, 'idle');
  const videoName = 'delete-test.mp4';
  await fs.writeFile(path.join(temp, 'output', videoName), Buffer.alloc(32));
  assert.ok((await (await fetch(`${base}/api/history`)).json()).items.some(item => item.outputName === videoName));
  const denyVideoDelete = await fetch(`${base}/api/history/${videoName}`, { method: 'DELETE', headers: { Origin: 'http://foreign.example' } });
  assert.equal(denyVideoDelete.status, 403);
  const videoDelete = await fetch(`${base}/api/history/${videoName}`, { method: 'DELETE' });
  assert.equal(videoDelete.status, 200);
  assert.equal((await (await fetch(`${base}/api/history`)).json()).items.some(item => item.outputName === videoName), false);
  assert.equal(await fs.stat(path.join(temp, 'output', videoName)).then(() => true, () => false), false);
});
