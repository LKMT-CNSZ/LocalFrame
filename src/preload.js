'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localFrame', {
  inspect: () => ipcRenderer.invoke('system:inspect'),
  setup: () => ipcRenderer.invoke('system:setup'),
  openFolder: (kind) => ipcRenderer.invoke('folder:open', kind),
  chooseModelPack: () => ipcRenderer.invoke('folder:choose-model-pack'),
  getDeployment: () => ipcRenderer.invoke('deployment:get'),
  chooseInstallRoot: () => ipcRenderer.invoke('deployment:choose-root'),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  preparePlatformHandoff: (action, options) => ipcRenderer.invoke('platform:prepare', action, options),
  copyPlatformPrompt: (prompt) => ipcRenderer.invoke('platform:copy-prompt', prompt),
  openPlatformSite: (url) => ipcRenderer.invoke('platform:open-site', url),
  openPlatformAssets: (jobId) => ipcRenderer.invoke('platform:open-assets', jobId),
  choosePlatformVideo: (action) => ipcRenderer.invoke('platform:choose-video', action),
  onPlatformImported: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('platform:imported', listener);
    return () => ipcRenderer.removeListener('platform:imported', listener);
  },
  onSetupProgress: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('setup:progress', listener);
    return () => ipcRenderer.removeListener('setup:progress', listener);
  }
});
