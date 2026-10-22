import { contextBridge, ipcRenderer } from 'electron'
import type {
  AccountCommand,
  AccountId,
  AccountPowerMode,
  AppModule,
  AutoMarketMode,
  AutoMarketRule,
  GridiumApi,
  GridiumSnapshot,
  LayoutMode,
  PanelRmtSaleInput,
  PerformanceMode,
  PowerAutomationKey,
  SentinelSettingsInput,
  WhatsAppSettingsInput
} from '../shared/contracts'

const api: GridiumApi = {
  getSnapshot: () => ipcRenderer.invoke('gridium2:get-snapshot'),
  setLayout: (layout: LayoutMode) => ipcRenderer.invoke('gridium2:set-layout', layout),
  setPerformanceMode: (mode: PerformanceMode) => ipcRenderer.invoke('gridium2:set-performance-mode', mode),
  setModule: (module: AppModule) => ipcRenderer.invoke('gridium2:set-module', module),
  setKeepDisplayAwake: (enabled: boolean) => ipcRenderer.invoke('gridium2:set-keep-display-awake', enabled),
  setAccountZoom: (accountId: AccountId, zoomPercent: number) => ipcRenderer.invoke('gridium2:set-account-zoom', accountId, zoomPercent),
  setAccountPowerMode: (accountId: AccountId, mode: AccountPowerMode) => ipcRenderer.invoke('gridium2:set-account-power-mode', accountId, mode),
  setAllAccountsPowerMode: (mode: AccountPowerMode) => ipcRenderer.invoke('gridium2:set-all-account-power-mode', mode),
  setPowerAutomation: (key: PowerAutomationKey, enabled: boolean) => ipcRenderer.invoke('gridium2:set-power-automation', key, enabled),
  setAutoMarketMode: (mode: AutoMarketMode) => ipcRenderer.invoke('gridium2:set-automarket-mode', mode),
  setAutoMarketRule: (accountId: AccountId, rule: AutoMarketRule) => ipcRenderer.invoke('gridium2:set-automarket-rule', accountId, rule),
  addPanelRmtSale: (accountId: AccountId, sale: PanelRmtSaleInput) => ipcRenderer.invoke('gridium2:add-panel-rmt-sale', accountId, sale),
  scanHuntProfile: (accountId: AccountId) => ipcRenderer.invoke('gridium2:scan-hunt-profile', accountId),
  selectAccount: (accountId: AccountId) => ipcRenderer.invoke('gridium2:select-account', accountId),
  accountCommand: (accountId: AccountId, command: AccountCommand) => ipcRenderer.invoke('gridium2:account-command', accountId, command),
  checkForUpdates: () => ipcRenderer.invoke('gridium2:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('gridium2:download-update'),
  installUpdate: () => ipcRenderer.invoke('gridium2:install-update'),
  saveWhatsAppSettings: (settings: WhatsAppSettingsInput) => ipcRenderer.invoke('gridium2:whatsapp-save-settings', settings),
  sendWhatsAppTest: () => ipcRenderer.invoke('gridium2:whatsapp-test'),
  sendWhatsAppReportNow: () => ipcRenderer.invoke('gridium2:whatsapp-report-now'),
  saveSentinelSettings: (settings: SentinelSettingsInput) => ipcRenderer.invoke('gridium2:sentinel-save-settings', settings),
  recoverAccountNow: (accountId: AccountId) => ipcRenderer.invoke('gridium2:sentinel-recover-now', accountId),
  onSnapshot: (callback: (snapshot: GridiumSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: GridiumSnapshot): void => callback(snapshot)
    ipcRenderer.on('gridium2:snapshot', listener)
    return () => ipcRenderer.removeListener('gridium2:snapshot', listener)
  }
}

contextBridge.exposeInMainWorld('gridium2', api)