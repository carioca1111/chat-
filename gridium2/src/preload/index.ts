import { contextBridge, ipcRenderer } from 'electron'
import type {
  AccountCommand,
  AccountId,
  AccountPowerMode,
  AppModule,
  GridiumApi,
  GridiumSnapshot,
  LayoutMode,
  PerformanceMode,
  PowerAutomationKey
} from '../shared/contracts'

const api: GridiumApi = {
  getSnapshot: () => ipcRenderer.invoke('gridium2:get-snapshot'),
  setLayout: (layout: LayoutMode) => ipcRenderer.invoke('gridium2:set-layout', layout),
  setPerformanceMode: (mode: PerformanceMode) => ipcRenderer.invoke('gridium2:set-performance-mode', mode),
  setModule: (module: AppModule) => ipcRenderer.invoke('gridium2:set-module', module),
  setAccountZoom: (accountId: AccountId, zoomPercent: number) =>
    ipcRenderer.invoke('gridium2:set-account-zoom', accountId, zoomPercent),
  setAccountPowerMode: (accountId: AccountId, mode: AccountPowerMode) =>
    ipcRenderer.invoke('gridium2:set-account-power-mode', accountId, mode),
  setAllAccountsPowerMode: (mode: AccountPowerMode) =>
    ipcRenderer.invoke('gridium2:set-all-account-power-mode', mode),
  setPowerAutomation: (key: PowerAutomationKey, enabled: boolean) =>
    ipcRenderer.invoke('gridium2:set-power-automation', key, enabled),
  scanHuntProfile: (accountId: AccountId) => ipcRenderer.invoke('gridium2:scan-hunt-profile', accountId),
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
