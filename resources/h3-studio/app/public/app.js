'use strict';

const $ = (id) => document.getElementById(id);
const ui = {
  prompt: $('prompt'), promptCount: $('promptCount'), examplePrompt: $('examplePrompt'),
  optimizePrompt: $('optimizePrompt'), providerCard: $('providerCard'), providerText: $('providerText'), providerState: $('providerState'),
  directorCard: $('directorCard'), directorMode: $('directorMode'), buildStoryboard: $('buildStoryboard'),
  storyboardSummary: $('storyboardSummary'), storyboardHelp: $('storyboardHelp'), storyboardList: $('storyboardList'),
  firstImage: $('firstImage'), lastImage: $('lastImage'), firstCard: $('firstCard'), lastCard: $('lastCard'),
  firstPreview: $('firstPreview'), lastPreview: $('lastPreview'), resolution: $('resolution'), duration: $('duration'), steps: $('steps'),
  enhancementMode: $('enhancementMode'), enhancementProfile: $('enhancementProfile'), enhancementNote: $('enhancementNote'),
  seed: $('seed'), randomizeSeed: $('randomizeSeed'), estimate: $('estimate'), generate: $('generateButton'), cancel: $('cancelButton'),
  stageEmpty: $('stageEmpty'), stageRunning: $('stageRunning'), stageResult: $('stageResult'), stageError: $('stageError'),
  phase: $('phaseText'), progressText: $('progressText'), progressBar: $('progressBar'), shotProgressText: $('shotProgressText'),
  shotStepText: $('shotStepText'), shotProgressBar: $('shotProgressBar'), elapsed: $('elapsedText'), jobSpec: $('jobSpec'),
  resultVideo: $('resultVideo'), replay: $('replayButton'), errorMessage: $('errorMessage'), retry: $('retryButton'), log: $('logOutput'),
  systemPill: $('systemPill'), gpuName: $('gpuName'), gpuMemory: $('gpuMemory'), gpuUsage: $('gpuUsage'), gpuTemp: $('gpuTemp'),
  historyGrid: $('historyGrid'), historyEmpty: $('historyEmpty'), refreshHistory: $('refreshHistory'),
  toggleHistoryGroups: $('toggleHistoryGroups'), openFolder: $('openFolder'), toast: $('toast'),
  creationMode: $('creationMode'), resolutionNote: $('resolutionNote'),
  environmentPanel: $('environmentPanel'), environmentPath: $('environmentPath'), componentGrid: $('componentGrid'),
  installEnvironment: $('installEnvironment'), openEnvironment: $('openEnvironment'), installProgress: $('installProgress'),
  changeEnvironment: $('changeEnvironment'), deploymentPlan: $('deploymentPlan'), deploymentSummary: $('deploymentSummary'),
  deploymentCheckGrid: $('deploymentCheckGrid'), environmentError: $('environmentError'), environmentLog: $('environmentLog'),
  installPhase: $('installPhase'), installPercent: $('installPercent'), installBar: $('installBar'),
  providerModal: $('providerModal'), providerForm: $('providerForm'), closeProvider: $('closeProvider'), providerPreset: $('providerPreset'),
  providerBaseUrl: $('providerBaseUrl'), providerModel: $('providerModel'), providerEndpointMode: $('providerEndpointMode'),
  providerAuthMode: $('providerAuthMode'), providerApiKey: $('providerApiKey'), providerEnabled: $('providerEnabled'),
  providerKeyHint: $('providerKeyHint'), providerTestState: $('providerTestState'), testProvider: $('testProvider'), saveProvider: $('saveProvider'),
  detectLocalProviders: $('detectLocalProviders'), providerDiscoveryPicker: $('providerDiscoveryPicker'),
  providerDiscoverySummary: $('providerDiscoverySummary'), detectedProvider: $('detectedProvider'), providerModels: $('providerModels'),
  videoProviderCard: $('videoProviderCard'), videoProviderText: $('videoProviderText'), videoProviderState: $('videoProviderState'),
  videoProviderModal: $('videoProviderModal'), videoProviderForm: $('videoProviderForm'), closeVideoProvider: $('closeVideoProvider'),
  videoProviderPreset: $('videoProviderPreset'), videoProviderBaseUrl: $('videoProviderBaseUrl'), videoProviderModel: $('videoProviderModel'),
  videoProviderModels: $('videoProviderModels'), videoNativeResolution: $('videoNativeResolution'), videoNativeResolutionHint: $('videoNativeResolutionHint'),
  videoProviderApiKey: $('videoProviderApiKey'), videoProviderAccessKey: $('videoProviderAccessKey'), videoProviderSecretKey: $('videoProviderSecretKey'),
  videoProviderEnabled: $('videoProviderEnabled'), videoCapabilities: $('videoCapabilities'), videoProviderTestState: $('videoProviderTestState'),
  testVideoProvider: $('testVideoProvider'), saveVideoProvider: $('saveVideoProvider'), videoApiKeyField: $('videoApiKeyField'),
  videoAccessKeyField: $('videoAccessKeyField'), videoSecretKeyField: $('videoSecretKeyField'), videoApiConfig: $('videoApiConfig'),
  videoProviderSwitch: $('videoProviderSwitch'), platformProviderInfo: $('platformProviderInfo'),
  platformHandoffBar: $('platformHandoffBar'), platformHandoffTitle: $('platformHandoffTitle'), platformHandoffText: $('platformHandoffText'),
  platformCopyPrompt: $('platformCopyPrompt'), platformOpenAssets: $('platformOpenAssets'), platformOpenSite: $('platformOpenSite'), platformChooseVideo: $('platformChooseVideo'),
  optimizerSummary: $('optimizerSummary'), optimizerBadge: $('optimizerBadge'), hardwareGpu: $('hardwareGpu'), hardwareRam: $('hardwareRam'),
  hardwareCpu: $('hardwareCpu'), hardwareDisk: $('hardwareDisk'), recommendationTitle: $('recommendationTitle'),
  recommendationReasons: $('recommendationReasons'), recommendationWarnings: $('recommendationWarnings'),
  optimizationPreset: $('optimizationPreset'), slaMode: $('slaMode'), spectrumMode: $('spectrumMode'), fastDisk: $('fastDisk'),
  optimizerTradeoff: $('optimizerTradeoff'), saveOptimization: $('saveOptimization'),
  basicWorkspace: $('basicWorkspace'), professionalWorkspace: $('professionalWorkspace'), postWorkspace: $('postWorkspace'),
  workflowWorkspace: $('workflowWorkspace'), workflowNewProject: $('workflowNewProject'), workflowSaveProject: $('workflowSaveProject'),
  workflowRefreshProjects: $('workflowRefreshProjects'), workflowProjectList: $('workflowProjectList'), workflowProjectEmpty: $('workflowProjectEmpty'),
  workflowSaveState: $('workflowSaveState'), workflowTitle: $('workflowTitle'), workflowIdea: $('workflowIdea'),
  workflowDuration: $('workflowDuration'), workflowAspect: $('workflowAspect'), workflowStyle: $('workflowStyle'),
  workflowAudience: $('workflowAudience'), workflowDialogue: $('workflowDialogue'), workflowDelivery: $('workflowDelivery'),
  workflowGenerateScript: $('workflowGenerateScript'), workflowScriptSource: $('workflowScriptSource'), workflowLogline: $('workflowLogline'),
  workflowOutline: $('workflowOutline'), workflowScreenplay: $('workflowScreenplay'), workflowCharacters: $('workflowCharacters'),
  workflowLocations: $('workflowLocations'), workflowVisualRules: $('workflowVisualRules'), workflowAudioRules: $('workflowAudioRules'),
  workflowAddCharacter: $('workflowAddCharacter'), workflowCharacterModelList: $('workflowCharacterModelList'),
  workflowBuildStoryboard: $('workflowBuildStoryboard'), workflowStoryboardList: $('workflowStoryboardList'),
  workflowBuildPlan: $('workflowBuildPlan'), workflowPlanContent: $('workflowPlanContent'),
  workflowGenerationQuality: $('workflowGenerationQuality'), workflowGenerationSteps: $('workflowGenerationSteps'),
  workflowShotSeconds: $('workflowShotSeconds'), workflowContinuity: $('workflowContinuity'), workflowAudioMode: $('workflowAudioMode'),
  workflowEnhancementMode: $('workflowEnhancementMode'), workflowEnhancementProfile: $('workflowEnhancementProfile'), workflowEnhancementNote: $('workflowEnhancementNote'),
  workflowPrepareEnvironment: $('workflowPrepareEnvironment'), workflowStartProduction: $('workflowStartProduction'),
  workflowProgressCard: $('workflowProgressCard'), workflowProgressTitle: $('workflowProgressTitle'),
  workflowProgressText: $('workflowProgressText'), workflowProgressPercent: $('workflowProgressPercent'),
  workflowProgressBar: $('workflowProgressBar'), workflowProgressMeta: $('workflowProgressMeta'),
  workflowShotProgressText: $('workflowShotProgressText'), workflowShotStepText: $('workflowShotStepText'), workflowShotProgressBar: $('workflowShotProgressBar'),
  workflowResultVideo: $('workflowResultVideo'), workflowProductionLog: $('workflowProductionLog'),
  professionalStatusCard: $('professionalStatusCard'), professionalStatusTitle: $('professionalStatusTitle'),
  professionalStatusText: $('professionalStatusText'), professionalPercent: $('professionalPercent'), professionalBar: $('professionalBar'),
  professionalFeatures: $('professionalFeatures'), professionalLog: $('professionalLog'), startProfessional: $('startProfessional'),
  refreshProfessional: $('refreshProfessional'), comfyFramePanel: $('comfyFramePanel'), comfyFrame: $('comfyFrame'),
  comfyAddress: $('comfyAddress'), reloadComfy: $('reloadComfy'),
  editorRefresh: $('editorRefresh'), editorVideoSelect: $('editorVideoSelect'), editorProjectSelect: $('editorProjectSelect'),
  editorScreenplay: $('editorScreenplay'), editorIncludeSpeaker: $('editorIncludeSpeaker'), editorAddVoice: $('editorAddVoice'), editorVoiceProfile: $('editorVoiceProfile'), editorExtract: $('editorExtract'),
  editorAddCue: $('editorAddCue'), editorCueList: $('editorCueList'), editorFontSize: $('editorFontSize'), editorMargin: $('editorMargin'),
  editorColor: $('editorColor'), editorBackground: $('editorBackground'), editorTimelineState: $('editorTimelineState'), editorState: $('editorState'), editorRender: $('editorRender'),
  editorSubtitleDownload: $('editorSubtitleDownload'), editorPreviewVideo: $('editorPreviewVideo'),
  voiceStudioStatus: $('voiceStudioStatus'), voiceStudioGrid: $('voiceStudioGrid'), voiceStudioText: $('voiceStudioText'),
  voiceStudioInstall: $('voiceStudioInstall'), voiceStudioInstallProgress: $('voiceStudioInstallProgress'),
  voiceStudioInstallBar: $('voiceStudioInstallBar'), voiceStudioInstallText: $('voiceStudioInstallText'),
  voiceStudioInstruction: $('voiceStudioInstruction'), voiceSpeed: $('voiceSpeed'), voicePause: $('voicePause'), voiceVariation: $('voiceVariation'),
  voiceSpeedValue: $('voiceSpeedValue'), voicePauseValue: $('voicePauseValue'), voiceVariationValue: $('voiceVariationValue'),
  voiceStudioSelection: $('voiceStudioSelection'), voiceStudioSave: $('voiceStudioSave'), voiceStudioPreview: $('voiceStudioPreview'), voiceStudioAudio: $('voiceStudioAudio'),
  voiceCloneName: $('voiceCloneName'), voiceCloneFile: $('voiceCloneFile'), voiceCloneTranscript: $('voiceCloneTranscript'),
  voiceCloneCreate: $('voiceCloneCreate'), voiceCloneState: $('voiceCloneState'),
};

const imageData = { first: null, last: null };
let pollTimer = null;
let lastJobStatus = null;
let toastTimer = null;
let currentEngine = 'int8';
let systemData = null;
let storyboard = [];
let storyboardBasePrompt = '';
let storyboardEdited = false;
let storyboardSource = '';
let promptOptimizedByAi = false;
let lastPreparedJobId = null;
let providerConfig = null;
let optimizationData = null;
let selectedProviderId = 'custom';
let discoveredProviders = [];
let professionalPollTimer = null;
let professionalAutoStart = false;
let workflowProject = null;
let workflowProjectsLoaded = false;
let workflowPollTimer = null;
let lastWorkflowJobStatus = null;
let workflowCharacterDrafts = [];
let backendRecoveryPromise = null;
let backendRecoveryAt = 0;
let enhancementData = null;
let voicePollTimer = null;
let workflowVoiceProfiles = [];
let videoProviderData = null;
let activePlatformAction = null;
let lastPlatformActionId = '';
let editorContextData = { videos: [], projects: [] };
let editorCues = [];
let editorTimelineDuration = 0;
let voiceStudioProfileId = 'female_narrator';

const apiEngines = ['minimax', 'kling', 'jimeng', 'doubao'];
const platformEngines = ['kling-platform', 'jimeng-platform'];
const cloudEngines = [...apiEngines, ...platformEngines];

const resolutionPresets = {
  int8: [
    ['640x384', '640 × 384 · 超低显存'],
    ['768x448', '768 × 448 · 低显存'],
    ['960x544', '960 × 544 · 12GB 显存稳定档'],
    ['1152x640', '1152 × 640 · 横屏均衡画质'],
    ['1344x768', '1344 × 768 · 横屏高画质'],
    ['544x960', '544 × 960 · 竖屏稳定档'],
    ['640x1152', '640 × 1152 · 竖屏均衡画质'],
    ['768x1344', '768 × 1344 · 竖屏高画质'],
    ['1344x768@1920x1080', '1920 × 1080 输出（内部 1344 × 768）'],
    ['768x1344@1080x1920', '1080 × 1920 输出（内部 768 × 1344）'],
    ['1344x768@2560x1440', '2560 × 1440 输出（内部 1344 × 768）'],
    ['768x1344@1440x2560', '1440 × 2560 输出（内部 768 × 1344）'],
  ],
  q2: [
    ['512x320', '512 × 320 · Q2 快速预览'],
    ['640x384', '640 × 384 · Q2 高负载'],
    ['320x512', '320 × 512 · Q2 竖屏预览'],
  ],
  minimax: [['1280x720', '720p · 横屏'], ['720x1280', '720p · 竖屏'], ['1920x1080', '1080p · 横屏'], ['1080x1920', '1080p · 竖屏']],
  kling: [['1280x720', '720p · 横屏'], ['720x1280', '720p · 竖屏'], ['1920x1080', '1080p · 横屏'], ['1080x1920', '1080p · 竖屏']],
  jimeng: [['1280x720', '720p · 横屏'], ['720x1280', '720p · 竖屏'], ['1920x1080', '1080p · 横屏'], ['1080x1920', '1080p · 竖屏']],
  doubao: [['1280x720', '720p · 横屏'], ['720x1280', '720p · 竖屏'], ['1920x1080', '1080p · 横屏'], ['1080x1920', '1080p · 竖屏']],
  'kling-platform': [['1280x720', '720p · 横屏'], ['720x1280', '720p · 竖屏'], ['1920x1080', '1080p · 横屏'], ['1080x1920', '1080p · 竖屏']],
  'jimeng-platform': [['1280x720', '720p · 横屏'], ['720x1280', '720p · 竖屏'], ['1920x1080', '1080p · 横屏'], ['1080x1920', '1080p · 竖屏']],
};

function selectedVideoModel(provider, modelId = provider?.model) {
  return provider?.models?.find((item) => item.id === modelId) || null;
}

function nativeResolutionOptions(provider, modelId = provider?.model) {
  const model = selectedVideoModel(provider, modelId);
  const resolutions = model?.nativeResolutions?.length
    ? model.nativeResolutions
    : (provider?.capabilities?.resolutions || []).map((id) => ({
      id,
      label: id.replace('P', 'p'),
      landscape: id === '1080P' ? [1920, 1080] : id === '768P' ? [1366, 768] : [1280, 720],
      portrait: id === '1080P' ? [1080, 1920] : id === '768P' ? [768, 1366] : [720, 1280],
    }));
  return resolutions.flatMap((resolution) => [
    [`${resolution.landscape[0]}x${resolution.landscape[1]}`, `${resolution.label} · 横屏 · 原生`, resolution.id],
    [`${resolution.portrait[0]}x${resolution.portrait[1]}`, `${resolution.label} · 竖屏 · 原生`, resolution.id],
  ]);
}

function engineResolutionPresets(engine) {
  if (!apiEngines.includes(engine)) return resolutionPresets[engine] || [];
  return nativeResolutionOptions(videoProviderById(engine));
}

async function loadEnhancementStatus() {
  try {
    enhancementData = await fetchJson('/api/enhancement');
    for (const select of [ui.enhancementMode, ui.workflowEnhancementMode]) {
      if (!select) continue;
      for (const option of select.options) {
        const state = enhancementData.modes?.[option.value];
        if (state && !state.ready && ['realesrgan', 'flashvsr'].includes(option.value) && !option.textContent.includes('未安装')) option.textContent += ' · 未安装';
      }
    }
    updateEnhancementNote();
  } catch {}
}

function enhancementLabel(mode) {
  return enhancementData?.modes?.[mode]?.label || ({ none: '关闭', lanczos: 'Lanczos 高清还原', realesrgan: 'Real-ESRGAN AI 清晰修复', flashvsr: 'FlashVSR 视频扩散二次采样' }[mode] || mode);
}

function updateEnhancementNote() {
  const mode = ui.enhancementMode?.value || 'none';
  const state = enhancementData?.modes?.[mode];
  if (ui.enhancementNote) ui.enhancementNote.innerHTML = `<strong>${enhancementLabel(mode)}</strong><span>${mode === 'none' ? '保持 H3 原始生成；1080p/2K 若仍需放大请明确选择修复方式。' : state?.ready === false ? '当前未检测到完整后端或权重，启动前会明确阻止，不会自动降级成普通插值。' : mode === 'flashvsr' ? '视频扩散二次采样会在 H3 完成并释放显存后单独运行，再校验帧数、时长、分辨率和音轨。' : mode === 'realesrgan' ? '逐帧执行第二次神经网络推理，再按原帧率重组并恢复音轨。' : '仅使用 Lanczos 与轻锐化，不会创造新的 AI 细节。'}</span>`;
  const workflowMode = ui.workflowEnhancementMode?.value || 'none';
  const workflowState = enhancementData?.modes?.[workflowMode];
  if (ui.workflowEnhancementNote) ui.workflowEnhancementNote.textContent = workflowState?.ready === false && ['realesrgan', 'flashvsr'].includes(workflowMode)
    ? `${enhancementLabel(workflowMode)} 当前未安装完整后端或权重；计划会保留选择，但生产前会明确提示。`
    : `已选择：${enhancementLabel(workflowMode)}。AI 修复只在全部短分镜合片后运行，不与 H3 同时抢占显卡。`;
}

function selectOrAppend(select, value, label) {
  let option = [...select.options].find((item) => item.value === String(value));
  if (!option) {
    option = document.createElement('option');
    option.value = String(value); option.textContent = label || String(value);
    select.append(option);
  }
  select.value = String(value);
}

function selectedOptimizationProfile() {
  if (!optimizationData) return null;
  if (ui.optimizationPreset.value === 'auto') return optimizationData.recommended;
  return optimizationData.presets.find((item) => item.id === ui.optimizationPreset.value) || optimizationData.selected;
}

function describeOptimizationChoice() {
  const profile = selectedOptimizationProfile();
  if (!profile) return;
  ui.optimizerTradeoff.textContent = `${profile.description} ${profile.tradeoff}`;
  ui.saveOptimization.textContent = ui.optimizationPreset.value === 'auto' ? '应用推荐' : '应用此方案';
}

function applyOptimizationDefaults(profile) {
  if (!profile?.defaults) return;
  setEngine(profile.engine || 'int8');
  const resolution = `${profile.defaults.width}x${profile.defaults.height}`;
  selectOrAppend(ui.resolution, resolution, `${profile.defaults.width} × ${profile.defaults.height} · ${profile.label}`);
  selectOrAppend(ui.duration, profile.defaults.duration, `约 ${profile.defaults.duration} 秒 · ${profile.label}`);
  selectOrAppend(ui.steps, profile.defaults.steps, `${profile.defaults.steps} 步 · ${profile.label}`);
  updateEstimate();
}

function renderOptimization(data, applyDefaults = false) {
  optimizationData = data;
  ui.optimizationPreset.replaceChildren();
  const auto = document.createElement('option');
  auto.value = 'auto'; auto.textContent = `自动推荐 · ${data.recommended.label}`;
  ui.optimizationPreset.append(auto);
  for (const preset of data.presets) {
    const option = document.createElement('option'); option.value = preset.id;
    option.textContent = `${preset.label} · ${preset.badge}`; ui.optimizationPreset.append(option);
  }
  ui.spectrumMode.replaceChildren();
  for (const mode of data.spectrumModes) {
    const option = document.createElement('option'); option.value = mode.id;
    option.textContent = `${mode.label}${mode.id === 'off' ? ' · 推荐' : ' · 实验'}`;
    if (mode.id !== 'off' && !data.spectrumAvailable) option.disabled = true;
    ui.spectrumMode.append(option);
  }
  ui.optimizationPreset.value = data.preferences.presetId;
  ui.slaMode.value = data.preferences.slaMode;
  ui.spectrumMode.value = data.spectrumAvailable ? data.preferences.spectrumMode : 'off';
  ui.fastDisk.value = data.preferences.fastDisk === true ? 'on' : data.preferences.fastDisk === false ? 'off' : 'auto';
  const hardware = data.hardware || {};
  const gpu = hardware.selectedGpu;
  ui.hardwareGpu.textContent = gpu ? `${gpu.name} · ${gpu.vramGb || '?'}GB` : '未检测到 NVIDIA 独显';
  ui.hardwareRam.textContent = `${hardware.memoryGb || '?'}GB · 可用 ${hardware.freeMemoryGb || '?'}GB`;
  ui.hardwareCpu.textContent = `${hardware.cpuCores || '?'} 核 / ${hardware.cpuThreads || '?'} 线程`;
  ui.hardwareDisk.textContent = `${hardware.storage?.fast ? 'SSD / NVMe' : '普通磁盘'} · ${hardware.storage?.freeGb ?? '?'}GB 可用`;
  ui.optimizerBadge.textContent = `${data.selected.label} · 已启用`;
  ui.optimizerSummary.textContent = `已自动检测 ${gpu?.name || hardware.cpu || '本机硬件'}，所有参数在本机应用。`;
  ui.recommendationTitle.textContent = `推荐：${data.recommended.label}`;
  ui.recommendationReasons.textContent = data.reasons.join(' · ');
  ui.recommendationWarnings.textContent = data.warnings.join('；');
  describeOptimizationChoice();
  if (applyDefaults) applyOptimizationDefaults(data.selected);
}

async function loadOptimization(applyDefaults = false) {
  try { renderOptimization(await fetchJson('/api/optimization'), applyDefaults); }
  catch (error) { ui.optimizerSummary.textContent = `优化检测失败：${error.message}`; }
}

async function saveOptimization() {
  ui.saveOptimization.disabled = true;
  ui.saveOptimization.textContent = '正在应用…';
  try {
    const data = await fetchJson('/api/optimization', {
      method: 'POST',
      body: JSON.stringify({
        presetId: ui.optimizationPreset.value,
        slaMode: ui.slaMode.value,
        spectrumMode: ui.spectrumMode.value,
        fastDisk: ui.fastDisk.value === 'on' ? true : ui.fastDisk.value === 'off' ? false : null,
      }),
    });
    renderOptimization(data, true);
    toast(`${data.selected.label}已应用${data.restarted ? '，本地引擎已重启' : ''}`);
  } catch (error) { toast(error.message, true); }
  finally { ui.saveOptimization.disabled = false; describeOptimizationChoice(); }
}

function parseResolution() {
  const [base, output = base] = ui.resolution.value.split('@');
  const [width, height] = base.split('x').map(Number);
  const [outputWidth, outputHeight] = output.split('x').map(Number);
  return { width, height, outputWidth, outputHeight, upscale: output !== base };
}

function gridFrames(seconds) {
  return 5 + Math.max(0, Math.round((Math.max(5, Math.round(seconds * 24)) - 5) / 17)) * 17;
}

async function recoverLocalBackend(force = false) {
  if (!window.localFrame?.restartBackend) return false;
  if (backendRecoveryPromise) return backendRecoveryPromise;
  if (!force && Date.now() - backendRecoveryAt < 5000) return false;
  backendRecoveryAt = Date.now();
  backendRecoveryPromise = window.localFrame.restartBackend()
    .then(() => true)
    .catch(() => false)
    .finally(() => { backendRecoveryPromise = null; });
  return backendRecoveryPromise;
}

async function fetchJson(url, options = {}) {
  const request = () => fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let response;
  try {
    response = await request();
  } catch (error) {
    const recovered = await recoverLocalBackend();
    if (!recovered) throw new Error('本地服务暂时断开，正在自动恢复；请稍等几秒后重试');
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { response = await request(); }
    catch { throw new Error('本地服务正在重新启动，请稍等几秒后重试'); }
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.toggle('error', error);
  ui.toast.classList.add('show');
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 3300);
}

function stopProfessionalPolling() {
  if (professionalPollTimer) clearTimeout(professionalPollTimer);
  professionalPollTimer = null;
}

function scheduleProfessionalPoll() {
  stopProfessionalPolling();
  professionalPollTimer = setTimeout(() => loadProfessional(), 1600);
}

function professionalLabel(status) {
  return {
    missing: '节点编辑环境待安装',
    installing: '正在部署节点编辑环境',
    ready: '节点编辑环境已就绪',
    starting: '正在启动 ComfyUI',
    running: 'ComfyUI 节点编辑运行中',
    busy: 'ComfyUI 正在生成',
    failed: '节点环境启动失败',
    stopped: 'ComfyUI 已停止',
  }[status] || '正在检测节点环境';
}

function renderProfessional(data) {
  const status = data.status || 'stopped';
  ui.professionalStatusCard.classList.toggle('running', status === 'running' || status === 'busy');
  ui.professionalStatusCard.classList.toggle('failed', status === 'failed');
  ui.professionalStatusTitle.textContent = professionalLabel(status);
  ui.professionalStatusText.textContent = data.error || data.phase || '等待操作';
  const progress = status === 'running' || status === 'busy' || status === 'ready' ? 100
    : status === 'starting' ? 70
      : Number(data.installProgress || 0);
  ui.professionalPercent.textContent = `${progress}%`;
  ui.professionalBar.style.width = `${Math.max(status === 'starting' ? 8 : 0, progress)}%`;
  ui.comfyAddress.textContent = data.url || 'http://127.0.0.1:8188/';

  ui.professionalFeatures.replaceChildren();
  for (const feature of data.features || []) {
    const item = document.createElement('span');
    item.textContent = feature;
    ui.professionalFeatures.append(item);
  }
  ui.professionalLog.textContent = data.logs?.length ? data.logs.join('\n') : (data.error || '等待操作…');

  const busy = status === 'installing' || status === 'starting' || status === 'busy';
  ui.startProfessional.disabled = busy || status === 'running';
  ui.startProfessional.textContent = status === 'installing' ? `正在安装 ${data.installProgress || 0}%`
    : status === 'starting' ? '正在启动…'
      : status === 'busy' ? '生成中，控制台稍后恢复'
      : status === 'running' ? '节点画布已打开'
        : data.ready ? '打开节点画布' : '一键安装并打开';

  const running = status === 'running' && data.running && data.responsive !== false;
  ui.comfyFramePanel.classList.toggle('hidden', !running);
  if (running && ui.comfyFrame.src !== data.url) ui.comfyFrame.src = data.url;
  if (busy) scheduleProfessionalPoll(); else stopProfessionalPolling();
}

async function loadProfessional() {
  try {
    const data = await fetchJson('/api/professional');
    renderProfessional(data);
    if (professionalAutoStart && data.status === 'ready') await startProfessionalMode();
  } catch (error) {
    ui.professionalStatusCard.classList.add('failed');
    ui.professionalStatusTitle.textContent = '节点环境检测失败';
    ui.professionalStatusText.textContent = error.message;
    stopProfessionalPolling();
  }
}

async function startProfessionalMode() {
  professionalAutoStart = true;
  ui.startProfessional.disabled = true;
  ui.startProfessional.textContent = '正在准备…';
  try {
    const data = await fetchJson('/api/professional/start', { method: 'POST', body: '{}' });
    renderProfessional(data);
    if (data.status === 'running' || data.status === 'busy') professionalAutoStart = false;
  } catch (error) {
    professionalAutoStart = false;
    toast(error.message, true);
    await loadProfessional();
  }
}

const workspaceCopy = {
  basic: ['01 / 快速创作', '从一个想法开始', '输入描述或参考图片，选择生成方式并查看进度；完成的作品保存在本机。', '视频创作'],
  workflow: ['02 / 项目制作', '把故事做成完整作品', '整理剧本、角色和分镜，在同一个项目中跟进生成与合片。', '项目工作流'],
  'local-image': ['03 / 图片创作', '画面从这里生成', '选择本机图片模型或自行配置的 API，查看采样进度和历史作品。', '图片创作'],
  'white-model': ['04 / 三维与转绘', '预览白模，转换画风', '导入三维模型进行本机预览，或将白模视频逐帧转绘为动画。', '三维与视频'],
  post: ['05 / 后期制作', '为画面加入声音与字幕', '编辑时间轴、分配角色声线，再导出配音与字幕成片。', '声音与字幕'],
  professional: ['06 / 节点编辑', '按自己的方式连接工作流', '打开 ComfyUI 节点画布，管理模型、节点和任务队列。', '高级工具'],
};
function setAppMode(mode) {
  const professional = mode === 'professional';
  const workflow = mode === 'workflow';
  const post = mode === 'post';
  const whiteModel = mode === 'white-model';
  const localImage = mode === 'local-image';
  document.querySelectorAll('[data-app-mode]').forEach((button) => {
    const active = button.dataset.appMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const [kicker, title, description, meta] = workspaceCopy[mode] || workspaceCopy.basic;
  $('workspaceKicker').textContent = kicker;
  $('workspaceTitle').textContent = title;
  $('workspaceDescription').textContent = description;
  $('workspaceMeta').textContent = meta;
  ui.basicWorkspace.classList.toggle('hidden', professional || workflow || post || whiteModel || localImage);
  $('whiteModelWorkspace').classList.toggle('hidden', !whiteModel);
  $('localImageWorkspace').classList.toggle('hidden', !localImage);
  if (whiteModel && !$('whiteModelFrame').getAttribute('src')) $('whiteModelFrame').src = $('whiteModelFrame').dataset.src;
  if (localImage && !$('localImageFrame').getAttribute('src')) $('localImageFrame').src = $('localImageFrame').dataset.src;
  ui.workflowWorkspace.classList.toggle('hidden', !workflow);
  ui.professionalWorkspace.classList.toggle('hidden', !professional);
  ui.postWorkspace.classList.toggle('hidden', !post);
  try { localStorage.setItem('localframe.edition', mode); } catch {}
  if (professional) loadProfessional();
  if (workflow) {
    loadWorkflowProjects();
    pollWorkflowStatus();
  }
  if (post) loadPostStudio();
}

function renderVoiceStatus(data) {
  if (!data) return;
  workflowVoiceProfiles = data.voices || [];
  if (ui.editorVoiceProfile) {
    const editorCurrent = ui.editorVoiceProfile.value || data.settings?.profileId || 'female_narrator';
    ui.editorVoiceProfile.replaceChildren();
    for (const profile of data.voices || []) {
      const option = document.createElement('option'); option.value = profile.id; option.textContent = profile.label;
      option.title = profile.description || profile.instruction || '';
      ui.editorVoiceProfile.append(option);
    }
    selectOrAppend(ui.editorVoiceProfile, editorCurrent);
  }
  const voiceCount = workflowVoiceProfiles.length;
  const install = data.install || {};
  const installing = install.status === 'running';
  if (ui.voiceStudioStatus) {
    const loading = data.service?.status === 'loading';
    ui.voiceStudioStatus.textContent = data.running
      ? `${voiceCount} 种声线 · 引擎已启动`
      : loading
        ? `${voiceCount} 种声线 · CPU 正在载入模型（${Math.max(1, Math.round((data.service.elapsedSeconds || 0) / 60))} 分钟）`
        : data.ready ? `${voiceCount} 种声线 · 使用时自动启动` : `${voiceCount} 种声线 · 需先安装模型`;
    ui.voiceStudioPreview.disabled = !data.ready;
    renderVoiceStudioProfiles(data.settings);
  }
  if (ui.voiceStudioInstall) {
    ui.voiceStudioInstall.textContent = data.ready ? '检查 / 修复语音环境' : '一键安装语音模型';
    ui.voiceStudioInstall.disabled = installing;
  }
  if (ui.voiceStudioInstallProgress) ui.voiceStudioInstallProgress.classList.toggle('hidden', !installing && install.status === 'idle');
  if (ui.voiceStudioInstallBar) ui.voiceStudioInstallBar.style.width = `${Math.min(100, Math.max(0, install.progress || 0))}%`;
  if (ui.voiceStudioInstallText) ui.voiceStudioInstallText.textContent = install.phase || '等待安装';
  if (editorCues.length) renderEditorCues();
  if (!installing && voicePollTimer) { clearInterval(voicePollTimer); voicePollTimer = null; }
}

async function loadVoiceStatus() {
  try { renderVoiceStatus(await fetchJson('/api/voice')); }
  catch (error) { if (ui.voiceStudioStatus) ui.voiceStudioStatus.textContent = `语音服务检测失败：${error.message}`; }
}

async function installVoiceEngine() {
  ui.voiceStudioInstall.disabled = true;
  try {
    const data = await fetchJson('/api/voice/install', { method: 'POST', body: '{}' });
    renderVoiceStatus(data.status);
    toast('CosyVoice 安装已启动，支持断点继续');
    if (voicePollTimer) clearInterval(voicePollTimer);
    voicePollTimer = setInterval(loadVoiceStatus, 1500);
  } catch (error) { toast(error.message, true); ui.voiceStudioInstall.disabled = false; }
}

function selectVoiceStudioProfile(profileId, applyDefaults = true) {
  const profile = workflowVoiceProfiles.find((item) => item.id === profileId) || workflowVoiceProfiles[0];
  if (!profile) return;
  voiceStudioProfileId = profile.id;
  ui.voiceStudioGrid.querySelectorAll('.voice-choice').forEach((button) => button.classList.toggle('active', button.dataset.profileId === profile.id));
  ui.voiceStudioSelection.textContent = `${profile.label} · ${profile.description}`;
  if (applyDefaults) {
    ui.voiceSpeed.value = profile.speed || 1;
    ui.voicePause.value = profile.pauseScale || 1;
    ui.voiceVariation.value = Math.min(0.02, profile.variation ?? 0.008);
    ui.voiceStudioInstruction.value = '';
    updateVoiceStudioValues();
  }
}

function renderVoiceStudioProfiles(settings = {}) {
  if (!ui.voiceStudioGrid || !workflowVoiceProfiles.length) return;
  const firstRender = ui.voiceStudioGrid.childElementCount === 0;
  ui.voiceStudioGrid.replaceChildren();
  for (const profile of workflowVoiceProfiles) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'voice-choice'; button.dataset.profileId = profile.id;
    const label = document.createElement('b'); label.textContent = profile.label;
    const description = document.createElement('small'); description.textContent = profile.description || '';
    button.append(label, description);
    button.addEventListener('click', () => selectVoiceStudioProfile(profile.id, true));
    ui.voiceStudioGrid.append(button);
  }
  if (firstRender) {
    voiceStudioProfileId = settings.profileId || voiceStudioProfileId;
    const profile = workflowVoiceProfiles.find((item) => item.id === voiceStudioProfileId) || workflowVoiceProfiles[0];
    ui.voiceSpeed.value = settings.speed ?? profile.speed ?? 1;
    ui.voicePause.value = settings.pauseScale ?? profile.pauseScale ?? 1;
    ui.voiceVariation.value = settings.variation ?? Math.min(0.02, profile.variation ?? 0.008);
    ui.voiceStudioInstruction.value = settings.instruction || '';
    updateVoiceStudioValues();
  }
  selectVoiceStudioProfile(voiceStudioProfileId, false);
}

function updateVoiceStudioValues() {
  ui.voiceSpeedValue.textContent = Number(ui.voiceSpeed.value).toFixed(2);
  ui.voicePauseValue.textContent = Number(ui.voicePause.value).toFixed(2);
  ui.voiceVariationValue.textContent = Number(ui.voiceVariation.value).toFixed(3);
}

function voiceStudioPayload() {
  return {
    profileId: voiceStudioProfileId, text: ui.voiceStudioText.value.trim(), instruction: ui.voiceStudioInstruction.value.trim(),
    speed: Number(ui.voiceSpeed.value), pauseScale: Number(ui.voicePause.value), variation: Number(ui.voiceVariation.value),
  };
}

async function previewVoiceStudio() {
  if (!ui.voiceStudioText.value.trim()) { toast('请先输入试听文字', true); return; }
  ui.voiceStudioPreview.disabled = true; ui.voiceStudioPreview.textContent = '正在合成…';
  try {
    const data = await fetchJson('/api/voice/preview', { method: 'POST', body: JSON.stringify(voiceStudioPayload()) });
    ui.voiceStudioAudio.src = `${data.url}?t=${Date.now()}`;
    ui.voiceStudioAudio.classList.remove('hidden');
    await ui.voiceStudioAudio.play();
  } catch (error) { toast(error.message, true); await loadVoiceStatus(); }
  finally { ui.voiceStudioPreview.disabled = false; ui.voiceStudioPreview.textContent = '生成试听'; }
}

async function saveVoiceStudioDefaults() {
  try {
    const payload = voiceStudioPayload();
    const data = await fetchJson('/api/voice/settings', {
      method: 'POST', body: JSON.stringify({ ...payload, enabled: true, replaceNativeSpeech: true }),
    });
    renderVoiceStatus(data.status);
    toast(`${workflowVoiceProfiles.find((item) => item.id === voiceStudioProfileId)?.label || '声线'}已设为默认`);
  } catch (error) { toast(error.message, true); }
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('无法读取参考音频'));
    reader.readAsDataURL(file);
  });
}

async function createCustomVoice() {
  const file = ui.voiceCloneFile.files?.[0];
  if (!ui.voiceCloneName.value.trim()) { ui.voiceCloneName.focus(); toast('请填写声音名称', true); return; }
  if (!file) { toast('请选择参考音频', true); return; }
  if (!ui.voiceCloneTranscript.value.trim()) { ui.voiceCloneTranscript.focus(); toast('请填写参考音频逐字稿', true); return; }
  if (file.size > 20 * 1024 * 1024) { toast('参考音频不能超过 20MB', true); return; }
  ui.voiceCloneCreate.disabled = true; ui.voiceCloneCreate.textContent = '正在保存…'; ui.voiceCloneState.textContent = '参考音频仅写入本机语音目录';
  try {
    const data = await fetchJson('/api/voice/custom', {
      method: 'POST', body: JSON.stringify({
        name: ui.voiceCloneName.value.trim(), promptText: ui.voiceCloneTranscript.value.trim(), audioData: await fileAsDataUrl(file),
      }),
    });
    renderVoiceStatus(data.status);
    selectVoiceStudioProfile(data.profile.id, true);
    ui.voiceCloneState.textContent = `${data.profile.label} 已加入本地声线库`;
    ui.voiceCloneName.value = ''; ui.voiceCloneTranscript.value = ''; ui.voiceCloneFile.value = '';
    toast('自定义声音已保存，可分配给任意剧本角色');
  } catch (error) { ui.voiceCloneState.textContent = `保存失败：${error.message}`; toast(error.message, true); }
  finally { ui.voiceCloneCreate.disabled = false; ui.voiceCloneCreate.textContent = '保存为本地声线'; }
}

function renderEditorCues() {
  ui.editorCueList.replaceChildren();
  if (!editorCues.length) {
    const empty = document.createElement('div'); empty.className = 'workflow-placeholder'; empty.textContent = '请选择成片并让 AI 生成时间轴，或手动添加第一条台词。';
    ui.editorCueList.append(empty);
    ui.editorTimelineState.textContent = '尚未生成台词轴';
    return;
  }
  editorCues.forEach((cue, index) => {
    cue.id = index + 1;
    cue.kind = cue.kind === 'narration' ? 'narration' : 'dialogue';
    cue.speaker ||= cue.kind === 'narration' ? '旁白' : '角色';
    cue.voiceProfileId ||= ui.editorVoiceProfile.value || 'female_narrator';
    const row = document.createElement('div'); row.className = 'workflow-timeline-row';
    const number = document.createElement('b'); number.className = 'workflow-timeline-number'; number.textContent = String(index + 1).padStart(2, '0');
    const times = document.createElement('div'); times.className = 'workflow-timeline-time';
    const start = document.createElement('input'); start.type = 'number'; start.min = '0'; start.step = '0.01'; start.value = Number(cue.start || 0).toFixed(2); start.title = '开始时间（秒）';
    const end = document.createElement('input'); end.type = 'number'; end.min = '0.2'; end.step = '0.01'; end.value = Number(cue.end || 0).toFixed(2); end.title = '结束时间（秒）';
    const arrow = document.createElement('span'); arrow.textContent = '→'; times.append(start, arrow, end);
    const track = document.createElement('div'); track.className = 'workflow-timeline-track';
    const meta = document.createElement('div'); meta.className = 'workflow-timeline-meta';
    const kind = document.createElement('button'); kind.type = 'button'; kind.className = `workflow-timeline-kind${cue.kind === 'narration' ? ' narration' : ''}`; kind.textContent = cue.kind === 'narration' ? '旁白' : '对白'; kind.title = '点击切换旁白 / 对白';
    const speaker = document.createElement('input'); speaker.className = 'editor-timeline-speaker'; speaker.type = 'text'; speaker.maxLength = 40; speaker.value = cue.speaker; speaker.title = '说话人';
    const clock = document.createElement('small'); clock.textContent = `${formatTimelineTime(cue.start)} – ${formatTimelineTime(cue.end)}`;
    meta.append(kind, speaker, clock);
    const text = document.createElement('input'); text.type = 'text'; text.maxLength = 160; text.value = cue.text || ''; text.title = '字幕与配音共用台词';
    track.append(meta, text);
    const voiceSelect = document.createElement('select'); voiceSelect.className = 'workflow-timeline-voice'; voiceSelect.title = '此片段使用的角色声线';
    for (const profile of workflowVoiceProfiles) voiceSelect.append(new Option(profile.label, profile.id));
    selectOrAppend(voiceSelect, cue.voiceProfileId, cue.voiceProfileId);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'workflow-timeline-remove'; remove.textContent = '×'; remove.title = '删除台词片段';
    const update = () => {
      cue.start = Math.max(0, Number(start.value) || 0);
      cue.end = Math.max(cue.start + 0.2, Number(end.value) || cue.start + 2);
      cue.speaker = speaker.value.trim() || (cue.kind === 'narration' ? '旁白' : '角色');
      cue.text = text.value.trim();
      cue.voiceProfileId = voiceSelect.value || ui.editorVoiceProfile.value || 'female_narrator';
      clock.textContent = `${formatTimelineTime(cue.start)} – ${formatTimelineTime(cue.end)}`;
      ui.editorTimelineState.textContent = `${editorCues.length} 条台词 / 声音片段 · 已修改，烧录前会自动校准时间`;
    };
    kind.addEventListener('click', () => {
      cue.kind = cue.kind === 'narration' ? 'dialogue' : 'narration';
      kind.textContent = cue.kind === 'narration' ? '旁白' : '对白';
      kind.classList.toggle('narration', cue.kind === 'narration');
      if (!speaker.value.trim() || ['旁白', '角色'].includes(speaker.value.trim())) speaker.value = cue.kind === 'narration' ? '旁白' : '角色';
      update();
    });
    start.addEventListener('change', update); end.addEventListener('change', update); speaker.addEventListener('input', update); text.addEventListener('input', update); voiceSelect.addEventListener('change', update);
    remove.addEventListener('click', () => { editorCues.splice(index, 1); renderEditorCues(); });
    row.append(number, times, track, voiceSelect, remove); ui.editorCueList.append(row);
  });
  const speakers = new Set(editorCues.map((cue) => cue.speaker).filter(Boolean));
  const duration = editorTimelineDuration || Math.max(...editorCues.map((cue) => Number(cue.end) || 0));
  ui.editorTimelineState.textContent = `${editorCues.length} 条台词 / 声音片段 · ${speakers.size} 个声音角色 · 成片 ${formatTimelineTime(duration)}`;
}

async function loadEditorProject() {
  const projectId = ui.editorProjectSelect.value;
  if (!projectId) return;
  try {
    const data = await fetchJson(`/api/workflow/projects/${encodeURIComponent(projectId)}`);
    ui.editorScreenplay.value = data.project?.script?.screenplay || '';
    ui.editorAddVoice.checked = data.project?.brief?.dialogue !== false && data.project?.brief?.voiceEnabled !== false;
    if (data.project?.brief?.voiceProfileId) selectOrAppend(ui.editorVoiceProfile, data.project.brief.voiceProfileId);
    editorTimelineDuration = Number(data.project?.timeline?.totalDuration) || 0;
    editorCues = Array.isArray(data.project?.timeline?.cues) ? data.project.timeline.cues.map((cue) => ({ ...cue })) : [];
    renderEditorCues();
    const outputName = data.project?.production?.outputName;
    if (outputName && [...ui.editorVideoSelect.options].some((item) => item.value === outputName)) ui.editorVideoSelect.value = outputName;
    updateEditorVideoPreview();
  } catch (error) { toast(error.message, true); }
}

function updateEditorVideoPreview() {
  const name = ui.editorVideoSelect.value;
  if (!name) { ui.editorPreviewVideo.classList.add('hidden'); return; }
  ui.editorPreviewVideo.src = `/media/${encodeURIComponent(name)}`;
  ui.editorPreviewVideo.classList.remove('hidden');
}

async function loadPostStudio() {
  try {
    const selectedVideo = ui.editorVideoSelect.value;
    const selectedProject = ui.editorProjectSelect.value;
    editorContextData = await fetchJson('/api/editor/context');
    ui.editorVideoSelect.replaceChildren(new Option('请选择本地视频', ''));
    for (const video of editorContextData.videos || []) ui.editorVideoSelect.append(new Option(video.label || video.name, video.name));
    ui.editorProjectSelect.replaceChildren(new Option('手动粘贴剧本', ''));
    for (const project of editorContextData.projects || []) ui.editorProjectSelect.append(new Option(project.title, project.id));
    ui.editorVideoSelect.value = [...ui.editorVideoSelect.options].some((item) => item.value === selectedVideo) ? selectedVideo : editorContextData.videos?.[0]?.name || '';
    ui.editorProjectSelect.value = [...ui.editorProjectSelect.options].some((item) => item.value === selectedProject) ? selectedProject : '';
    updateEditorVideoPreview();
    await loadVoiceStatus();
  } catch (error) { toast(`后期台读取失败：${error.message}`, true); }
}

async function extractEditorSubtitles() {
  if (!ui.editorVideoSelect.value) { toast('请先选择实际成片', true); return; }
  if (!ui.editorScreenplay.value.trim()) { ui.editorScreenplay.focus(); toast('请先选择项目或粘贴剧本 / 故事内容', true); return; }
  ui.editorExtract.disabled = true;
  const originalLabel = ui.editorExtract.textContent;
  ui.editorExtract.textContent = 'AI 正在按成片秒数编排…';
  ui.editorTimelineState.textContent = '正在读取实际视频时长并生成台词轴…';
  try {
    const data = await fetchJson('/api/editor/dialogue/timeline', {
      method: 'POST', body: JSON.stringify({
        projectId: ui.editorProjectSelect.value, screenplay: ui.editorScreenplay.value,
        videoName: ui.editorVideoSelect.value, voiceProfileId: ui.editorVoiceProfile.value,
      }),
    });
    editorCues = data.cues || [];
    editorTimelineDuration = Number(data.duration) || 0;
    renderEditorCues();
    toast(data.warning || `AI 已按 ${Number(data.duration).toFixed(2)} 秒成片生成 ${editorCues.length} 条台词`, Boolean(data.warning));
  } catch (error) { toast(error.message, true); }
  finally { ui.editorExtract.disabled = false; ui.editorExtract.textContent = originalLabel; }
}

function addEditorCue() {
  const last = editorCues.at(-1);
  const start = last ? Number(last.end) + 0.15 : 0.5;
  editorCues.push({ id: editorCues.length + 1, start, end: start + 2.5, text: '新台词', speaker: '旁白', kind: 'narration', voiceProfileId: ui.editorVoiceProfile.value || 'female_narrator' });
  renderEditorCues();
}

async function renderEditorSubtitles() {
  if (!ui.editorVideoSelect.value) { toast('请先选择要剪辑的视频', true); return; }
  if (!editorCues.length) { toast('请先提取或添加字幕', true); return; }
  ui.editorRender.disabled = true; ui.editorRender.textContent = '正在渲染…';
  ui.editorState.textContent = ui.editorAddVoice.checked ? '正在本地生成台词并烧录字幕，请勿关闭软件' : '正在本地烧录字幕，请勿关闭软件';
  try {
    const data = await fetchJson('/api/editor/subtitles/render', {
      method: 'POST', body: JSON.stringify({
        videoName: ui.editorVideoSelect.value, projectId: ui.editorProjectSelect.value, screenplay: ui.editorScreenplay.value, cues: editorCues,
        addVoice: ui.editorAddVoice.checked, voiceProfileId: ui.editorVoiceProfile.value, includeSpeaker: ui.editorIncludeSpeaker.checked,
        style: { size: Number(ui.editorFontSize.value), marginV: Number(ui.editorMargin.value), color: ui.editorColor.value, backgroundOpacity: Number(ui.editorBackground.value) },
      }),
    });
    editorCues = data.cues || editorCues;
    ui.editorPreviewVideo.src = `${data.url}?t=${Date.now()}`; ui.editorPreviewVideo.classList.remove('hidden');
    ui.editorSubtitleDownload.href = data.subtitleUrl; ui.editorSubtitleDownload.classList.remove('hidden');
    ui.editorState.textContent = `已生成：${data.outputName}`;
    toast(`${data.voiceAdded ? '台词、' : ''}字幕成片与 SRT 已保存到本地作品目录`);
    await loadHistory();
  } catch (error) { ui.editorState.textContent = '字幕渲染失败'; toast(error.message, true); }
  finally { ui.editorRender.disabled = false; ui.editorRender.textContent = '一键生成配音并烧录字幕'; }
}

function workflowPayload() {
  return {
    title: ui.workflowTitle.value.trim() || '未命名视频项目',
    brief: {
      idea: ui.workflowIdea.value.trim(), duration: Number(ui.workflowDuration.value), aspect: ui.workflowAspect.value,
      style: ui.workflowStyle.value.trim(), audience: ui.workflowAudience.value.trim(),
      dialogue: ui.workflowDialogue.checked, delivery: ui.workflowDelivery.value,
      voiceEnabled: true, voiceProfileId: workflowProject?.brief?.voiceProfileId || voiceStudioProfileId || 'female_narrator',
    },
    script: {
      logline: ui.workflowLogline.value.trim(), outline: ui.workflowOutline.value.trim(),
      screenplay: ui.workflowScreenplay.value.trim(), source: workflowProject?.script?.source || '',
    },
    bible: {
      characters: ui.workflowCharacters.value.trim(), locations: ui.workflowLocations.value.trim(),
      visualRules: ui.workflowVisualRules.value.trim(), audioRules: ui.workflowAudioRules.value.trim(),
    },
    generation: {
      quality: ui.workflowGenerationQuality.value, steps: Number(ui.workflowGenerationSteps.value),
      shotSeconds: Number(ui.workflowShotSeconds.value), continuity: ui.workflowContinuity.value,
      audioMode: ui.workflowAudioMode.value, enhancementMode: ui.workflowEnhancementMode.value,
      enhancementProfile: ui.workflowEnhancementProfile.value,
    },
    storyboard: workflowProject?.storyboard || [],
    storyboardSource: workflowProject?.storyboardSource || '',
    timeline: workflowProject?.timeline || {},
    production: { plan: workflowProject?.production?.plan || null },
  };
}

function workflowMarkDirty() {
  if (ui.workflowSaveState) {
    ui.workflowSaveState.textContent = '有未保存修改';
    ui.workflowSaveState.classList.add('dirty');
  }
}

function workflowGenerationChanged() {
  if (workflowProject?.production?.plan) {
    workflowProject.production.plan = null;
    renderWorkflowPlan(null);
  }
  workflowMarkDirty();
}

function workflowSourceLabel(source) {
  if (source === 'api-writer') return '本地大语言模型制作包 · 已生成，可继续编辑';
  if (source === 'local-template') return '离线导演模板 · 已生成，可继续编辑';
  return '等待生成 · 可在任意文本框中直接修改';
}

function characterViewUrl(projectId, fileName) {
  return projectId && fileName
    ? `/api/workflow/projects/${encodeURIComponent(projectId)}/character-image/${encodeURIComponent(fileName)}`
    : '';
}

function addWorkflowCharacter() {
  workflowCharacterDrafts.push({
    id: '', name: `角色 ${workflowCharacterDrafts.length + 1}`, description: '',
    views: { front: '', side: '', back: '' }, images: {}, confirmed: false,
  });
  renderWorkflowCharacterModels();
  ui.workflowCharacterModelList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function readCharacterView(draft, view, file, card) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024) {
    toast('角色参考图需为 PNG、JPEG 或 WebP，且每张不超过 15MB', true); return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    draft.images[view] = reader.result;
    draft.confirmed = false;
    const slot = card.querySelector(`[data-character-view="${view}"]`);
    slot.querySelector('img').src = reader.result;
    slot.classList.add('has-image');
    card.classList.remove('confirmed');
    card.querySelector('.character-model-status').textContent = '待重新确认';
    workflowMarkDirty();
  };
  reader.readAsDataURL(file);
}

async function confirmWorkflowCharacter(draft, button) {
  const hasView = (view) => Boolean(draft.images?.[view] || draft.views?.[view]);
  if (!draft.name.trim()) { toast('请填写角色名称', true); return; }
  if (!['front', 'side', 'back'].every(hasView)) { toast('请上传角色正面、侧面和背面三张参考图', true); return; }
  button.disabled = true; button.textContent = '正在保存三视图…';
  try {
    if (!workflowProject?.id) await saveWorkflowProject(true);
    const data = await fetchJson(`/api/workflow/projects/${encodeURIComponent(workflowProject.id)}/characters`, {
      method: 'POST', body: JSON.stringify({
        id: draft.id, name: draft.name.trim(), description: draft.description.trim(),
        images: draft.images || {}, confirmed: true,
      }),
    });
    fillWorkflowProject(data.project);
    await loadWorkflowProjects();
    toast(`${data.character.name}的三视图已确认，后续分镜将锁定该角色模型`);
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = '确认角色模型'; }
}

function renderWorkflowCharacterModels() {
  if (!ui.workflowCharacterModelList) return;
  ui.workflowCharacterModelList.replaceChildren();
  if (!workflowCharacterDrafts.length) {
    const empty = document.createElement('div'); empty.className = 'workflow-placeholder';
    empty.textContent = '还没有角色定妆资料。点击“添加角色”上传正面、侧面和背面参考图。';
    ui.workflowCharacterModelList.append(empty); return;
  }
  const labels = { front: ['正面', '面部与服装正面'], side: ['侧面', '轮廓与发型侧面'], back: ['背面', '发型与服装背面'] };
  for (const draft of workflowCharacterDrafts) {
    const card = document.createElement('article'); card.className = `character-model-card${draft.confirmed ? ' confirmed' : ''}`;
    const head = document.createElement('div'); head.className = 'character-model-head';
    const nameLabel = document.createElement('label'); nameLabel.innerHTML = '<span>角色名称</span>';
    const nameInput = document.createElement('input'); nameInput.maxLength = 80; nameInput.value = draft.name || ''; nameInput.placeholder = '例如：林夏';
    const detailLabel = document.createElement('label'); detailLabel.innerHTML = '<span>定妆锁定说明</span>';
    const detailInput = document.createElement('input'); detailInput.maxLength = 1200; detailInput.value = draft.description || ''; detailInput.placeholder = '年龄感、脸型、发型、体型、服装、配色、标志性配件';
    const status = document.createElement('span'); status.className = 'character-model-status'; status.textContent = draft.confirmed ? '已确认模型' : '等待三视图';
    nameInput.addEventListener('input', () => { draft.name = nameInput.value; draft.confirmed = false; card.classList.remove('confirmed'); status.textContent = '待重新确认'; workflowMarkDirty(); });
    detailInput.addEventListener('input', () => { draft.description = detailInput.value; draft.confirmed = false; card.classList.remove('confirmed'); status.textContent = '待重新确认'; workflowMarkDirty(); });
    nameLabel.append(nameInput); detailLabel.append(detailInput); head.append(nameLabel, detailLabel, status);
    const grid = document.createElement('div'); grid.className = 'character-view-grid';
    for (const view of ['front', 'side', 'back']) {
      const slot = document.createElement('label'); slot.className = 'character-view'; slot.dataset.characterView = view;
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
      const preview = document.createElement('img'); preview.alt = `${draft.name || '角色'}${labels[view][0]}参考图`;
      const source = draft.images?.[view] || characterViewUrl(workflowProject?.id, draft.views?.[view]);
      if (source) { preview.src = source; slot.classList.add('has-image'); }
      const copy = document.createElement('span'); copy.className = 'character-view-copy';
      const title = document.createElement('b'); title.textContent = labels[view][0];
      const hint = document.createElement('small'); hint.textContent = `点击上传 · ${labels[view][1]}`;
      copy.append(title, hint); slot.append(input, preview, copy);
      input.addEventListener('change', () => readCharacterView(draft, view, input.files?.[0], card));
      grid.append(slot);
    }
    const actions = document.createElement('div'); actions.className = 'character-model-actions';
    const note = document.createElement('p'); note.textContent = draft.confirmed ? '三视图已锁定。替换图片或修改说明后需要重新确认。' : '三张图片齐全后确认，项目会保存原图与角色连续性规则。';
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = draft.confirmed ? '重新确认模型' : '确认角色模型';
    confirm.addEventListener('click', () => confirmWorkflowCharacter(draft, confirm));
    actions.append(note, confirm); card.append(head, grid, actions); ui.workflowCharacterModelList.append(card);
  }
}

function fillWorkflowProject(project) {
  workflowProject = project;
  workflowCharacterDrafts = (project?.characterModels || []).map((item) => ({
    ...item, views: { ...(item.views || {}) }, images: {},
  }));
  ui.workflowTitle.value = project?.title || '';
  ui.workflowIdea.value = project?.brief?.idea || '';
  selectOrAppend(ui.workflowDuration, project?.brief?.duration || 120, formatWorkflowDuration(project?.brief?.duration || 120));
  ui.workflowAspect.value = project?.brief?.aspect || '16:9';
  ui.workflowStyle.value = project?.brief?.style || '电影感写实';
  ui.workflowAudience.value = project?.brief?.audience || '';
  ui.workflowDialogue.checked = project?.brief?.dialogue !== false;
  ui.workflowDelivery.value = project?.brief?.delivery || '1080p';
  ui.workflowLogline.value = project?.script?.logline || '';
  ui.workflowOutline.value = project?.script?.outline || '';
  ui.workflowScreenplay.value = project?.script?.screenplay || '';
  ui.workflowCharacters.value = project?.bible?.characters || '';
  ui.workflowLocations.value = project?.bible?.locations || '';
  ui.workflowVisualRules.value = project?.bible?.visualRules || '';
  ui.workflowAudioRules.value = project?.bible?.audioRules || '';
  ui.workflowGenerationQuality.value = project?.generation?.quality || 'auto';
  ui.workflowGenerationSteps.value = String(project?.generation?.steps || 0);
  ui.workflowShotSeconds.value = String(project?.generation?.shotSeconds || 5);
  ui.workflowContinuity.value = project?.generation?.continuity || 'cut';
  ui.workflowAudioMode.value = project?.generation?.audioMode || 'silent';
  ui.workflowEnhancementMode.value = project?.generation?.enhancementMode || 'none';
  ui.workflowEnhancementProfile.value = project?.generation?.enhancementProfile || 'balanced';
  updateEnhancementNote();
  ui.workflowScriptSource.textContent = workflowSourceLabel(project?.script?.source);
  ui.workflowSaveState.textContent = project ? `已保存 · ${new Date(project.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '未保存';
  ui.workflowSaveState.classList.remove('dirty');
  renderWorkflowCharacterModels();
  renderWorkflowStoryboard();
  renderWorkflowPlan(project?.production?.plan || null);
  renderWorkflowStoredProduction(project);
  renderWorkflowProjectList();
}

function renderWorkflowProjectList() {
  if (!ui.workflowProjectList) return;
  const projects = ui.workflowProjectList._projects || [];
  ui.workflowProjectList.replaceChildren();
  ui.workflowProjectEmpty.classList.toggle('hidden', projects.length > 0);
  for (const project of projects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `workflow-project-item${workflowProject?.id === project.id ? ' active' : ''}`;
    const title = document.createElement('b'); title.textContent = project.title;
    const meta = document.createElement('small');
    meta.textContent = `${formatWorkflowDuration(project.duration)} · ${project.aspect} · ${project.status === 'completed' ? '已成片' : project.status === 'producing' ? '生产中' : '制作中'}`;
    button.append(title, meta);
    button.addEventListener('click', () => loadWorkflowProject(project.id));
    ui.workflowProjectList.append(button);
  }
}

async function loadWorkflowProjects() {
  if (!ui.workflowProjectList) return;
  try {
    const data = await fetchJson('/api/workflow/projects');
    ui.workflowProjectList._projects = data.projects || [];
    workflowProjectsLoaded = true;
    renderWorkflowProjectList();
    if (!workflowProject && data.projects?.length) await loadWorkflowProject(data.projects[0].id);
  } catch (error) { toast(`读取全工作流项目失败：${error.message}`, true); }
}

async function loadWorkflowProject(id) {
  try {
    const data = await fetchJson(`/api/workflow/projects/${encodeURIComponent(id)}`);
    fillWorkflowProject(data.project);
    if (data.project.production?.jobStatus === 'producing' || data.project.status === 'producing') startWorkflowPolling();
  } catch (error) { toast(error.message, true); }
}

async function newWorkflowProject() {
  try {
    const data = await fetchJson('/api/workflow/projects', {
      method: 'POST', body: JSON.stringify({ title: '未命名短剧项目', brief: { duration: 120, aspect: '9:16', style: '电影感写实', delivery: '1080p', voiceEnabled: true, voiceProfileId: 'female_narrator' } }),
    });
    fillWorkflowProject(data.project);
    await loadWorkflowProjects();
    ui.workflowTitle.focus();
    toast('新项目已建立，内容只保存在本机');
  } catch (error) { toast(error.message, true); }
}

async function saveWorkflowProject(silent = false) {
  try {
    let data;
    if (workflowProject?.id) {
      data = await fetchJson(`/api/workflow/projects/${encodeURIComponent(workflowProject.id)}`, { method: 'PUT', body: JSON.stringify(workflowPayload()) });
    } else {
      data = await fetchJson('/api/workflow/projects', { method: 'POST', body: JSON.stringify(workflowPayload()) });
    }
    fillWorkflowProject(data.project);
    await loadWorkflowProjects();
    if (!silent) toast('项目已保存');
    return data.project;
  } catch (error) {
    if (!silent) toast(error.message, true);
    throw error;
  }
}

function setWorkflowBusy(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}

async function generateWorkflowScript() {
  if (!ui.workflowIdea.value.trim()) { ui.workflowIdea.focus(); toast('请先填写核心创意', true); return; }
  setWorkflowBusy(ui.workflowGenerateScript, true, '本地编剧处理中…');
  try {
    const project = await saveWorkflowProject(true);
    const data = await fetchJson(`/api/workflow/projects/${encodeURIComponent(project.id)}/script`, { method: 'POST', body: '{}' });
    fillWorkflowProject(data.project);
    await loadWorkflowProjects();
    toast(data.warning || '剧本、人物、场景和视听规则已生成', Boolean(data.warning));
  } catch (error) { toast(error.message, true); }
  finally { setWorkflowBusy(ui.workflowGenerateScript, false); }
}

function formatTimelineTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

function renderWorkflowStoryboard() {
  ui.workflowStoryboardList.replaceChildren();
  const shots = workflowProject?.storyboard || [];
  if (!shots.length) {
    const empty = document.createElement('div'); empty.className = 'workflow-placeholder'; empty.textContent = '完成剧本后生成可编辑分镜。';
    ui.workflowStoryboardList.append(empty); return;
  }
  shots.forEach((shot, index) => {
    const card = document.createElement('details'); card.className = 'workflow-shot'; if (index === 0) card.open = true;
    const summary = document.createElement('summary');
    const number = document.createElement('span'); number.className = 'workflow-shot-number'; number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span'); copy.className = 'workflow-shot-title';
    const title = document.createElement('b'); title.textContent = shot.title || `镜头 ${index + 1}`;
    const excerpt = document.createElement('small'); excerpt.textContent = shot.prompt || '';
    const seconds = document.createElement('em'); seconds.textContent = `${shot.seconds} 秒`;
    copy.append(title, excerpt); summary.append(number, copy, seconds);
    const editor = document.createElement('div'); editor.className = 'workflow-shot-editor';
    const titleInput = document.createElement('input'); titleInput.value = shot.title || '';
    const secondsInput = document.createElement('input'); secondsInput.type = 'number'; secondsInput.min = '1'; secondsInput.max = '10'; secondsInput.step = '0.5'; secondsInput.value = shot.seconds;
    const promptInput = document.createElement('textarea'); promptInput.value = shot.prompt || ''; promptInput.maxLength = 4000;
    titleInput.addEventListener('input', () => { shot.title = titleInput.value; title.textContent = titleInput.value || `镜头 ${index + 1}`; workflowMarkDirty(); });
    secondsInput.addEventListener('input', () => { shot.seconds = Number(secondsInput.value); seconds.textContent = `${secondsInput.value || 0} 秒`; workflowMarkDirty(); });
    promptInput.addEventListener('input', () => { shot.prompt = promptInput.value; excerpt.textContent = promptInput.value; workflowMarkDirty(); });
    editor.append(titleInput, secondsInput, promptInput); card.append(summary, editor); ui.workflowStoryboardList.append(card);
  });
}

async function buildWorkflowStoryboard() {
  if (!ui.workflowScreenplay.value.trim()) { toast('请先生成或填写剧本与设定', true); return; }
  setWorkflowBusy(ui.workflowBuildStoryboard, true, '导演拆镜中…');
  try {
    const project = await saveWorkflowProject(true);
    const data = await fetchJson(`/api/workflow/projects/${encodeURIComponent(project.id)}/storyboard`, { method: 'POST', body: '{}' });
    fillWorkflowProject(data.project);
    await loadWorkflowProjects();
    toast(data.warning || `已生成 ${data.project.storyboard.length} 个连续镜头`, Boolean(data.warning));
  } catch (error) { toast(error.message, true); }
  finally { setWorkflowBusy(ui.workflowBuildStoryboard, false); }
}

function renderWorkflowPlan(plan) {
  ui.workflowPlanContent.replaceChildren();
  if (!plan) {
    const empty = document.createElement('div'); empty.className = 'workflow-placeholder'; empty.textContent = '完成分镜后生成设备专属计划。';
    ui.workflowPlanContent.append(empty); return;
  }
  const summary = document.createElement('div'); summary.className = 'workflow-plan-summary';
  const platformPlan = platformEngines.includes(plan.engine);
  const items = [
    ['生成引擎', platformPlan ? (videoProviderById(plan.engine)?.label || '平台协作') : plan.engine === 'int8' ? 'H3 INT8 高质量' : 'H3 Q2 兼容预览'],
    [platformPlan ? '平台规格' : '内部渲染', platformPlan ? `${plan.width} × ${plan.height} · 自动接回` : `${plan.width} × ${plan.height} · ${plan.steps} 步`],
    ['交付规格', `${plan.outputWidth} × ${plan.outputHeight} · ${formatWorkflowDuration(plan.duration)}`],
    ['设备', `${plan.hardware?.gpu || '未知显卡'} · ${plan.hardware?.vramGb || 0}GB`],
    ['采样策略', `${plan.steps} 步 · ${plan.segments} 个短分镜`],
    ['镜头衔接', plan.continuityMode === 'carry' ? '末帧续接' : '独立生成后无损合片'],
    ['生成声音', plan.audioMode === 'ambience' ? '仅环境声 · 禁人声' : '纯画面无音轨'],
    ['二次修复', enhancementLabel(plan.enhancement?.mode || 'none')],
  ];
  for (const [label, value] of items) {
    const item = document.createElement('div'); const name = document.createElement('span'); name.textContent = label;
    const content = document.createElement('b'); content.textContent = value; item.append(name, content); summary.append(item);
  }
  const reasons = document.createElement('div'); reasons.className = 'workflow-plan-reasons';
  for (const value of plan.reasons || []) { const item = document.createElement('span'); item.textContent = value; reasons.append(item); }
  ui.workflowPlanContent.append(summary, reasons);
  if (plan.warnings?.length) {
    const warning = document.createElement('div'); warning.className = 'workflow-plan-warning'; warning.textContent = plan.warnings.join('；');
    ui.workflowPlanContent.append(warning);
  }
  ui.workflowPrepareEnvironment.textContent = platformPlan ? '平台协作无需部署' : plan.environmentReady ? '环境已经就绪' : '准备生成环境';
  ui.workflowPrepareEnvironment.disabled = plan.environmentReady;
}

async function buildWorkflowPlan() {
  if (!workflowProject?.storyboard?.length) { toast('请先生成导演分镜', true); return; }
  setWorkflowBusy(ui.workflowBuildPlan, true, '正在分析硬件…');
  try {
    const project = await saveWorkflowProject(true);
    const data = await fetchJson(`/api/workflow/projects/${encodeURIComponent(project.id)}/plan`, { method: 'POST', body: '{}' });
    fillWorkflowProject(data.project);
    await loadWorkflowProjects();
    toast(`已推荐 ${platformEngines.includes(data.plan.engine) ? (videoProviderById(data.plan.engine)?.label || '平台协作') : data.plan.engine === 'int8' ? 'INT8 高质量' : 'Q2 兼容'}方案`);
  } catch (error) { toast(error.message, true); }
  finally { setWorkflowBusy(ui.workflowBuildPlan, false); }
}

function renderWorkflowStoredProduction(project) {
  if (!project?.production) return;
  const production = project.production;
  if (production.outputName) {
    ui.workflowProgressCard.className = 'workflow-progress-card';
    ui.workflowProgressTitle.textContent = '成片已完成';
    ui.workflowProgressText.textContent = production.outputName;
    ui.workflowProgressPercent.textContent = '100%';
    ui.workflowProgressBar.style.width = '100%';
    ui.workflowShotProgressText.textContent = '全部镜头已完成';
    ui.workflowShotStepText.textContent = '100%';
    ui.workflowShotProgressBar.style.width = '100%';
    ui.workflowResultVideo.src = `/media/${encodeURIComponent(production.outputName)}`;
    ui.workflowResultVideo.classList.remove('hidden');
  } else if (production.lastError) {
    ui.workflowProgressCard.className = 'workflow-progress-card failed';
    ui.workflowProgressTitle.textContent = '生产未完成';
    ui.workflowProgressText.textContent = production.lastError;
    ui.workflowProgressPercent.textContent = '—';
    ui.workflowShotProgressText.textContent = '任务已停止';
    ui.workflowShotStepText.textContent = '—';
  } else if (project.status !== 'producing') {
    ui.workflowProgressCard.className = 'workflow-progress-card';
    ui.workflowProgressTitle.textContent = '等待开始生产';
    ui.workflowProgressText.textContent = '项目、分镜和生产计划都会保存在本机';
    ui.workflowProgressPercent.textContent = '0%'; ui.workflowProgressBar.style.width = '0%';
    ui.workflowShotProgressText.textContent = '当前镜头'; ui.workflowShotStepText.textContent = '等待采样'; ui.workflowShotProgressBar.style.width = '0%';
    ui.workflowResultVideo.classList.add('hidden'); ui.workflowResultVideo.removeAttribute('src');
  }
}

function renderWorkflowJob(job) {
  if (!job || !workflowProject || job.projectId !== workflowProject.id) return;
  preparePlatformHandoff(job);
  const running = job.status === 'running';
  ui.workflowProgressCard.className = `workflow-progress-card${running ? ' running' : job.status === 'failed' ? ' failed' : ''}`;
  ui.workflowProgressTitle.textContent = running ? (job.phase || '生产中') : job.status === 'completed' ? '成片已完成' : job.status === 'paused' ? '已在镜头边界安全暂停' : job.status === 'cancelled' ? '生产已取消' : '生产未完成';
  ui.workflowProgressText.textContent = running
    ? `${job.segment ? `镜头 ${job.segment}/${job.segments} · ` : ''}${job.recoveredShots ? `已恢复 ${job.recoveredShots} 个镜头 · ` : ''}已用时 ${formatTime(job.elapsedSeconds)}`
    : (job.error || job.outputName || '任务已结束');
  ui.workflowProgressPercent.textContent = `${formatPercent(job.progress)}%`;
  ui.workflowProgressBar.style.width = `${Math.max(running ? 3 : 0, job.progress || 0)}%`;
  ui.workflowShotProgressText.textContent = job.segments ? `当前镜头 ${job.segment || 1}/${job.segments}` : '当前镜头';
  ui.workflowShotStepText.textContent = job.platform && job.handoff ? '等待官网下载' : job.samplingSteps ? `采样 ${job.samplingStep || 0}/${job.samplingSteps} · ${formatPercent(job.shotProgress)}%` : `${formatPercent(job.shotProgress)}%`;
  ui.workflowShotProgressBar.style.width = `${Math.min(100, Math.max(0, job.shotProgress || 0))}%`;
  ui.workflowProgressMeta.textContent = job.platform
    ? `${job.outputWidth || job.width}×${job.outputHeight || job.height} · ${formatWorkflowDuration(job.duration)} · 平台协作自动接回 · ${job.generateAudio ? '环境声' : '纯画面'}`
    : `${job.outputWidth || job.width}×${job.outputHeight || job.height} · ${formatWorkflowDuration(job.duration)} · ${job.steps} 步 · ${job.continuityMode === 'carry' ? '末帧续接' : '独立短分镜'} · ${job.generateAudio ? '环境声' : '无音轨'}`;
  ui.workflowProductionLog.textContent = job.logs?.length ? job.logs.join('\n') : '等待运行日志…';
  if (job.status === 'completed' && job.outputName) {
    ui.workflowResultVideo.src = `/media/${encodeURIComponent(job.outputName)}?t=${Date.now()}`;
    ui.workflowResultVideo.classList.remove('hidden');
  }
  ui.workflowStartProduction.disabled = running;
  if (lastWorkflowJobStatus === 'running' && job.status !== 'running') {
    loadWorkflowProject(workflowProject.id);
    loadWorkflowProjects();
    toast(job.status === 'completed' ? '全工作流成片已完成' : (job.error || '生产未完成'), job.status !== 'completed');
  }
  lastWorkflowJobStatus = job.status;
}

async function pollWorkflowStatus() {
  try {
    const data = await fetchJson('/api/status');
    if (data.job?.projectId) renderWorkflowJob(data.job);
    if (!data.job || data.job.status !== 'running') stopWorkflowPolling();
  } catch {}
}

function startWorkflowPolling() {
  stopWorkflowPolling();
  workflowPollTimer = setInterval(pollWorkflowStatus, 1000);
  pollWorkflowStatus();
}

function stopWorkflowPolling() { if (workflowPollTimer) clearInterval(workflowPollTimer); workflowPollTimer = null; }

async function prepareWorkflowEnvironment() {
  try {
    await fetchJson('/api/environment/install', { method: 'POST', body: '{}' });
    ui.workflowPrepareEnvironment.disabled = true; ui.workflowPrepareEnvironment.textContent = '正在安装 / 检查…';
    toast('环境准备已启动，支持断点续传；完成后重新生成生产计划');
    loadEnvironment();
  } catch (error) { toast(error.message, true); }
}

async function startWorkflowProduction() {
  if (!workflowProject?.production?.plan) { toast('请先生成硬件生产计划', true); return; }
  const plan = workflowProject.production.plan;
  const platformPlan = platformEngines.includes(plan.engine);
  const message = platformPlan
    ? `将通过 ${videoProviderById(plan.engine)?.label || '平台协作'} 制作 ${plan.segments} 个镜头。LocalFrame 会逐镜头复制提示词、打开官网，并在下载后自动接回，最后输出 ${plan.outputWidth}×${plan.outputHeight} 成片。\n\n二次修复：${enhancementLabel(plan.enhancement?.mode || 'none')}。现在开始吗？`
    : `将按 ${plan.width}×${plan.height}、${plan.steps} 步生成 ${plan.segments} 个${plan.continuityMode === 'carry' ? '末帧续接' : '独立短分镜'}，再合成为 ${formatWorkflowDuration(plan.duration)}、${plan.outputWidth}×${plan.outputHeight} 的成片。\n\n生成声音：${plan.audioMode === 'ambience' ? '仅环境声并强制禁人声' : '纯画面无音轨，杜绝人物念台词'}。二次修复：${enhancementLabel(plan.enhancement?.mode || 'none')}，只在 H3 完成后运行。系统会长时间占用设备，但会缓存已完成镜头并自动降载恢复。\n\n现在开始吗？`;
  if (!window.confirm(message)) return;
  ui.workflowStartProduction.disabled = true;
  try {
    await saveWorkflowProject(true);
    const data = await fetchJson(`/api/workflow/projects/${encodeURIComponent(workflowProject.id)}/produce`, { method: 'POST', body: '{}' });
    fillWorkflowProject(data.project);
    renderWorkflowJob(data.job);
    startWorkflowPolling();
    toast(platformPlan ? '平台协作已开始；下载每个镜头后会自动继续' : '全工作流生产已开始，文字模型会先卸载再载入视频模型');
  } catch (error) { toast(error.message, true); ui.workflowStartProduction.disabled = false; }
}

function setStage(name) {
  for (const key of ['stageEmpty', 'stageRunning', 'stageResult', 'stageError']) ui[key].classList.add('hidden');
  ui[name].classList.remove('hidden');
}

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function formatPercent(value) {
  const rounded = Math.round(Math.min(100, Math.max(0, Number(value) || 0)) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatWorkflowDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${value} 秒`;
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

function formatDate(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

function storyboardSeconds() {
  return storyboard.reduce((sum, shot) => sum + (Number(shot.seconds) || 0), 0);
}

function updateStoryboardSummary() {
  const duration = Number(ui.duration.value);
  const count = storyboard.length || Math.ceil(duration / 10);
  const seconds = storyboard.length ? storyboardSeconds() : duration;
  ui.storyboardSummary.textContent = `${seconds} 秒 · ${count} 个镜头${duration >= 60 ? ' · 一分钟成片' : ''}`;
}

function renderStoryboard(source = '') {
  ui.storyboardList.replaceChildren();
  updateStoryboardSummary();
  if (!storyboard.length) {
    const empty = document.createElement('div');
    empty.className = 'storyboard-empty';
    empty.textContent = '输入整片创意后点击“自动拆解分镜”，系统会生成可逐镜头修改的导演脚本。';
    ui.storyboardList.append(empty);
    return;
  }
  storyboard.forEach((shot, index) => {
    const card = document.createElement('details');
    card.className = 'shot-card';
    if (index === 0) card.open = true;
    const summary = document.createElement('summary');
    const number = document.createElement('span'); number.className = 'shot-index'; number.textContent = String(index + 1).padStart(2, '0');
    const titleLabel = document.createElement('span'); titleLabel.className = 'shot-title'; titleLabel.textContent = shot.title || `镜头 ${index + 1}`;
    const secondsLabel = document.createElement('span'); secondsLabel.className = 'shot-duration'; secondsLabel.textContent = `${shot.seconds} 秒`;
    summary.append(number, titleLabel, secondsLabel);
    const editor = document.createElement('div'); editor.className = 'shot-editor';
    const titleInput = document.createElement('input'); titleInput.type = 'text'; titleInput.maxLength = 40; titleInput.value = shot.title || `镜头 ${index + 1}`; titleInput.setAttribute('aria-label', `镜头 ${index + 1} 标题`);
    const secondsInput = document.createElement('input'); secondsInput.type = 'number'; secondsInput.min = '1'; secondsInput.max = '10'; secondsInput.step = '0.5'; secondsInput.value = shot.seconds; secondsInput.setAttribute('aria-label', `镜头 ${index + 1} 时长`);
    const promptInput = document.createElement('textarea'); promptInput.maxLength = 4000; promptInput.value = shot.prompt; promptInput.setAttribute('aria-label', `镜头 ${index + 1} 提示词`);
    const markEdited = () => { storyboardEdited = true; storyboardSource = 'user-edited'; updateStoryboardSummary(); };
    titleInput.addEventListener('input', () => { shot.title = titleInput.value; titleLabel.textContent = titleInput.value || `镜头 ${index + 1}`; markEdited(); });
    secondsInput.addEventListener('input', () => { shot.seconds = Number(secondsInput.value); secondsLabel.textContent = `${secondsInput.value || 0} 秒`; markEdited(); });
    promptInput.addEventListener('input', () => { shot.prompt = promptInput.value; markEdited(); });
    editor.append(titleInput, secondsInput, promptInput);
    card.append(summary, editor); ui.storyboardList.append(card);
  });
  if (source) ui.storyboardHelp.textContent = source === 'api-director'
    ? '已由已配置的大语言模型生成导演分镜；可逐镜头修改后再生成。'
    : '已用本地导演模板生成分镜；连接大语言模型 API 后可获得更细致的剧情拆解。';
}

function validateStoryboard() {
  const duration = Number(ui.duration.value);
  if (!storyboard.length) throw new Error('请先生成导演分镜');
  for (let index = 0; index < storyboard.length; index += 1) {
    const shot = storyboard[index];
    if (!Number.isFinite(Number(shot.seconds)) || Number(shot.seconds) < 1 || Number(shot.seconds) > 10) throw new Error(`镜头 ${index + 1} 时长必须为 1–10 秒`);
    if (!String(shot.prompt || '').trim()) throw new Error(`镜头 ${index + 1} 的提示词不能为空`);
  }
  const total = storyboardSeconds();
  if (Math.abs(total - duration) > 0.05) throw new Error(`当前分镜共 ${total} 秒，需要与成片 ${duration} 秒一致`);
}

async function buildStoryboard(preferAI = true, silent = false) {
  const prompt = ui.prompt.value.trim();
  if (!prompt) {
    if (!silent) { ui.prompt.focus(); toast('请先输入整片创意', true); }
    return false;
  }
  ui.buildStoryboard.disabled = true;
  const oldLabel = ui.buildStoryboard.innerHTML;
  ui.buildStoryboard.textContent = '正在拆解…';
  try {
    const data = await fetchJson('/api/storyboard', {
      method: 'POST',
      body: JSON.stringify({ prompt, duration: Number(ui.duration.value), preferAI }),
    });
    storyboard = data.storyboard || [];
    storyboardBasePrompt = prompt;
    storyboardEdited = false;
    storyboardSource = data.source || '';
    renderStoryboard(data.source);
    if (data.warning) toast(data.warning, true);
    else if (!silent) toast(`已生成 ${storyboard.length} 个连续镜头`);
    return true;
  } catch (error) {
    if (!silent) toast(error.message, true);
    return false;
  } finally {
    ui.buildStoryboard.disabled = false;
    ui.buildStoryboard.innerHTML = oldLabel;
  }
}

function updateEstimate() {
  const { width, height, outputWidth, outputHeight, upscale } = parseResolution();
  const duration = Number(ui.duration.value);
  const frames = gridFrames(Math.min(10, duration));
  const steps = Number(ui.steps.value);
  if (cloudEngines.includes(currentEngine)) {
    const provider = videoProviderById(currentEngine);
    const cap = provider?.capabilities || {};
    const platform = platformEngines.includes(currentEngine);
    ui.estimate.querySelector('strong').textContent = `${platform ? '平台协作' : '云端生成'}：${provider?.label || currentEngine}`;
    ui.estimate.querySelector('span').textContent = platform
      ? '无需 API；LocalFrame 自动复制提示词、打开官网并监控下载，接回后继续后期'
      : '提交后由厂商异步生成，任务可能产生费用；应用可在重启后继续查询并将结果下载到本机';
    ui.estimate.classList.add('critical');
    const audio = cap.nativeAudio ? '支持当前模型的原生音频参数' : '不支持原生音频，可在完整工作流中使用 Natural Prosody 2.0 中文配音';
    ui.resolutionNote.textContent = `${duration} 秒 · ${width > height ? '横屏' : '竖屏'} · ${audio}。${platform ? '素材由你在平台官网确认上传。' : '提示词和参考图会发送给所选厂商。'}`;
    return;
  }
  const score = width * height * frames * steps;
  const is1080p = upscale;
  const isLong = duration > 10;
  const segments = Math.ceil(duration / 10);
  const baselineSeconds = (currentEngine === 'int8' ? 360 : 70) * (width * height / (currentEngine === 'int8' ? 1152 * 640 : 512 * 320)) * (duration / 10) * (steps / 4);
  const timeText = baselineSeconds < 150
    ? `参考耗时约 ${Math.max(1, Math.round(baselineSeconds / 60))}–${Math.max(2, Math.round(baselineSeconds / 60 * 2))} 分钟`
    : `参考耗时约 ${Math.round(baselineSeconds / 60)}–${Math.round(baselineSeconds / 60 * 2)} 分钟`;
  let level = '轻量';
  let hint = `${currentEngine === 'int8' ? '高质量低显存工作流' : 'Q2 仅用于快速验证构图'}，${timeText}`;
  if (is1080p && isLong) { level = '高负载'; hint = `先分镜生成，再自动续帧、拼接并输出 1080p；${timeText}`; }
  else if (is1080p) { level = '中高'; hint = `先按 ${width}×${height} 生成，再输出 ${outputWidth}×${outputHeight}；${timeText}`; }
  else if (isLong) { level = duration >= 30 ? '高负载' : '中高'; hint = `导演工作流自动拆为 ${segments} 个镜头、续帧并合片；${timeText}`; }
  else if (score > 180000000) { level = '高负载'; hint = '可能耗时较长，建议接通电源并保持散热'; }
  else if (score > 80000000) { level = '中等'; hint = '预计需要数分钟，画质与速度较均衡'; }
  ui.estimate.querySelector('strong').textContent = `预计负载：${level}`;
  ui.estimate.querySelector('span').textContent = `${hint}；大权重从模型盘分阶段载入`;
  ui.estimate.classList.toggle('critical', is1080p || isLong);
  const notes = [];
  if (is1080p) notes.push(`生成尺寸 ${width}×${height}，成片 ${outputWidth}×${outputHeight}`);
  if (Math.min(width, height) >= 768) notes.push('H3 原生 768 短边，面部和手部细节更完整');
  if (steps >= 6 && currentEngine === 'int8') notes.push(`${steps} 步精细采样，首尾关键步使用高精度注意力`);
  if (isLong) notes.push(`${duration} 秒将拆为 ${segments} 段，逐镜头推进剧情并以上一段末帧续接`);
  if (currentEngine === 'q2') notes.push('Q2 会出现涂抹或绿色条纹，不作为成片引擎');
  if (ui.spectrumMode?.value && ui.spectrumMode.value !== 'off') notes.push('Spectrum 会跳过部分 Transformer 计算，结果与原生采样不同');
  ui.resolutionNote.textContent = notes.length ? `${notes.join('；')}。` : '';
}

function setEngine(engine) {
  currentEngine = engine;
  const cloud = cloudEngines.includes(engine);
  const platform = platformEngines.includes(engine);
  const provider = videoProviderById(engine);
  const capabilities = provider?.capabilities || {};
  document.querySelectorAll('.engine-picker button').forEach((button) => { const active = button.dataset.engine === engine; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  const availableResolutions = engineResolutionPresets(engine);
  ui.resolution.replaceChildren(...availableResolutions.map(([value, label, nativeResolution]) => {
    const option = document.createElement('option'); option.value = value; option.textContent = label;
    if (nativeResolution) option.dataset.nativeResolution = nativeResolution;
    if ((engine === 'int8' && value === '960x544') || (engine === 'q2' && value === '512x320') || (cloud && nativeResolution === provider?.nativeResolution && Number(value.split('x')[0]) > Number(value.split('x')[1]))) option.selected = true;
    return option;
  }));
  if (cloud && !ui.resolution.selectedOptions.length && ui.resolution.options.length) ui.resolution.options[0].selected = true;
  for (const option of ui.duration.options) {
    option.disabled = cloud
      ? Boolean(capabilities.durations?.length && !capabilities.durations.includes(Number(option.value)))
      : engine === 'q2' && Number(option.value) > 10;
  }
  if (engine === 'q2' && Number(ui.duration.value) > 10) ui.duration.value = '10';
  if (cloud && ui.duration.selectedOptions[0]?.disabled) ui.duration.value = String(capabilities.durations?.[0] || 5);
  ui.directorMode.disabled = engine === 'q2' || cloud;
  ui.directorMode.checked = engine === 'int8';
  ui.directorCard.classList.toggle('off', engine === 'q2' || cloud);
  ui.buildStoryboard.disabled = engine === 'q2' || cloud;
  ui.steps.disabled = cloud;
  ui.firstCard.classList.toggle('capability-disabled', cloud && !capabilities.firstFrame);
  ui.lastCard.classList.toggle('capability-disabled', cloud && !capabilities.lastFrame);
  ui.firstImage.disabled = cloud && !capabilities.firstFrame;
  ui.lastImage.disabled = cloud && !capabilities.lastFrame;
  if (engine === 'q2') ui.storyboardHelp.textContent = 'Q2 只用于单镜头快速预览；长片导演工作流需要高质量 INT8。';
  else if (platform) ui.storyboardHelp.textContent = `${provider?.label || '平台协作'}会自动准备提示词和素材，官网下载后自动接回。`;
  else if (cloud) ui.storyboardHelp.textContent = `${provider?.label || '云端模型'}当前按单任务生成；能力和时长限制已自动应用。`;
  else if (!storyboard.length) ui.storyboardHelp.textContent = '长片将按叙事阶段生成不同提示词；你可以在开始前逐镜头修改。';
  const ready = systemData?.engines?.[engine];
  ui.generate.disabled = ready === false;
  if (ui.videoProviderText) {
    ui.videoProviderCard.classList.toggle('ready', cloud ? Boolean(provider?.configured && provider?.enabled) : true);
    ui.videoProviderText.textContent = platform ? `${provider?.label || engine} · 无需 API` : cloud ? `${provider?.label || engine} · ${provider?.model || '待配置'}` : `${engine === 'q2' ? '本地 H3 兼容预览' : '本地 H3 高质量'} · 素材不上传`;
    ui.videoProviderState.textContent = platform ? '平台协作' : cloud ? (provider?.configured ? '已配置' : '待配置') : '本地';
  }
  updateEstimate();
}

function updateCreationMode() {
  ui.creationMode.textContent = imageData.first ? (imageData.last ? '首尾帧视频' : '首帧生视频') : '文生视频';
}

function handleImage(input, key, card, preview) {
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast('图片不能超过 15MB', true); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      imageData[key] = reader.result;
      preview.src = reader.result;
      card.classList.add('has-image');
      updateCreationMode();
    };
    reader.readAsDataURL(file);
  });
}

function removeImage(key) {
  const first = key === 'first';
  const input = first ? ui.firstImage : ui.lastImage;
  const card = first ? ui.firstCard : ui.lastCard;
  const preview = first ? ui.firstPreview : ui.lastPreview;
  imageData[key] = null;
  input.value = '';
  preview.removeAttribute('src');
  card.classList.remove('has-image');
  if (key === 'first' && imageData.last) removeImage('last');
  updateCreationMode();
}

async function loadPromptProvider() {
  try {
    const provider = await fetchJson('/api/prompt-provider');
    providerConfig = provider;
    const ready = provider.configured && !provider.needsApiKey;
    ui.providerCard.classList.toggle('ready', ready);
    ui.providerState.textContent = ready ? '可用' : '待配置';
    const providerName = { freetoken: 'FreeToken', lmstudio: 'LM Studio', ollama: 'Ollama', vllm: 'vLLM / LocalAI', llamacpp: 'llama.cpp' }[provider.providerId];
    ui.providerText.textContent = ready ? `${providerName ? `${providerName} · ` : ''}${provider.model} · ${provider.endpointMode}` : '点击自动识别 FreeToken、Ollama 或兼容接口';
  } catch {
    ui.providerState.textContent = '不可用';
    ui.providerText.textContent = '无法读取提示词服务状态';
  }
}

function fillProviderForm(provider = {}) {
  selectedProviderId = provider.providerId || 'custom';
  ui.providerPreset.value = [...ui.providerPreset.options].some((option) => option.value === selectedProviderId) ? selectedProviderId : 'custom';
  ui.providerBaseUrl.value = provider.baseUrl || '';
  ui.providerModel.value = provider.model || '';
  ui.providerEndpointMode.value = provider.endpointMode || 'auto';
  ui.providerAuthMode.value = provider.authMode || 'bearer';
  ui.providerApiKey.value = '';
  ui.providerEnabled.checked = provider.enabled !== false;
  ui.providerKeyHint.textContent = provider.hasApiKey ? '已保存；留空即可继续使用' : '仅保存在本机用户目录';
  ui.providerTestState.className = 'api-test-state';
  ui.providerTestState.textContent = '先测试连接；通过后保存即可用于提示词优化与智能分镜。';
  ui.providerDiscoveryPicker.classList.add('hidden');
}

function openProviderModal() {
  fillProviderForm(providerConfig || {});
  ui.providerModal.classList.remove('hidden');
  setTimeout(() => ui.providerBaseUrl.focus(), 0);
}

function closeProviderModal() { ui.providerModal.classList.add('hidden'); }

function providerFormValue() {
  return {
    enabled: ui.providerEnabled.checked,
    providerId: selectedProviderId === 'custom' ? '' : selectedProviderId,
    baseUrl: ui.providerBaseUrl.value.trim(),
    model: ui.providerModel.value.trim(),
    endpointMode: ui.providerEndpointMode.value,
    authMode: ui.providerAuthMode.value,
    apiKey: ui.providerApiKey.value.trim(),
  };
}

const providerPresets = {
  freetoken: { providerId: 'freetoken', baseUrl: 'http://127.0.0.1:1919', endpointMode: 'auto', authMode: 'none', model: '' },
  openai: { providerId: 'openai', baseUrl: 'https://api.openai.com/v1', endpointMode: 'responses', authMode: 'bearer', model: 'gpt-5-mini' },
  deepseek: { providerId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', endpointMode: 'chat-completions', authMode: 'bearer', model: 'deepseek-chat' },
  ollama: { providerId: 'ollama', baseUrl: 'http://127.0.0.1:11434', endpointMode: 'ollama', authMode: 'none', model: 'qwen3:8b' },
  lmstudio: { providerId: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1', endpointMode: 'chat-completions', authMode: 'none', model: 'local-model' },
};

function applyProviderPreset() {
  const preset = providerPresets[ui.providerPreset.value];
  if (!preset) { selectedProviderId = 'custom'; return; }
  selectedProviderId = preset.providerId;
  ui.providerBaseUrl.value = preset.baseUrl;
  ui.providerModel.value = preset.model;
  ui.providerEndpointMode.value = preset.endpointMode;
  ui.providerAuthMode.value = preset.authMode;
}

function applyDetectedProvider(index) {
  const provider = discoveredProviders[Number(index)];
  if (!provider) return;
  selectedProviderId = provider.id || 'custom';
  ui.providerBaseUrl.value = provider.baseUrl;
  ui.providerEndpointMode.value = provider.endpointMode || 'auto';
  ui.providerAuthMode.value = provider.authMode || 'none';
  ui.providerModel.value = provider.model || '';
  const presetOption = [...ui.providerPreset.options].find((option) => option.value === selectedProviderId);
  ui.providerPreset.value = presetOption ? selectedProviderId : 'custom';
  ui.providerModels.replaceChildren();
  for (const model of provider.models || []) {
    const option = document.createElement('option');
    option.value = model;
    ui.providerModels.append(option);
  }
  ui.providerTestState.className = 'api-test-state success';
  ui.providerTestState.textContent = `已选择 ${provider.label} · ${provider.latencyMs} ms · ${provider.models.length} 个模型。可直接测试并保存。`;
}

async function detectPromptProviders() {
  ui.detectLocalProviders.disabled = true;
  ui.detectLocalProviders.textContent = '正在扫描…';
  ui.providerTestState.className = 'api-test-state';
  ui.providerTestState.textContent = '正在扫描 FreeToken 1919、LM Studio 1234、Ollama 11434、vLLM 8000 与 llama.cpp 8080…';
  try {
    const result = await fetchJson('/api/prompt-provider/detect', { method: 'POST', body: JSON.stringify(providerFormValue()) });
    discoveredProviders = result.services || [];
    ui.detectedProvider.replaceChildren();
    discoveredProviders.forEach((provider, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${provider.label} · ${provider.latencyMs} ms · ${provider.models.length} 个模型`;
      ui.detectedProvider.append(option);
    });
    ui.providerDiscoveryPicker.classList.toggle('hidden', discoveredProviders.length === 0);
    if (!discoveredProviders.length) {
      ui.providerTestState.className = 'api-test-state error';
      ui.providerTestState.textContent = `已扫描 ${result.scanned || 5} 个地址，未发现可用模型。请先启动 FreeToken、LM Studio、Ollama、vLLM 或 llama.cpp，再重试。`;
      return;
    }
    ui.providerDiscoverySummary.textContent = `发现 ${discoveredProviders.length} 个，已推荐首选`;
    ui.detectedProvider.value = '0';
    applyDetectedProvider(0);
  } catch (error) {
    ui.providerTestState.className = 'api-test-state error';
    ui.providerTestState.textContent = `自动识别失败：${error.message}`;
  } finally {
    ui.detectLocalProviders.disabled = false;
    ui.detectLocalProviders.textContent = '重新识别本地服务';
  }
}

async function testPromptProvider() {
  ui.testProvider.disabled = true;
  ui.saveProvider.disabled = true;
  ui.providerTestState.className = 'api-test-state';
  ui.providerTestState.textContent = '正在实际请求模型，请稍候…';
  try {
    const result = await fetchJson('/api/prompt-provider/test', { method: 'POST', body: JSON.stringify({ ...providerFormValue(), enabled: true }) });
    ui.providerTestState.className = 'api-test-state success';
    ui.providerTestState.textContent = `连接成功 · ${result.latencyMs} ms · ${result.message}`;
  } catch (error) {
    ui.providerTestState.className = 'api-test-state error';
    ui.providerTestState.textContent = error.message;
  } finally {
    ui.testProvider.disabled = false;
    ui.saveProvider.disabled = false;
  }
}

async function savePromptProvider(event) {
  event.preventDefault();
  ui.saveProvider.disabled = true;
  try {
    await fetchJson('/api/prompt-provider', { method: 'POST', body: JSON.stringify(providerFormValue()) });
    await loadPromptProvider();
    closeProviderModal();
    toast('API 配置已保存');
  } catch (error) {
    ui.providerTestState.className = 'api-test-state error';
    ui.providerTestState.textContent = error.message;
  } finally { ui.saveProvider.disabled = false; }
}

function videoProviderById(id) {
  return videoProviderData?.providers?.find((item) => item.id === id) || null;
}

function engineProviderId(engine = currentEngine) {
  return engine === 'int8' ? 'local-h3-int8' : engine === 'q2' ? 'local-h3-q2' : engine;
}

function renderVideoCapabilities(provider) {
  const model = selectedVideoModel(provider, ui.videoProviderModel?.value || provider?.model);
  const cap = model?.capabilities || provider?.capabilities || {};
  const items = [
    ['文生视频', cap.textToVideo], ['首帧参考', cap.firstFrame], ['尾帧参考', cap.lastFrame],
    ['原生音频', cap.nativeAudio], ['远程取消', cap.remoteCancel],
    [`${(cap.durations || []).join(' / ') || `${cap.minDuration}–${cap.maxDuration}`} 秒`, true],
  ];
  ui.videoCapabilities.replaceChildren(...items.map(([label, enabled]) => {
    const badge = document.createElement('span');
    badge.textContent = label; badge.classList.toggle('off', !enabled);
    return badge;
  }));
}

function renderVideoModelChoices(provider, preferredModel = '') {
  const models = provider?.models || [];
  ui.videoProviderModels.replaceChildren(...models.map((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.label = `${model.label}${model.verified ? ' · 接口已列出，权限未实测' : ' · 参考清单，未验证'}`;
    return option;
  }));
  if (preferredModel) ui.videoProviderModel.value = preferredModel;
  renderVideoNativeResolutions(provider);
}

function renderVideoNativeResolutions(provider) {
  const model = selectedVideoModel(provider, ui.videoProviderModel.value);
  const options = nativeResolutionOptions(provider, ui.videoProviderModel.value);
  const preferred = ui.videoNativeResolution.value || provider?.nativeResolution || options[0]?.[2] || '';
  const ids = [...new Set(options.map((item) => item[2]).filter(Boolean))];
  ui.videoNativeResolution.replaceChildren(...ids.map((id) => {
    const option = document.createElement('option'); option.value = id; option.textContent = `${id.replace('P', 'p')} · 厂商原生档位`; option.selected = id === preferred; return option;
  }));
  if (!ui.videoNativeResolution.value && ids.length) ui.videoNativeResolution.value = ids[0];
  ui.videoNativeResolutionHint.textContent = model?.verified
    ? '接口已列出模型；生成权限与原生画质仍需实际生成验证'
    : '模型尚未由服务接口确认；画质为保守能力清单，保存前建议探测';
  renderVideoCapabilities(provider);
}

function fillVideoProviderForm(id) {
  const provider = videoProviderById(id);
  if (!provider) return;
  const platform = provider.kind === 'platform';
  ui.videoProviderPreset.value = id;
  ui.videoProviderBaseUrl.value = provider.baseUrl || '';
  ui.videoProviderModel.value = provider.model || '';
  renderVideoModelChoices(provider, provider.model || '');
  ui.videoProviderApiKey.value = '';
  ui.videoProviderAccessKey.value = '';
  ui.videoProviderSecretKey.value = '';
  ui.videoProviderEnabled.checked = provider.enabled !== false;
  const keyPair = id === 'kling' || id === 'jimeng';
  ui.videoApiConfig.classList.toggle('hidden', platform);
  ui.videoProviderSwitch.classList.toggle('hidden', platform);
  ui.platformProviderInfo.classList.toggle('hidden', !platform);
  ui.testVideoProvider.classList.toggle('hidden', platform);
  ui.videoApiKeyField.classList.toggle('hidden', keyPair);
  ui.videoAccessKeyField.classList.toggle('hidden', !keyPair);
  ui.videoSecretKeyField.classList.toggle('hidden', !keyPair);
  renderVideoCapabilities(provider);
  const saved = provider.credentials?.complete;
  ui.videoProviderTestState.className = 'api-test-state';
  ui.videoProviderTestState.textContent = platform
    ? '平台账号和登录状态只由官网管理。LocalFrame 不读取密码、Cookie 或验证码。'
    : saved
    ? '凭据已保存在本机；留空将继续使用已保存值。安全校验不会调用生成接口。'
    : '尚未配置完整凭据。安全校验不会创建任务或产生生成费用。';
}

function videoProviderFormValue() {
  return {
    providerId: ui.videoProviderPreset.value,
    enabled: ui.videoProviderEnabled.checked,
    baseUrl: ui.videoProviderBaseUrl.value.trim(),
    model: ui.videoProviderModel.value.trim(),
    nativeResolution: ui.videoNativeResolution.value,
    apiKey: ui.videoProviderApiKey.value.trim(),
    accessKey: ui.videoProviderAccessKey.value.trim(),
    secretKey: ui.videoProviderSecretKey.value.trim(),
    select: true,
  };
}

function openVideoProviderModal() {
  const preferred = cloudEngines.includes(currentEngine) ? currentEngine : (cloudEngines.includes(videoProviderData?.selectedProviderId) ? videoProviderData.selectedProviderId : 'minimax');
  fillVideoProviderForm(preferred);
  ui.videoProviderModal.classList.remove('hidden');
}

function closeVideoProviderModal() { ui.videoProviderModal.classList.add('hidden'); }

async function loadVideoProviders(applySelection = false) {
  try {
    videoProviderData = await fetchJson('/api/video-providers');
    const selectedId = engineProviderId();
    const provider = videoProviderById(selectedId);
    const isCloud = cloudEngines.includes(currentEngine);
    const isPlatform = platformEngines.includes(currentEngine);
    ui.videoProviderCard.classList.toggle('ready', isCloud ? Boolean(provider?.configured && provider?.enabled) : true);
    ui.videoProviderText.textContent = isPlatform
      ? `${provider?.label || currentEngine} · 无需 API`
      : isCloud
      ? `${provider?.label || currentEngine} · ${provider?.model || '待配置'}`
      : `${provider?.label || '本地 H3'} · 素材不上传`;
    ui.videoProviderState.textContent = isPlatform ? '平台协作' : isCloud ? (provider?.configured ? '已配置' : '待配置') : '本地';
    if (applySelection) {
      const engine = videoProviderData.selectedProviderId === 'local-h3-int8' ? 'int8' : videoProviderData.selectedProviderId === 'local-h3-q2' ? 'q2' : videoProviderData.selectedProviderId;
      if (resolutionPresets[engine]) setEngine(engine);
    }
  } catch (error) {
    ui.videoProviderState.textContent = '不可用';
    ui.videoProviderText.textContent = error.message;
  }
}

async function testVideoProvider() {
  if (platformEngines.includes(ui.videoProviderPreset.value)) {
    ui.videoProviderTestState.className = 'api-test-state success';
    ui.videoProviderTestState.textContent = '平台协作无需 API 配置，可以直接保存并开始使用。';
    return;
  }
  ui.testVideoProvider.disabled = true;
  ui.saveVideoProvider.disabled = true;
  ui.videoProviderTestState.className = 'api-test-state';
  ui.videoProviderTestState.textContent = '正在识别服务并读取可调用模型；不会创建生成任务…';
  try {
    const form = videoProviderFormValue();
    const result = await fetchJson('/api/video-providers/discover', { method: 'POST', body: JSON.stringify(form) });
    if (result.providerId !== form.providerId) {
      fillVideoProviderForm(result.providerId);
      ui.videoProviderPreset.value = result.providerId;
      ui.videoProviderBaseUrl.value = form.baseUrl;
      ui.videoProviderApiKey.value = form.apiKey;
      ui.videoProviderAccessKey.value = form.accessKey;
      ui.videoProviderSecretKey.value = form.secretKey;
    }
    const provider = videoProviderById(result.providerId);
    provider.models = result.models || [];
    const currentModel = form.model && provider.models.some((item) => item.id === form.model) ? form.model : provider.models[0]?.id || form.model;
    provider.model = currentModel;
    provider.capabilities = selectedVideoModel(provider, currentModel)?.capabilities || provider.capabilities;
    renderVideoModelChoices(provider, currentModel);
    ui.videoProviderTestState.className = 'api-test-state success';
    ui.videoProviderTestState.textContent = result.message;
    return result;
  } catch (error) {
    ui.videoProviderTestState.className = 'api-test-state error';
    ui.videoProviderTestState.textContent = error.message;
  } finally {
    ui.testVideoProvider.disabled = false;
    ui.saveVideoProvider.disabled = false;
  }
}

async function saveVideoProvider(event) {
  event.preventDefault();
  ui.saveVideoProvider.disabled = true;
  try {
    if (!platformEngines.includes(ui.videoProviderPreset.value)) {
      const discovery = await testVideoProvider();
      if (!discovery) return;
      ui.saveVideoProvider.disabled = true;
    }
    const value = videoProviderFormValue();
    await fetchJson('/api/video-providers', { method: 'POST', body: JSON.stringify(value) });
    await loadVideoProviders();
    setEngine(value.providerId);
    await loadSystem();
    closeVideoProviderModal();
    toast(platformEngines.includes(value.providerId) ? `${videoProviderById(value.providerId)?.label || '平台协作'}已启用，无需 API` : `${videoProviderById(value.providerId)?.label || '视频提供商'}已保存；尚未创建任何生成任务`);
  } catch (error) {
    ui.videoProviderTestState.className = 'api-test-state error';
    ui.videoProviderTestState.textContent = error.message;
  } finally { ui.saveVideoProvider.disabled = false; }
}

async function persistVideoProviderSelection(engine) {
  try {
    await fetchJson('/api/video-providers', { method: 'POST', body: JSON.stringify({ providerId: engineProviderId(engine), select: true }) });
    await loadVideoProviders();
  } catch {}
}

async function copyPlatformPrompt() {
  if (!activePlatformAction?.prompt) return;
  try {
    if (window.localFrame?.copyPlatformPrompt) await window.localFrame.copyPlatformPrompt(activePlatformAction.prompt);
    else await navigator.clipboard.writeText(activePlatformAction.prompt);
    toast('当前镜头提示词已复制');
  } catch (error) { toast(`复制失败：${error.message}`, true); }
}

async function openPlatformSite() {
  if (!activePlatformAction?.platformUrl) return;
  try {
    if (window.localFrame?.openPlatformSite) await window.localFrame.openPlatformSite(activePlatformAction.platformUrl);
    else window.open(activePlatformAction.platformUrl, '_blank', 'noopener');
  } catch (error) { toast(`无法打开平台：${error.message}`, true); }
}

async function openPlatformAssets() {
  if (!activePlatformAction) return;
  try {
    if (window.localFrame?.openPlatformAssets) await window.localFrame.openPlatformAssets(activePlatformAction.jobId);
    else toast('参考图已由 LocalFrame 整理；请在桌面应用中打开所在位置');
  } catch (error) { toast(`无法打开参考图：${error.message}`, true); }
}

async function choosePlatformVideo() {
  if (!activePlatformAction) return;
  ui.platformChooseVideo.disabled = true;
  try {
    if (!window.localFrame?.choosePlatformVideo) throw new Error('请在 LocalFrame 桌面应用中使用此功能');
    const result = await window.localFrame.choosePlatformVideo(activePlatformAction);
    if (result?.imported) toast('视频已接回，正在准备下一步');
  } catch (error) { toast(error.message, true); }
  finally { ui.platformChooseVideo.disabled = false; }
}

async function preparePlatformHandoff(job) {
  if (!job?.platform || !job.handoff) {
    activePlatformAction = null;
    ui.platformHandoffBar.classList.add('hidden');
    return;
  }
  activePlatformAction = job.handoff;
  ui.platformHandoffBar.classList.remove('hidden');
  ui.platformHandoffTitle.textContent = `${job.handoff.providerLabel} · 镜头 ${job.handoff.shotNumber}/${job.handoff.totalShots} · ${job.handoff.title}`;
  ui.platformHandoffText.textContent = `提示词已准备 · ${job.handoff.duration} 秒 · ${job.handoff.ratio} · 正在等待下载视频`;
  ui.platformOpenAssets.classList.toggle('hidden', !job.handoff.assetNames?.first && !job.handoff.assetNames?.last);
  if (lastPlatformActionId === job.handoff.actionId) return;
  lastPlatformActionId = job.handoff.actionId;
  let previouslyOpened = false;
  try { previouslyOpened = localStorage.getItem('localframe.platform.action') === job.handoff.actionId; } catch {}
  try {
    if (window.localFrame?.preparePlatformHandoff) {
      await window.localFrame.preparePlatformHandoff(job.handoff, { openPlatform: !previouslyOpened });
    } else {
      await navigator.clipboard.writeText(job.handoff.prompt);
      if (!previouslyOpened) window.open(job.handoff.platformUrl, '_blank', 'noopener');
    }
    try { localStorage.setItem('localframe.platform.action', job.handoff.actionId); } catch {}
    if (!previouslyOpened) toast(`镜头 ${job.handoff.shotNumber} 已准备，提示词已复制并打开平台`);
  } catch (error) { toast(`平台协作准备失败：${error.message}`, true); }
}

async function optimizePrompt() {
  const prompt = ui.prompt.value.trim();
  if (!prompt) { ui.prompt.focus(); toast('请先输入需要优化的提示词', true); return; }
  const oldLabel = ui.optimizePrompt.innerHTML;
  ui.optimizePrompt.disabled = true;
  ui.optimizePrompt.textContent = '优化中…';
  try {
    const data = await fetchJson('/api/prompt/optimize', { method: 'POST', body: JSON.stringify({ prompt }) });
    ui.prompt.value = data.optimizedPrompt;
    ui.prompt.dispatchEvent(new Event('input'));
    promptOptimizedByAi = true;
    toast('提示词优化完成');
  } catch (error) {
    toast(error.message, true);
  } finally {
    ui.optimizePrompt.disabled = false;
    ui.optimizePrompt.innerHTML = oldLabel;
  }
}

async function generate() {
  const prompt = ui.prompt.value.trim();
  if (!prompt) { ui.prompt.focus(); toast('请先输入视频提示词', true); return; }
  const { width, height, outputWidth, outputHeight, upscale } = parseResolution();
  const duration = Number(ui.duration.value);
  const frames = gridFrames(duration);
  const sameDeviceProvider = (() => {
    if (!providerConfig?.enabled || !providerConfig.baseUrl) return false;
    try {
      const host = new URL(providerConfig.baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      return host === 'localhost' || host === '::1' || host === '0.0.0.0' || /^127(?:\.\d{1,3}){3}$/.test(host);
    } catch { return false; }
  })();
  if (currentEngine === 'int8' && ui.directorMode.checked) {
    if (!sameDeviceProvider && !storyboard.length) {
      const built = await buildStoryboard(true, true);
      if (!built) { toast('无法建立导演分镜，请检查整片创意', true); return; }
    }
    if (storyboard.length && (storyboardEdited || storyboardSource === 'api-director' || !sameDeviceProvider)) {
      try { validateStoryboard(); } catch (error) { toast(error.message, true); return; }
    }
  }
  const warningItems = [];
  if (upscale) warningItems.push(`将先生成 ${width}×${height}，再输出 ${outputWidth}×${outputHeight}`);
  const enhancement = { mode: ui.enhancementMode.value, profile: ui.enhancementProfile.value };
  if (upscale && outputWidth >= 2048 && enhancement.mode === 'none') { toast('2K 输出请在高级设置中明确选择 Lanczos、Real-ESRGAN 或 FlashVSR', true); return; }
  if (upscale && enhancement.mode !== 'none') warningItems.push(`二次画质修复：${enhancementLabel(enhancement.mode)}（${enhancement.profile === 'fast' ? '快速' : enhancement.profile === 'quality' ? '细节优先' : '均衡'}）`);
  if (['realesrgan', 'flashvsr'].includes(enhancement.mode) && enhancementData?.modes?.[enhancement.mode]?.ready === false) { toast(`${enhancementLabel(enhancement.mode)} 当前未安装完整后端或权重`, true); return; }
  if (duration > 10) warningItems.push(`${duration} 秒将按 ${storyboard.length || Math.ceil(duration / 10)} 个导演镜头生成，自动续帧、校验和合片`);
  if (currentEngine === 'int8' && width * height >= 900000 && duration >= 20 && Number(ui.steps.value) >= 8) warningItems.push('已启用长片耐久模式：单镜头最长等待 4 小时，并在失败时逐级清显存、降载渲染后还原所选高清分辨率');
  if (storyboardEdited) warningItems.push('将使用你修改后的分镜脚本');
  if (storyboard.length && storyboardBasePrompt !== prompt) warningItems.push('整片创意在分镜生成后有改动；当前仍以已编辑分镜为准');
  if (currentEngine === 'q2') warningItems.push('Q2 是低精度预览，可能出现绿色条纹和严重涂抹');
  if (cloudEngines.includes(currentEngine)) {
    const provider = videoProviderById(currentEngine);
    if (platformEngines.includes(currentEngine)) {
      warningItems.push(`将为 ${provider?.label || currentEngine} 自动复制提示词、整理参考图并打开官网`);
      warningItems.push('你在平台官网确认生成并下载后，LocalFrame 会自动接回视频');
    } else {
      warningItems.push(`将把提示词${imageData.first ? '和参考图' : ''}发送给 ${provider?.label || currentEngine}`);
      warningItems.push('点击确认后会创建厂商云端任务，可能按照你的厂商账户规则产生费用');
    }
  }
  const confirmTail = platformEngines.includes(currentEngine)
    ? '\n\n平台账号与费用仍由官网管理。现在开始平台协作吗？'
    : cloudEngines.includes(currentEngine)
    ? '\n\nLocalFrame 无法代替厂商估算实际费用。确认创建云端任务吗？'
    : '\n\n生成会长时间占用 GPU，建议接通电源并保持散热。\n\n仍然开始吗？';
  if (warningItems.length && !window.confirm(`${warningItems.join('\n')}。${confirmTail}`)) return;
  const payload = {
    prompt, engine: currentEngine, width, height, outputWidth, outputHeight, upscale, duration, frames,
    nativeResolution: ui.resolution.selectedOptions[0]?.dataset.nativeResolution || '',
    steps: Number(ui.steps.value),
    seed: Number(ui.seed.value),
    randomSeed: false,
    firstImage: imageData.first,
    lastImage: imageData.last,
    storyboard: currentEngine === 'int8' && ui.directorMode.checked ? storyboard : null,
    directorMode: currentEngine === 'int8' && ui.directorMode.checked,
    storyboardEdited,
    storyboardSource,
    promptOptimizedByAi,
    generateAudio: true,
    enhancement,
  };

  ui.generate.disabled = true;
  try {
    const data = await fetchJson('/api/generate', { method: 'POST', body: JSON.stringify(payload) });
    renderJob(data.job);
    startPolling();
    toast(platformEngines.includes(currentEngine) ? '平台协作已启动；正常下载视频后会自动接回' : cloudEngines.includes(currentEngine) ? '云端任务已提交；可关闭后重新打开应用继续查看进度' : sameDeviceProvider ? '已启动显存保护：先处理文字与分镜，再载入视频模型' : '任务已开始，本地生成不会上传素材');
  } catch (error) {
    toast(error.message, true);
    ui.generate.disabled = false;
  }
}

async function cancel() {
  try {
    const result = await fetchJson('/api/cancel', { method: 'POST', body: '{}' });
    ui.cancel.disabled = true;
    toast(result.message || '正在安全停止任务');
  } catch (error) { toast(error.message, true); }
}

function renderJob(job) {
  if (!job) return;
  preparePlatformHandoff(job);
  if (job.memoryGuard?.prepared && lastPreparedJobId !== job.id) {
    lastPreparedJobId = job.id;
    if (job.prompt && job.prompt !== ui.prompt.value) {
      ui.prompt.value = job.prompt;
      ui.prompt.dispatchEvent(new Event('input'));
    }
    promptOptimizedByAi = job.memoryGuard.promptOptimized === true;
    if (Array.isArray(job.storyboard) && job.storyboard.length) {
      storyboard = job.storyboard;
      storyboardBasePrompt = job.prompt;
      storyboardEdited = false;
      storyboardSource = 'api-director';
      renderStoryboard(storyboardSource);
    }
  }
  const running = job.status === 'running';
  ui.generate.disabled = running;
  ui.cancel.classList.toggle('hidden', !running);
  ui.cancel.disabled = false;

  if (running) {
    setStage('stageRunning');
    ui.phase.textContent = job.phase || '生成中';
    ui.progressText.textContent = `${formatPercent(job.progress)}%`;
    ui.progressBar.style.width = `${Math.max(3, job.progress || 0)}%`;
    ui.shotProgressText.textContent = job.segments ? `当前镜头 ${job.segment || 1}/${job.segments}` : '当前镜头';
    ui.shotStepText.textContent = job.platform && job.handoff ? '等待官网下载' : job.samplingSteps ? `采样 ${job.samplingStep || 0}/${job.samplingSteps} · ${formatPercent(job.shotProgress)}%` : `${formatPercent(job.shotProgress)}%`;
    ui.shotProgressBar.style.width = `${Math.min(100, Math.max(0, job.shotProgress || 0))}%`;
    ui.elapsed.textContent = `已用时 ${formatTime(job.elapsedSeconds)}`;
    const segment = job.segments ? ` · 镜头 ${job.segment || 1}/${job.segments}` : '';
    const recovered = job.recoveredShots ? ` · 已恢复 ${job.recoveredShots} 段` : '';
    const recovery = job.recoveryLevel ? ` · 恢复档 ${job.recoveryLevel}/${job.recoveryLevels || 4}` : '';
    ui.jobSpec.textContent = job.platform
      ? `${job.providerLabel || job.providerId} · ${job.handoff ? `${job.handoff.duration} 秒 · ${job.handoff.ratio}` : '正在自动后期'}`
      : job.cloud
      ? `${job.providerLabel || job.providerId} · ${job.providerModel || ''} · ${job.duration} 秒 · ${job.rawRemoteStatus || '已提交'}`
      : `${job.outputWidth || job.width}×${job.outputHeight || job.height} · ${job.duration || (job.frames / 24).toFixed(1)} 秒 · ${job.steps} 步${segment}${recovered}${recovery}`;
  } else if (job.status === 'completed') {
    setStage('stageResult');
    ui.resultVideo.src = `/media/${encodeURIComponent(job.outputName)}?t=${Date.now()}`;
    ui.resultVideo.play().catch(() => {});
  } else if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'paused') {
    setStage('stageError');
    ui.errorMessage.textContent = job.status === 'paused' ? (job.phase || '任务已在镜头结束后安全暂停，已完成镜头可继续复用。') : job.status === 'cancelled' ? '任务已取消，没有生成输出文件。' : (job.error || '请展开运行日志查看详细信息。');
  }
  ui.log.textContent = job.logs && job.logs.length ? job.logs.join('\n') : '等待运行日志…';
  ui.log.scrollTop = ui.log.scrollHeight;

  if (lastJobStatus && lastJobStatus === 'running' && job.status === 'completed') {
    toast(`生成完成，用时 ${formatTime(job.elapsedSeconds)}`);
    if (!$('historyContent').classList.contains('hidden')) loadHistory();
  } else if (lastJobStatus === 'running' && job.status === 'failed') {
    toast('生成失败，请查看日志', true);
  }
  lastJobStatus = job.status;
}

async function pollStatus() {
  try {
    const data = await fetchJson('/api/status');
    if (firstVideoPoll) {
      firstVideoPoll = false;
      if (data.job && data.job.status !== 'running') {
        lastJobStatus = data.job.status;
        stopPolling();
        return;
      }
    }
    if (data.job) renderJob(data.job);
    if (!data.job || data.job.status !== 'running') stopPolling();
  } catch (error) { toast(`无法读取任务状态：${error.message}`, true); }
}

let firstVideoPoll = true;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollStatus, 1000);
  pollStatus();
}
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

async function loadSystem() {
  try {
    const data = await fetchJson('/api/system');
    systemData = data;
    const engineReady = Boolean(data.engines?.[currentEngine]);
    ui.systemPill.className = `system-pill ${engineReady ? 'ready' : 'error'}`;
    const selectedVideoProvider = videoProviderById(currentEngine);
    ui.systemPill.querySelector('span').textContent = platformEngines.includes(currentEngine)
      ? `${selectedVideoProvider?.label || currentEngine}可用`
      : cloudEngines.includes(currentEngine)
      ? (engineReady ? `${selectedVideoProvider?.label || currentEngine}已配置` : `${selectedVideoProvider?.label || currentEngine}待配置`)
      : engineReady ? `${currentEngine === 'int8' ? 'INT8 高质量' : 'Q2 预览'}已就绪` : `${currentEngine === 'int8' ? 'INT8 环境待安装' : 'Q2 模型缺失'}`;
    if (lastJobStatus !== 'running') ui.generate.disabled = !engineReady;
    if (data.gpu) {
      ui.gpuName.textContent = data.gpu.name;
      ui.gpuMemory.textContent = `${data.gpu.memoryUsed} / ${data.gpu.memoryTotal} MB`;
      ui.gpuUsage.textContent = `${data.gpu.utilization}%`;
      ui.gpuTemp.textContent = `${data.gpu.temperature}°C`;
    }
  } catch {
    ui.systemPill.className = 'system-pill error';
    ui.systemPill.querySelector('span').textContent = '本地服务重连中';
    ui.systemPill.title = '点击立即重新连接本地服务';
  }
}

function formatSize(bytes) {
  if (!bytes) return '未安装';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

async function loadEnvironment() {
  try {
    const data = await fetchJson('/api/environment');
    ui.environmentPath.textContent = data.root;
    const assessment = data.assessment || {};
    ui.deploymentSummary.textContent = assessment.summary || '环境检测完成';
    ui.deploymentCheckGrid.replaceChildren();
    for (const check of assessment.checks || []) {
      const item = document.createElement('div');
      item.className = `deployment-check ${check.state || 'warning'}`;
      const icon = document.createElement('i');
      icon.textContent = check.state === 'passed' ? '✓' : check.state === 'failed' ? '!' : '△';
      const copy = document.createElement('span');
      const title = document.createElement('b'); title.textContent = check.label;
      const detail = document.createElement('small'); detail.textContent = check.detail;
      copy.append(title, detail); item.append(icon, copy); ui.deploymentCheckGrid.append(item);
    }
    ui.componentGrid.replaceChildren();
    for (const component of data.components) {
      const item = document.createElement('div');
      item.className = `component-item ${component.ready ? 'ready' : component.required === false ? 'optional' : ''}`;
      const dot = document.createElement('i');
      const copy = document.createElement('span');
      const title = document.createElement('b'); title.textContent = component.label;
      const detail = document.createElement('small'); detail.textContent = component.ready ? formatSize(component.size) : (component.required === false ? '可选 · 检查/修复可安装' : '缺失 / 下载中');
      copy.append(title, detail); item.append(dot, copy); ui.componentGrid.append(item);
    }
    ui.installProgress.classList.toggle('hidden', !data.running && data.progress === 0);
    ui.installPhase.textContent = data.phase;
    ui.installPercent.textContent = `${data.progress}%`;
    ui.installBar.style.width = `${data.progress}%`;
    ui.environmentError.classList.toggle('hidden', !data.error && assessment.compatible !== false);
    ui.environmentError.textContent = data.error || (assessment.blockers || []).join('；');
    ui.environmentLog.textContent = data.logs?.length ? data.logs.join('\n') : '尚未开始部署';
    ui.installEnvironment.disabled = data.running || (!data.ready && assessment.compatible === false);
    ui.installEnvironment.textContent = data.running ? '正在自动部署…' : (data.ready ? '校验 / 一键修复' : '一键部署 H3');
    ui.changeEnvironment.disabled = data.running;
    if (data.running) setTimeout(loadEnvironment, 1800);
  } catch (error) { toast(`环境检测失败：${error.message}`, true); }
}

async function installEnvironment() {
  try {
    const planId = ui.deploymentPlan.value || 'auto';
    await fetchJson('/api/environment/install', { method: 'POST', body: JSON.stringify({ planId }) });
    toast('H3 自动部署已开始，下载支持断点续传；关闭后再次点击可继续');
    loadEnvironment();
  } catch (error) { toast(error.message, true); }
}

async function changeEnvironmentRoot() {
  if (!window.localFrame?.chooseInstallRoot) { toast('请在 LocalFrame 桌面软件内更改安装位置', true); return; }
  try {
    const selected = await window.localFrame.chooseInstallRoot();
    if (!selected) return;
    toast(`安装位置已改为 ${selected.installRoot}`);
    window.location.reload();
  } catch (error) { toast(`更改安装位置失败：${error.message}`, true); }
}

function historyDayKey(ms) {
  const date = new Date(Number(ms));
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function historyGroupLabel(key) {
  const date = new Date(`${key}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - date) / 86400000);
  const formatted = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
  if (days === 0) return `今天 · ${formatted}`;
  if (days === 1) return `昨天 · ${formatted}`;
  return date.getFullYear() === today.getFullYear() ? formatted : `${date.getFullYear()}年 ${formatted}`;
}

function loadHistoryGroupState() {
  try { return JSON.parse(localStorage.getItem('localframe.history.groups') || '{}'); } catch { return {}; }
}

function saveHistoryGroupState(state) {
  try { localStorage.setItem('localframe.history.groups', JSON.stringify(state)); } catch {}
}

function updateHistoryToggleLabel() {
  const groups = [...ui.historyGrid.querySelectorAll('.history-group')];
  ui.toggleHistoryGroups.textContent = groups.some((group) => group.open) ? '全部折叠' : '全部展开';
  ui.toggleHistoryGroups.disabled = groups.length === 0;
}

function createHistoryCard(item) {
  const card = document.createElement('article');
  card.className = 'history-card';
  const video = document.createElement('video');
  video.src = `/media/${encodeURIComponent(item.outputName)}#t=0.15`;
  video.muted = true;
  video.preload = 'metadata';
  const copy = document.createElement('div');
  copy.className = 'history-copy';
  const title = document.createElement('p');
  title.textContent = item.prompt || '本地生成视频';
  const meta = document.createElement('span');
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.file.modifiedAt));
  meta.textContent = `${time} · ${(item.file.size / 1024 / 1024).toFixed(1)} MB`;
  copy.append(title, meta);
  card.append(video, copy);
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'history-delete'; remove.textContent = '删除';
  remove.setAttribute('aria-label', `删除视频 ${item.outputName}`);
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    pendingVideoDelete = item.outputName;
    $('deleteVideoDialog').showModal();
  });
  card.append(remove);
  card.addEventListener('click', () => {
    setStage('stageResult');
    ui.resultVideo.src = `/media/${encodeURIComponent(item.outputName)}`;
    ui.resultVideo.play().catch(() => {});
    const rightColumn = ui.basicWorkspace.querySelector('.right-column');
    if (rightColumn && getComputedStyle(rightColumn).overflowY === 'auto') rightColumn.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  return card;
}

let pendingVideoDelete = '';
$('cancelVideoDelete').addEventListener('click', () => $('deleteVideoDialog').close());
$('deleteVideoDialog').addEventListener('close', () => { pendingVideoDelete = ''; });
$('confirmVideoDelete').addEventListener('click', async () => {
  const name = pendingVideoDelete;
  if (!name) return;
  $('confirmVideoDelete').disabled = true;
  try {
    await fetchJson(`/api/history/${encodeURIComponent(name)}`, { method: 'DELETE' });
    $('deleteVideoDialog').close();
    if (new URL(ui.resultVideo.src, location.href).pathname === `/media/${encodeURIComponent(name)}`) {
      ui.resultVideo.pause(); ui.resultVideo.removeAttribute('src'); ui.resultVideo.load(); setStage('stageEmpty');
    }
    await loadHistory();
    await loadPostStudio();
    toast('视频作品已删除');
  } catch (error) { toast(`删除失败：${error.message}`, true); }
  finally { $('confirmVideoDelete').disabled = false; }
});

async function loadHistory() {
  try {
    const data = await fetchJson('/api/history');
    ui.historyGrid.replaceChildren();
    ui.historyEmpty.classList.toggle('hidden', data.items.length > 0);
    const grouped = new Map();
    for (const item of data.items) {
      const key = historyDayKey(item.file.modifiedAt);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    const savedState = loadHistoryGroupState();
    let index = 0;
    for (const [key, items] of grouped) {
      const group = document.createElement('details');
      group.className = 'history-group';
      group.dataset.group = key;
      group.open = Object.hasOwn(savedState, key) ? Boolean(savedState[key]) : index === 0;
      const summary = document.createElement('summary');
      const title = document.createElement('strong'); title.textContent = historyGroupLabel(key);
      const totalMb = items.reduce((sum, item) => sum + Number(item.file.size || 0), 0) / 1024 / 1024;
      const meta = document.createElement('span'); meta.textContent = `${items.length} 个作品 · ${totalMb.toFixed(1)} MB`;
      summary.append(title, meta);
      const grid = document.createElement('div'); grid.className = 'history-group-grid';
      for (const item of items) grid.append(createHistoryCard(item));
      group.append(summary, grid);
      group.addEventListener('toggle', () => {
        const state = loadHistoryGroupState();
        state[key] = group.open;
        saveHistoryGroupState(state);
        updateHistoryToggleLabel();
      });
      ui.historyGrid.append(group);
      index += 1;
    }
    updateHistoryToggleLabel();
  } catch (error) { toast(error.message, true); }
}

ui.prompt.addEventListener('input', () => {
  promptOptimizedByAi = false;
  ui.promptCount.textContent = ui.prompt.value.length;
  if (storyboard.length && storyboardBasePrompt !== ui.prompt.value.trim()) ui.storyboardHelp.textContent = '整片创意已变化。点击“自动拆解分镜”可同步更新；若已手工修改，也可继续使用当前分镜。';
});
ui.examplePrompt.addEventListener('click', () => {
  ui.prompt.value = '电影感写实画面：一只红熊猫穿过清晨薄雾中的竹林，镜头低机位平稳跟拍。阳光穿过竹叶形成流动光斑，红熊猫偶尔回头看向镜头。环境声包含鸟鸣、竹叶摩擦声与轻柔脚步声，配以克制温暖的弦乐。';
  ui.prompt.dispatchEvent(new Event('input'));
});
ui.optimizePrompt.addEventListener('click', optimizePrompt);
ui.buildStoryboard.addEventListener('click', () => buildStoryboard(true));
ui.directorMode.addEventListener('change', () => {
  ui.directorCard.classList.toggle('off', !ui.directorMode.checked);
  if (ui.directorMode.checked && !storyboard.length) buildStoryboard(false, true);
  updateEstimate();
});
document.querySelectorAll('.setting-tabs button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.setting-tabs button').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.settings-pane').forEach((pane) => pane.classList.toggle('hidden', pane.id !== button.dataset.pane));
}));
handleImage(ui.firstImage, 'first', ui.firstCard, ui.firstPreview);
handleImage(ui.lastImage, 'last', ui.lastCard, ui.lastPreview);
document.querySelectorAll('.remove-upload').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); removeImage(button.dataset.target); }));
for (const control of [ui.resolution, ui.steps]) control.addEventListener('change', updateEstimate);
for (const control of [ui.enhancementMode, ui.enhancementProfile]) control.addEventListener('change', () => { updateEnhancementNote(); updateEstimate(); });
ui.duration.addEventListener('change', () => {
  storyboard = [];
  storyboardBasePrompt = '';
  storyboardEdited = false;
  storyboardSource = '';
  if (currentEngine === 'int8') {
    ui.directorMode.checked = true;
    ui.directorCard.classList.remove('off');
  }
  renderStoryboard();
  updateEstimate();
  if (currentEngine === 'int8' && ui.prompt.value.trim()) buildStoryboard(false, true);
});
document.querySelectorAll('.engine-picker button').forEach((button) => button.addEventListener('click', () => {
  setEngine(button.dataset.engine);
  persistVideoProviderSelection(button.dataset.engine);
  if (cloudEngines.includes(button.dataset.engine) && !videoProviderById(button.dataset.engine)?.configured) openVideoProviderModal();
}));
ui.randomizeSeed.addEventListener('click', () => { ui.seed.value = Math.floor(Math.random() * 2147483647); });
ui.generate.addEventListener('click', generate);
ui.cancel.addEventListener('click', cancel);
ui.retry.addEventListener('click', () => setStage('stageEmpty'));
ui.replay.addEventListener('click', () => { ui.resultVideo.currentTime = 0; ui.resultVideo.play(); });
ui.refreshHistory.addEventListener('click', loadHistory);
$('toggleHistoryVisibility').addEventListener('click', () => {
  const open = $('historyContent').classList.contains('hidden');
  $('historyContent').classList.toggle('hidden', !open);
  $('toggleHistoryVisibility').textContent = open ? '收起过往视频' : '查看过往视频';
  $('toggleHistoryVisibility').setAttribute('aria-expanded', String(open));
  ui.toggleHistoryGroups.classList.toggle('hidden', !open);
  ui.refreshHistory.classList.toggle('hidden', !open);
  if (open) loadHistory();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!$('historyContent').classList.contains('hidden')) $('toggleHistoryVisibility').click();
  if (ui.basicWorkspace.classList.contains('hidden')) return;
  ui.resultVideo.pause();
  ui.resultVideo.removeAttribute('src');
  ui.resultVideo.load();
  if (lastJobStatus !== 'running') setStage('stageEmpty');
});
ui.toggleHistoryGroups.addEventListener('click', () => {
  const groups = [...ui.historyGrid.querySelectorAll('.history-group')];
  const shouldOpen = !groups.some((group) => group.open);
  const state = loadHistoryGroupState();
  for (const group of groups) {
    group.open = shouldOpen;
    state[group.dataset.group] = shouldOpen;
  }
  saveHistoryGroupState(state);
  updateHistoryToggleLabel();
});
ui.openFolder.addEventListener('click', async () => { try { await fetchJson('/api/open-output', { method: 'POST', body: '{}' }); } catch (error) { toast(error.message, true); } });
ui.systemPill.addEventListener('click', async () => {
  if (!ui.systemPill.classList.contains('error')) return;
  if (cloudEngines.includes(currentEngine)) { openVideoProviderModal(); return; }
  ui.systemPill.querySelector('span').textContent = '正在重新启动本地服务';
  const recovered = await recoverLocalBackend(true);
  if (recovered) {
    await Promise.allSettled([loadSystem(), loadEnvironment(), loadWorkflowProjects()]);
    toast('本地服务已恢复');
  } else toast('本地服务恢复失败，请重新打开软件', true);
});
ui.installEnvironment.addEventListener('click', installEnvironment);
ui.changeEnvironment.addEventListener('click', changeEnvironmentRoot);
ui.openEnvironment.addEventListener('click', async () => { try { await fetchJson('/api/environment/open', { method: 'POST', body: '{}' }); } catch (error) { toast(error.message, true); } });
ui.providerCard.addEventListener('click', openProviderModal);
ui.closeProvider.addEventListener('click', closeProviderModal);
ui.providerPreset.addEventListener('change', applyProviderPreset);
ui.detectLocalProviders.addEventListener('click', detectPromptProviders);
ui.detectedProvider.addEventListener('change', () => applyDetectedProvider(ui.detectedProvider.value));
ui.providerBaseUrl.addEventListener('input', () => {
  selectedProviderId = 'custom';
  ui.providerPreset.value = 'custom';
});
ui.testProvider.addEventListener('click', testPromptProvider);
ui.providerForm.addEventListener('submit', savePromptProvider);
ui.providerModal.addEventListener('click', (event) => { if (event.target === ui.providerModal) closeProviderModal(); });
ui.videoProviderCard.addEventListener('click', openVideoProviderModal);
ui.closeVideoProvider.addEventListener('click', closeVideoProviderModal);
ui.videoProviderPreset.addEventListener('change', () => fillVideoProviderForm(ui.videoProviderPreset.value));
ui.videoProviderModel.addEventListener('change', () => renderVideoNativeResolutions(videoProviderById(ui.videoProviderPreset.value)));
ui.videoProviderModel.addEventListener('input', () => renderVideoNativeResolutions(videoProviderById(ui.videoProviderPreset.value)));
ui.testVideoProvider.addEventListener('click', testVideoProvider);
ui.videoProviderForm.addEventListener('submit', saveVideoProvider);
ui.videoProviderModal.addEventListener('click', (event) => { if (event.target === ui.videoProviderModal) closeVideoProviderModal(); });
ui.platformCopyPrompt.addEventListener('click', copyPlatformPrompt);
ui.platformOpenAssets.addEventListener('click', openPlatformAssets);
ui.platformOpenSite.addEventListener('click', openPlatformSite);
ui.platformChooseVideo.addEventListener('click', choosePlatformVideo);
ui.optimizationPreset.addEventListener('change', describeOptimizationChoice);
ui.slaMode.addEventListener('change', describeOptimizationChoice);
ui.spectrumMode.addEventListener('change', () => { describeOptimizationChoice(); updateEstimate(); });
ui.fastDisk.addEventListener('change', describeOptimizationChoice);
ui.saveOptimization.addEventListener('click', saveOptimization);
document.querySelectorAll('[data-app-mode]').forEach((button) => button.addEventListener('click', () => setAppMode(button.dataset.appMode)));
ui.workflowNewProject.addEventListener('click', newWorkflowProject);
ui.workflowSaveProject.addEventListener('click', () => saveWorkflowProject());
ui.workflowRefreshProjects.addEventListener('click', loadWorkflowProjects);
ui.workflowGenerateScript.addEventListener('click', generateWorkflowScript);
ui.workflowAddCharacter.addEventListener('click', addWorkflowCharacter);
ui.workflowBuildStoryboard.addEventListener('click', buildWorkflowStoryboard);
ui.workflowBuildPlan.addEventListener('click', buildWorkflowPlan);
ui.workflowPrepareEnvironment.addEventListener('click', prepareWorkflowEnvironment);
ui.workflowStartProduction.addEventListener('click', startWorkflowProduction);
ui.voiceStudioInstall.addEventListener('click', installVoiceEngine);
ui.editorRefresh.addEventListener('click', loadPostStudio);
ui.editorProjectSelect.addEventListener('change', loadEditorProject);
ui.editorVideoSelect.addEventListener('change', updateEditorVideoPreview);
ui.editorExtract.addEventListener('click', extractEditorSubtitles);
ui.editorAddCue.addEventListener('click', addEditorCue);
ui.editorRender.addEventListener('click', renderEditorSubtitles);
for (const control of [ui.voiceSpeed, ui.voicePause, ui.voiceVariation]) control.addEventListener('input', updateVoiceStudioValues);
ui.voiceStudioPreview.addEventListener('click', previewVoiceStudio);
ui.voiceStudioSave.addEventListener('click', saveVoiceStudioDefaults);
ui.voiceCloneCreate.addEventListener('click', createCustomVoice);
for (const field of [
  ui.workflowTitle, ui.workflowIdea, ui.workflowDuration, ui.workflowAspect, ui.workflowStyle, ui.workflowAudience,
  ui.workflowDialogue, ui.workflowDelivery, ui.workflowLogline, ui.workflowOutline, ui.workflowScreenplay,
  ui.workflowCharacters, ui.workflowLocations, ui.workflowVisualRules, ui.workflowAudioRules,
  ui.workflowGenerationQuality, ui.workflowGenerationSteps, ui.workflowShotSeconds, ui.workflowContinuity, ui.workflowAudioMode,
  ui.workflowEnhancementMode, ui.workflowEnhancementProfile,
]) field.addEventListener('input', workflowMarkDirty);
for (const field of [ui.workflowGenerationQuality, ui.workflowGenerationSteps, ui.workflowShotSeconds, ui.workflowContinuity, ui.workflowAudioMode, ui.workflowEnhancementMode, ui.workflowEnhancementProfile]) {
  field.addEventListener('change', () => { workflowGenerationChanged(); updateEnhancementNote(); });
}
document.querySelectorAll('[data-workflow-stage]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-workflow-stage]').forEach((item) => item.classList.toggle('active', item === button));
  $(button.dataset.workflowStage)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
ui.startProfessional.addEventListener('click', startProfessionalMode);
ui.refreshProfessional.addEventListener('click', loadProfessional);
ui.reloadComfy.addEventListener('click', () => {
  const url = ui.comfyFrame.src || 'http://127.0.0.1:8188/';
  ui.comfyFrame.src = 'about:blank';
  setTimeout(() => { ui.comfyFrame.src = url; }, 80);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeProviderModal(); closeVideoProviderModal(); } });

setEngine('int8');
setAppMode('basic');
setStage('stageEmpty');
renderStoryboard();
loadSystem();
loadPromptProvider();
const quickMemory = LastSettings.create('localframe.last.quick.v1', ['prompt', 'resolution', 'duration', 'steps', 'seed', 'enhancementMode', 'enhancementProfile']);
quickMemory.listen();
quickMemory.notice(document.querySelector('.setting-tabs'));
const postMemory = LastSettings.create('localframe.last.post.v1', ['editorFontSize', 'editorMargin', 'editorColor', 'editorBackground']);
postMemory.restore();
postMemory.listen();
postMemory.notice(document.querySelector('.post-workspace .post-panel-head'));
Promise.allSettled([loadVideoProviders(true), loadOptimization(true)]).then(() => {
  quickMemory.restore();
  ui.prompt.dispatchEvent(new Event('input'));
  updateEnhancementNote(); updateEstimate();
});
loadEnvironment();
loadVoiceStatus();
loadEnhancementStatus();
startPolling();
setInterval(loadSystem, 5000);
setInterval(loadEnvironment, 15000);
setInterval(loadVoiceStatus, 15000);
