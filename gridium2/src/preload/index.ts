import { contextBridge, ipcRenderer } from 'electron'
import type {
  AccountCommand,
  AccountId,
  GridiumApi,
  GridiumSnapshot,
  LayoutMode,
  PerformanceMode
} from '../shared/contracts'

const api: GridiumApi = {
  getSnapshot: () => ipcRenderer.invoke('gridium2:get-snapshot'),
  setLayout: (layout: LayoutMode) => ipcRenderer.invoke('gridium2:set-layout', layout),
  setPerformanceMode: (mode: PerformanceMode) => ipcRenderer.invoke('gridium2:set-performance-mode', mode),
  selectAccount: (accountId: AccountId) => ipcRenderer.invoke('gridium2:select-account', accountId),
  accountCommand: (accountId: AccountId, command: AccountCommand) =>
    ipcRenderer.invoke('gridium2:account-command', accountId, command),
  onSnapshot: (callback: (snapshot: GridiumSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: GridiumSnapshot): void => callback(snapshot)
    ipcRenderer.on('gridium2:snapshot', listener)
    return () => ipcRenderer.removeListener('gridium2:snapshot', listener)
  }
}

contextBridge.exposeInMainWorld('gridium2', api)
