import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type {
  AccountCommand,
  AccountId,
  AccountPowerMode,
  AppModule,
  AutoMarketMode,
  AutoMarketRule,
  GridiumSnapshot,
  LayoutMode,
  PanelRmtSaleInput,
  PerformanceMode,
  PowerAutomationKey
} from '../shared/contracts'
import { AccountRuntime } from './account-runtime'
import { DisplayPowerController } from './display-power'
import { computeLayout } from './layout'
import { DEFAULT_POWER_AUTOMATION } from './power-policy'
import { TelemetryService } from './telemetry'

let mainWindow: BrowserWindow | null = null
let accounts: AccountRuntime | null = null
let telemetry: TelemetryService | null = null
let displayPower: DisplayPowerController | null = null
let layout: LayoutMode = 4
let selectedAccount: AccountId = 1
let performanceMode: PerformanceMode = 'auto'
let activeModule: AppModule = 'accounts'

function currentSnapshot(): GridiumSnapshot {
  return {
    layout,
    selectedAccount,
    performanceMode,
    activeModule,
    keepDisplayAwake: displayPower?.isEnabled() ?? true,
    powerAutomation: accounts?.getPowerAutomation() ?? { ...DEFAULT_POWER_AUTOMATION },
    accounts: accounts?.snapshots() ?? [],
    autoMarket: accounts?.autoMarketSnapshot() ?? { mode: 'observe', uiActive: false, accounts: [], catalog: [], lastTickAt: 0 },
    telemetry: telemetry?.getSnapshot() ?? {
      cpuPercent: 0,
      memoryMB: 0,
      mainEventLoopMeanMs: 0,
      mainEventLoopMaxMs: 0,
      processCount: 0,
      capturedAt: Date.now()
    }
  }
}

function publish(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('gridium2:snapshot', currentSnapshot())
}

function hostIsActive(): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused())
}

function hostIsMinimized(): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized())
}

function applyLayout(): void {
  if (!mainWindow || !accounts) return
  if (activeModule !== 'accounts') {
    accounts.applyLayout({}, [], selectedAccount, performanceMode, false, hostIsMinimized())
    return
  }
  const [width, height] = mainWindow.getContentSize()
  const result = computeLayout({ width, height }, layout, selectedAccount)
  accounts.applyLayout(result.bounds, result.visible, selectedAccount, performanceMode, hostIsActive(), hostIsMinimized())
}

function registerIpc(): void {
  ipcMain.handle('gridium2:get-snapshot', () => currentSnapshot())
  ipcMain.handle('gridium2:set-layout', (_event, next: LayoutMode) => {
    if (![1, 2, 4].includes(next)) return
    layout = next; applyLayout(); publish()
  })
  ipcMain.handle('gridium2:set-performance-mode', (_event, next: PerformanceMode) => {
    if (!['auto', 'full'].includes(next)) return
    performanceMode = next; applyLayout(); publish()
  })
  ipcMain.handle('gridium2:set-module', (_event, next: AppModule) => {
    if (!['accounts', 'hunt', 'automarket', 'panel', 'settings'].includes(next)) return
    activeModule = next
    accounts?.setAutoMarketUiActive(next === 'automarket')
    applyLayout(); publish()
  })
  ipcMain.handle('gridium2:set-keep-display-awake', (_event, enabled: boolean) => {
    if (typeof enabled !== 'boolean') return
    displayPower?.setEnabled(enabled)
    publish()
  })
  ipcMain.handle('gridium2:set-account-zoom', (_event, id: AccountId, zoomPercent: number) => {
    if (![1, 2, 3, 4].includes(id) || !Number.isFinite(zoomPercent)) return
    accounts?.setZoom(id, zoomPercent); publish()
  })
  ipcMain.handle('gridium2:set-account-power-mode', (_event, id: AccountId, mode: AccountPowerMode) => {
    if (![1, 2, 3, 4].includes(id) || !['auto', 'on', 'black', 'suspended'].includes(mode)) return
    accounts?.setPowerMode(id, mode); applyLayout(); publish()
  })
  ipcMain.handle('gridium2:set-all-account-power-mode', (_event, mode: AccountPowerMode) => {
    if (!['auto', 'on', 'black', 'suspended'].includes(mode)) return
    accounts?.setAllPowerModes(mode); applyLayout(); publish()
  })
  ipcMain.handle('gridium2:set-power-automation', (_event, key: PowerAutomationKey, enabled: boolean) => {
    if (!['blackUnfocused', 'blackWhenMinimized', 'wakeOnSelect'].includes(key) || typeof enabled !== 'boolean') return
    accounts?.setPowerAutomation(key, enabled); applyLayout(); publish()
  })
  ipcMain.handle('gridium2:set-automarket-mode', (_event, mode: AutoMarketMode) => {
    if (!['observe','auto'].includes(mode)) return
    accounts?.setAutoMarketMode(mode); publish()
  })
  ipcMain.handle('gridium2:set-automarket-rule', (_event, id: AccountId, rule: AutoMarketRule) => {
    if (![1,2,3,4].includes(id) || !rule || typeof rule !== 'object') return
    accounts?.setAutoMarketRule(id, rule); publish()
  })
  ipcMain.handle('gridium2:add-panel-rmt-sale', (_event, id: AccountId, sale: PanelRmtSaleInput) => {
    if (![1,2,3,4].includes(id) || !sale || typeof sale !== 'object') return false
    const amount = Number(sale.amountBrl)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return false
    const ok = accounts?.addPanelRmtSale(id, { amountBrl: amount, description: String(sale.description || '').slice(0,80) }) ?? false
    if (ok) publish()
    return ok
  })
  ipcMain.handle('gridium2:scan-hunt-profile', async (_event, id: AccountId) => {
    if (![1, 2, 3, 4].includes(id)) return null
    return await accounts?.scanHuntProfile(id) ?? null
  })
  ipcMain.handle('gridium2:select-account', (_event, id: AccountId) => {
    if (![1, 2, 3, 4].includes(id)) return
    selectedAccount = id; applyLayout(); publish()
  })
  ipcMain.handle('gridium2:account-command', async (_event, id: AccountId, command: AccountCommand) => {
    if (![1, 2, 3, 4].includes(id) || !['home', 'reload', 'back', 'forward'].includes(command)) return
    await accounts?.command(id, command); publish()
  })
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#a65745',
    title: 'Gridium 2 — Alpha 0.8.2 Panel Cleanup',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  accounts = new AccountRuntime(mainWindow, publish)
  accounts.setAutoMarketUiActive(activeModule === 'automarket')
  telemetry = new TelemetryService(publish)
  telemetry.start()

  mainWindow.on('resize', applyLayout)
  mainWindow.on('maximize', applyLayout)
  mainWindow.on('unmaximize', applyLayout)
  mainWindow.on('focus', applyLayout)
  mainWindow.on('blur', applyLayout)
  mainWindow.on('minimize', applyLayout)
  mainWindow.on('restore', applyLayout)
  mainWindow.on('show', applyLayout)
  mainWindow.on('hide', applyLayout)
  mainWindow.on('closed', () => {
    telemetry?.stop(); telemetry = null
    accounts?.destroy(); accounts = null
    mainWindow = null
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))

  mainWindow.once('ready-to-show', () => { mainWindow?.show(); applyLayout(); publish() })
  void accounts.boot().finally(() => { applyLayout(); publish() })
}

app.whenReady().then(async () => {
  displayPower = new DisplayPowerController()
  displayPower.start()
  registerIpc()
  await createWindow()
  app.on('activate', async () => { if (BrowserWindow.getAllWindows().length === 0) await createWindow() })
})
app.on('before-quit', () => {
  telemetry?.stop()
  accounts?.destroy()
  displayPower?.destroy()
  displayPower = null
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
