'use strict';

const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = 7872;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'localframe-voice-preview-'));
let backend;

// The capture helper runs headlessly and does not need Chromium's GPU process.
// Software rendering also makes screenshots deterministic on machines where
// the packaged DirectX helper DLLs are unavailable.
app.disableHardwareAcceleration();

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const response = await fetch(`http://127.0.0.1:${port}/api/voice`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('preview backend did not start');
}

app.whenReady().then(async () => {
  backend = spawn(process.execPath, [path.join(root, 'resources', 'h3-studio', 'app', 'server.js')], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      H3_STUDIO_PORT: String(port),
      H3_DATA_DIR: path.join(temp, 'data'),
      H3_OUTPUT_DIR: path.join(temp, 'output'),
      H3_STORAGE_ROOT: 'D:\\AI',
      H3_ROOT_DIR: 'D:\\AI\\MiniMax-H3',
      H3_INSTALLER: path.join(root, 'resources', 'h3-studio', 'install-h3-int8.ps1'),
      LOCALFRAME_VOICE_INSTALLER: path.join(root, 'resources', 'h3-studio', 'install-cosyvoice.ps1'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForServer();
    const win = new BrowserWindow({ width: 1600, height: 1000, show: false, backgroundColor: '#080a0e' });
    await win.loadURL(`http://127.0.0.1:${port}/`);
    await win.webContents.executeJavaScript(`
      setAppMode('workflow');
      document.getElementById('workflowTitle').value = 'LocalFrame 宣传片';
      document.getElementById('workflowIdea').value = '展示从创意、分镜、多声线配音到本地成片的一体化流程。';
      document.getElementById('workflowVoiceStatus').textContent = 'CosyVoice 已安装 · 使用时自动启动';
      document.getElementById('workflowVoiceProfile').value = 'female_narrator';
      window.scrollTo(0, 0);
    `);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(root, 'voice-feature-preview.png'), image.toPNG());
    win.destroy();
  } finally {
    try { backend?.kill(); } catch {}
    fs.rmSync(temp, { recursive: true, force: true });
    app.quit();
  }
}).catch((error) => { console.error(error.stack || error.message); app.exit(1); });
