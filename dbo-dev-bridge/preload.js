const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridgeApi', {
  getState: () => ipcRenderer.invoke('state'),
  saveSettings: patch => ipcRenderer.invoke('save-settings', patch),
  pickServer: () => ipcRenderer.invoke('pick-server'),
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  connectRelay: () => ipcRenderer.invoke('connect-relay'),
  disconnectRelay: () => ipcRenderer.invoke('disconnect-relay'),
  copy: text => ipcRenderer.invoke('copy', text),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  onState: cb => ipcRenderer.on('state', (_e, state) => cb(state)),
  onLog: cb => ipcRenderer.on('log-line', (_e, line) => cb(line))
});
