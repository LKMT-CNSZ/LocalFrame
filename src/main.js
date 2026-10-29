'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Notification, clipboard, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { detectHardware } = require('./hardware');
const { verifyPack, ensureDirectories, saveRuntimeConfig, runBootstrap } = require('./setup');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let mainWindow;
let tray;
let hardwareCache;
let backendProcess;
let backendStartPromise;
let backendRestartTimer;
let backendRestartAttempts = 0;
let backendIntentionalStop = false;
let isQuitting = false;
let taskNotificationTimer;
let platformDownloadWatcher;
let activePlatformAction;
const platformCandidates = new Set();
let lastObservedJob = null;
const notifiedJobStates = new Set();
const notificationMonitorStartedAt = Date.now();
const backendPort = Number(process.env.LOCALFRAME_BACKEND_PORT || 7864);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const captureArg = process.argv.find((arg) => arg.startsWith('--capture='));
const capturePath = captureArg ? captureArg.slice('--capture='.length) : null;
const captureViewArg = process.argv.find((arg) => arg.startsWith('--capture-view='));
const captureView = captureViewArg ? captureViewArg.slice('--capture-view='.length) : '';
const captureDelayArg = process.argv.find((arg) => arg.startsWith('--capture-delay='));
const captureDelay = Math.min(60000, Math.max(1000, Number(captureDelayArg?.slice('--capture-delay='.length)) || 7000));

function resourceRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, '..', 'resources');
}

function deploymentConfigPath() {
  return path.join(app.getPath('userData'), 'config', 'deployment.json');
}

function defaultStorageRoot() {
  return process.platform === 'win32' && fsSync.existsSync('D:\\')
    ? 'D:\\AI'
    : path.join(app.getPath('userData'), 'AI');
}

async function loadStorageRoot() {
  try {
    const config = JSON.parse(await fs.readFile(deploymentConfigPath(), 'utf8'));
    if (typeof config.storageRoot === 'string' && path.isAbsolute(config.storageRoot)) return path.normalize(config.storageRoot);
  } catch {}
  return defaultStorageRoot();
}

async function saveStorageRoot(storageRoot) {
  const normalized = path.normalize(storageRoot);
  if (!path.isAbsolute(normalized)) throw new Error('请选择有效的绝对路径');
  if (process.platform === 'win32' && !/^[A-Za-z]:\\/.test(normalized)) throw new Error('请选择本机磁盘中的文件夹');
  await fs.access(normalized, fsSync.constants.W_OK);
  await fs.mkdir(path.dirname(deploymentConfigPath()), { recursive: true });
  await fs.writeFile(deploymentConfigPath(), `${JSON.stringify({ schemaVersion: 1, storageRoot: normalized }, null, 2)}\n`, 'utf8');
  return normalized;
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const candidates = [
    path.join(resourceRoot(), 'h3-studio', 'app', 'public', 'assets', 'localframe-logo.png'),
    path.join(__dirname, '..', 'assets', 'localframe-logo-icon.png'),
  ];
  const iconPath = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!iconPath) throw new Error('缺少系统托盘图标');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('LocalFrame 影像创作 · 单击打开');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 LocalFrame', click: focusMainWindow },
    { type: 'separator' },
    { label: '退出 LocalFrame', click: () => app.quit() },
  ]));
  tray.on('click', focusMainWindow);
  tray.on('double-click', focusMainWindow);
}

function showSystemNotification(title, body, key) {
  if (isQuitting || !Notification.isSupported()) return;
  if (key && notifiedJobStates.has(key)) return;
  if (key) notifiedJobStates.add(key);
  const icon = path.join(resourceRoot(), 'h3-studio', 'app', 'public', 'assets', 'localframe-logo.png');
  const notification = new Notification({
    title,
    body: String(body || '').slice(0, 240),
    icon: fsSync.existsSync(icon) ? icon : undefined,
    silent: false,
    urgency: 'normal',
  });
  notification.on('click', focusMainWindow);
  notification.show();
}

function backendJson(pathname, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const request = http.get(`${backendUrl}${pathname}`, { timeout: timeoutMs }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => { request.destroy(); reject(new Error('请求超时')); });
    request.on('error', reject);
  });
}

function postBackendJson(pathname, payload, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const request = http.request(`${backendUrl}${pathname}`, {
      method: 'POST', timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(parsed.error || `HTTP ${response.statusCode}`));
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy(new Error('平台视频接回超时')));
    request.on('error', reject);
    request.end(body);
  });
}

function validatePlatformUrl(value) {
  const url = new URL(String(value || ''));
  const allowed = new Set(['klingai.kuaishou.com', 'klingai.com', 'jimeng.jianying.com']);
  if (url.protocol !== 'https:' || !allowed.has(url.hostname.toLowerCase())) throw new Error('平台地址不在安全允许列表中');
  return url.toString();
}

function sanitizePlatformAction(input = {}) {
  const jobId = String(input.jobId || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!jobId) throw new Error('平台任务编号无效');
  const providerId = String(input.providerId || '');
  if (!['kling-platform', 'jimeng-platform'].includes(providerId)) throw new Error('不支持的平台协作提供商');
  return {
    ...input,
    jobId,
    providerId,
    actionId: String(input.actionId || '').slice(0, 180),
    prompt: String(input.prompt || '').slice(0, 4000),
    platformUrl: validatePlatformUrl(input.platformUrl),
    armedAt: String(input.armedAt || new Date().toISOString()),
  };
}

function platformExchangeDirectory(jobId) {
  return path.join(app.getPath('userData'), 'h3-studio', 'platform-handoff', String(jobId).replace(/[^a-zA-Z0-9-]/g, ''));
}

function platformInboxDirectory(jobId) {
  return path.join(app.getPath('userData'), 'h3-studio', 'platform-inbox', String(jobId).replace(/[^a-zA-Z0-9-]/g, ''));
}

function closePlatformWatcher() {
  if (platformDownloadWatcher) platformDownloadWatcher.close();
  platformDownloadWatcher = null;
  platformCandidates.clear();
}

async function waitForStableVideo(file, attempts = 24) {
  let previous = -1;
  let stable = 0;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size < 1024) throw new Error('视频仍在写入');
      stable = stat.size === previous ? stable + 1 : 0;
      previous = stat.size;
      if (stable >= 2) return stat;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('视频下载尚未完成');
}

async function importPlatformFile(actionInput, sourceFile) {
  const action = sanitizePlatformAction(actionInput);
  const resolved = path.resolve(sourceFile);
  if (!/\.(mp4|mov|webm)$/i.test(resolved)) throw new Error('请选择 MP4、MOV 或 WebM 视频');
  await waitForStableVideo(resolved);
  const inbox = platformInboxDirectory(action.jobId);
  await fs.mkdir(inbox, { recursive: true });
  const parsed = path.parse(resolved);
  const safeBase = parsed.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 90) || 'platform-video';
  const fileName = `${Date.now()}-${safeBase}${parsed.ext.toLowerCase()}`;
  await fs.copyFile(resolved, path.join(inbox, fileName));
  const result = await postBackendJson('/api/platform-handoff/import', { jobId: action.jobId, fileName });
  closePlatformWatcher();
  send('platform:imported', { jobId: action.jobId, fileName, job: result.job || null });
  focusMainWindow();
  return { imported: true, fileName, job: result.job || null };
}

function considerPlatformDownload(action, downloadDir, name) {
  if (!name || !/\.(mp4|mov|webm)$/i.test(name)) return;
  const file = path.resolve(downloadDir, name);
  if (!file.startsWith(path.resolve(downloadDir) + path.sep) || platformCandidates.has(file)) return;
  platformCandidates.add(file);
  setTimeout(async () => {
    try {
      const stat = await fs.stat(file);
      const armedAt = Date.parse(action.armedAt) || Date.now();
      if (stat.mtimeMs < armedAt - 2000) { platformCandidates.delete(file); return; }
      await importPlatformFile(action, file);
    } catch (error) {
      platformCandidates.delete(file);
      writeBackendLog(`[platform] 自动接回候选失败：${error.message}`);
    }
  }, 1200);
}

async function beginPlatformWatch(actionInput, scanExisting = false) {
  const action = sanitizePlatformAction(actionInput);
  closePlatformWatcher();
  activePlatformAction = action;
  const downloadDir = app.getPath('downloads');
  await fs.mkdir(downloadDir, { recursive: true });
  platformDownloadWatcher = fsSync.watch(downloadDir, { persistent: false }, (_event, fileName) => {
    considerPlatformDownload(action, downloadDir, String(fileName || ''));
  });
  if (scanExisting) {
    const names = await fs.readdir(downloadDir).catch(() => []);
    for (const name of names) considerPlatformDownload(action, downloadDir, name);
  }
  return { watching: true, downloadDir };
}

function notifyForTerminalJob(job) {
  if (!job?.id || !['completed', 'failed', 'paused', 'cancelled'].includes(job.status)) return;
  const key = `${job.id}:${job.status}`;
  const wasSeenRunning = lastObservedJob?.id === job.id && lastObservedJob.status === 'running';
  const finishedWhileOpen = Number(job.finishedAt || 0) >= notificationMonitorStartedAt - 1000;
  if (!wasSeenRunning && !finishedWhileOpen) return;
  if (job.status === 'completed') {
    showSystemNotification('视频生成完成', job.outputName ? `作品已保存：${job.outputName}` : '作品已经生成并保存，可以打开查看。', key);
  } else if (job.status === 'failed') {
    showSystemNotification('视频生成失败', job.error || job.phase || '任务发生错误，请打开 LocalFrame 查看详情。', key);
  } else if (job.status === 'paused') {
    showSystemNotification('任务已安全暂停', job.phase || '当前镜头已经保存，可以稍后继续生成。', key);
  } else {
    showSystemNotification('任务已取消', job.phase || '生成任务已经停止。', key);
  }
}

async function pollTaskNotifications() {
  if (isQuitting) return;
  try {
    const payload = await backendJson('/api/status/summary');
    const job = payload?.job || null;
    notifyForTerminalJob(job);
    lastObservedJob = job;
  } catch {
    // 后端监督器会负责恢复；临时断联不应制造重复通知。
  }
}

function startTaskNotificationMonitor() {
  if (taskNotificationTimer) clearInterval(taskNotificationTimer);
  pollTaskNotifications();
  taskNotificationTimer = setInterval(pollTaskNotifications, 4000);
}

function backendHealth() {
  return new Promise((resolve) => {
    const request = http.get(`${backendUrl}/api/system`, { timeout: 1200 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

async function waitForBackend(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await backendHealth()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function writeBackendLog(message) {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    const logFile = path.join(logDir, 'backend-supervisor.log');
    await fs.mkdir(logDir, { recursive: true });
    try {
      const stat = await fs.stat(logFile);
      if (stat.size > 2 * 1024 * 1024) await fs.rename(logFile, `${logFile}.${Date.now()}.previous`);
    } catch {}
    await fs.appendFile(logFile, `${new Date().toISOString()} ${String(message).trim()}\n`, 'utf8');
  } catch {}
}

function scheduleBackendRestart(reason) {
  if (isQuitting || backendRestartTimer) return;
  if (lastObservedJob?.status === 'running') {
    showSystemNotification(
      '生成服务意外中断',
      'LocalFrame 正在自动恢复服务。请打开软件查看任务恢复状态。',
      `${lastObservedJob.id}:backend-exit`,
    );
  }
  const delay = Math.min(30000, 1000 * (2 ** Math.min(backendRestartAttempts, 5)));
  backendRestartAttempts += 1;
  writeBackendLog(`[supervisor] 后端退出，${delay}ms 后自动恢复：${reason || '未知原因'}`);
  backendRestartTimer = setTimeout(() => {
    backendRestartTimer = null;
    startBackend().catch((error) => scheduleBackendRestart(error.message));
  }, delay);
}

async function startBackendOnce() {
  if (await backendHealth()) { backendRestartAttempts = 0; return; }
  const storageRoot = process.env.LOCALFRAME_STORAGE_ROOT || await loadStorageRoot();
  const h3Root = process.env.LOCALFRAME_H3_ROOT || path.join(storageRoot, 'MiniMax-H3');
  const serverScript = path.join(resourceRoot(), 'h3-studio', 'app', 'server.js');
  const dataRoot = path.join(app.getPath('userData'), 'h3-studio');
  await fs.mkdir(dataRoot, { recursive: true });
  const historyTarget = path.join(dataRoot, 'jobs.json');
  const legacyHistory = path.join(h3Root, 'app', 'data', 'jobs.json');
  if (!fsSync.existsSync(historyTarget) && fsSync.existsSync(legacyHistory)) await fs.copyFile(legacyHistory, historyTarget);
  if (!fsSync.existsSync(serverScript)) throw new Error(`桌面端服务文件缺失：${serverScript}`);
  const child = spawn(process.execPath, [serverScript], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      H3_STUDIO_PORT: String(backendPort),
      H3_ROOT_DIR: h3Root,
      H3_STORAGE_ROOT: storageRoot,
      H3_DATA_DIR: dataRoot,
      H3_INSTALLER: path.join(resourceRoot(), 'h3-studio', 'install-h3-int8.ps1'),
    },
  });
  backendProcess = child;
  child.stdout.on('data', (data) => {
    const line = `[H3] ${data.toString().trim()}`;
    console.log(line); writeBackendLog(line);
  });
  child.stderr.on('data', (data) => {
    const line = `[H3 error] ${data.toString().trim()}`;
    console.error(line); writeBackendLog(line);
  });
  child.on('error', (error) => writeBackendLog(`[supervisor] 无法启动后端：${error.stack || error.message}`));
  child.once('exit', (code, signal) => {
    if (backendProcess === child) backendProcess = null;
    if (backendIntentionalStop) backendIntentionalStop = false;
    else scheduleBackendRestart(`退出码 ${code}${signal ? ` / ${signal}` : ''}`);
  });
  if (!await waitForBackend()) throw new Error('本地 H3 服务启动超时，请检查运行日志');
  backendRestartAttempts = 0;
  writeBackendLog('[supervisor] 本地后端已就绪');
}

function startBackend() {
  if (!backendStartPromise) {
    backendStartPromise = startBackendOnce().finally(() => { backendStartPromise = null; });
  }
  return backendStartPromise;
}

async function restartBackend(force = false) {
  if (!force && await backendHealth()) return { ok: true, restarted: false };
  if (backendRestartTimer) { clearTimeout(backendRestartTimer); backendRestartTimer = null; }
  if (backendProcess && !backendProcess.killed) {
    const child = backendProcess;
    backendIntentionalStop = true;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
  backendProcess = null;
  await startBackend();
  return { ok: true, restarted: true };
}

function createWindow(loadStudio = true) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0d10',
    title: 'LocalFrame 影像创作',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.on('close', (event) => {
    if (isQuitting || capturePath) return;
    event.preventDefault();
    mainWindow.hide();
  });
  if (loadStudio) mainWindow.loadURL(backendUrl);
  else mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!capturePath || captureView) mainWindow.show();
  });
  if (capturePath) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (captureView === 'provider') {
          await mainWindow.webContents.executeJavaScript("document.querySelector('#providerCard')?.click()");
          await new Promise((resolve) => setTimeout(resolve, 1200));
        } else if (captureView === 'video-provider') {
          await mainWindow.webContents.executeJavaScript("document.querySelector('#videoProviderCard')?.click(); const select=document.querySelector('#videoProviderPreset'); if(select){select.value='kling-platform'; select.dispatchEvent(new Event('change'));}");
          await new Promise((resolve) => setTimeout(resolve, 1200));
        } else if (captureView === 'professional') {
          await mainWindow.webContents.executeJavaScript("setAppMode('professional')");
          await new Promise((resolve) => setTimeout(resolve, 1200));
        } else if (captureView === 'workflow') {
          await mainWindow.webContents.executeJavaScript("setAppMode('workflow')");
          await new Promise((resolve) => setTimeout(resolve, 1200));
        } else if (captureView === 'optimizer') {
          await mainWindow.webContents.executeJavaScript("setAppMode('basic')");
          await mainWindow.webContents.executeJavaScript("document.querySelector('#optimizerPanel')?.scrollIntoView({block:'center'})");
          await new Promise((resolve) => setTimeout(resolve, 700));
        } else if (captureView === 'history') {
          await mainWindow.webContents.executeJavaScript("document.querySelector('#basicWorkspace')?.classList.remove('hidden'); document.querySelector('#professionalWorkspace')?.classList.add('hidden'); document.querySelector('#workflowWorkspace')?.classList.add('hidden'); document.querySelector('.history-panel')?.scrollIntoView({block:'start'})");
          await new Promise((resolve) => setTimeout(resolve, 1200));
        } else if (captureView === 'scrollfix') {
          await mainWindow.webContents.executeJavaScript("document.querySelector('#basicWorkspace')?.classList.remove('hidden'); document.querySelector('#professionalWorkspace')?.classList.add('hidden'); document.querySelector('#workflowWorkspace')?.classList.add('hidden'); document.querySelector('.controls-panel').scrollTop=document.querySelector('.controls-panel').scrollHeight; document.querySelector('.right-column').scrollTop=0");
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
        const image = await mainWindow.webContents.capturePage();
        await fs.writeFile(capturePath, image.toPNG());
        app.quit();
      }, captureDelay);
    });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('system:inspect', async () => {
  hardwareCache = await detectHardware();
  const pack = await verifyPack(resourceRoot());
  const configPath = path.join(app.getPath('userData'), 'config', 'runtime.json');
  let configured = false;
  try { await fs.access(configPath); configured = true; } catch {}
  return { hardware: hardwareCache, pack, configured, dataRoot: app.getPath('userData') };
});

ipcMain.handle('system:setup', async () => {
  const dataRoot = app.getPath('userData');
  const hardware = hardwareCache || await detectHardware();
  send('setup:progress', { progress: 0.08, label: '正在创建本地工作区…' });
  await ensureDirectories(dataRoot);
  send('setup:progress', { progress: 0.2, label: '正在校验离线模型资源…' });
  const pack = await verifyPack(resourceRoot(), (event) => {
    send('setup:progress', { progress: 0.2 + event.progress * 0.55, label: `正在校验 ${event.detail}` });
  });
  if (!pack.ready) {
    const detail = pack.reason === 'missing_manifest' ? '安装包中未包含模型资源清单' : '模型资源缺失或校验失败';
    throw new Error(`${detail}。请使用完整版离线安装包。`);
  }
  send('setup:progress', { progress: 0.8, label: '正在应用显卡优化配置…' });
  const config = await saveRuntimeConfig(dataRoot, hardware, resourceRoot());
  const runtime = await runBootstrap(resourceRoot(), dataRoot, hardware.selectedProfile.id, (line) => {
    send('setup:log', line.trim());
  });
  if (runtime.skipped && !pack.manifest?.developmentStub) {
    throw new Error('安装包中缺少本地推理运行时，请重新获取完整版安装包。');
  }
  send('setup:progress', { progress: 1, label: '环境准备完成' });
  return { ok: true, config };
});

ipcMain.handle('folder:open', async (_event, kind) => {
  const allowed = { outputs: 'outputs', logs: 'logs' };
  if (!allowed[kind]) return false;
  const target = path.join(app.getPath('userData'), allowed[kind]);
  await fs.mkdir(target, { recursive: true });
  return shell.openPath(target);
});

ipcMain.handle('platform:prepare', async (_event, actionInput, options = {}) => {
  const action = sanitizePlatformAction(actionInput);
  activePlatformAction = action;
  clipboard.writeText(action.prompt);
  await fs.mkdir(platformExchangeDirectory(action.jobId), { recursive: true });
  const watching = await beginPlatformWatch(action, options.openPlatform !== false);
  if (options.openPlatform !== false) await shell.openExternal(action.platformUrl);
  return { ok: true, ...watching, exchangeDir: platformExchangeDirectory(action.jobId) };
});

ipcMain.handle('platform:copy-prompt', (_event, prompt) => {
  clipboard.writeText(String(prompt || '').slice(0, 4000));
  return true;
});

ipcMain.handle('platform:open-site', async (_event, url) => {
  await shell.openExternal(validatePlatformUrl(url));
  return true;
});

ipcMain.handle('platform:open-assets', async (_event, jobId) => {
  const target = platformExchangeDirectory(jobId);
  await fs.mkdir(target, { recursive: true });
  return shell.openPath(target);
});

ipcMain.handle('platform:choose-video', async (_event, actionInput) => {
  const action = sanitizePlatformAction(actionInput || activePlatformAction || {});
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'], title: `接回${action.providerLabel || '平台'}生成的视频`,
    defaultPath: app.getPath('downloads'), buttonLabel: '接回此视频',
    filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'webm'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { imported: false, canceled: true };
  return importPlatformFile(action, result.filePaths[0]);
});

ipcMain.handle('folder:choose-model-pack', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: '选择离线模型资源包' });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('deployment:get', async () => {
  const storageRoot = await loadStorageRoot();
  return { storageRoot, installRoot: path.join(storageRoot, 'ComfyUI-H3') };
});

ipcMain.handle('deployment:choose-root', async () => {
  const current = await loadStorageRoot();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择 H3 模型与运行环境保存位置',
    defaultPath: current,
    buttonLabel: '使用此位置',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const storageRoot = await saveStorageRoot(result.filePaths[0]);
  await restartBackend(true);
  return { storageRoot, installRoot: path.join(storageRoot, 'ComfyUI-H3'), restarted: true };
});

ipcMain.handle('backend:restart', () => restartBackend(false));

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  if (process.platform === 'win32') app.setAppUserModelId('cn.localframe.studio');
  if (!capturePath) createTray();
  let loadStudio = true;
  try { await startBackend(); } catch (error) { console.error(error); loadStudio = false; }
  createWindow(loadStudio);
  startTaskNotificationMonitor();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('second-instance', focusMainWindow);

app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
app.on('before-quit', () => {
  isQuitting = true;
  closePlatformWatcher();
  if (taskNotificationTimer) clearInterval(taskNotificationTimer);
  if (backendRestartTimer) clearTimeout(backendRestartTimer);
  if (backendProcess) backendProcess.kill('SIGTERM');
});
