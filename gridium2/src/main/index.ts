import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type {
  AccountCommand,
  AccountId,
  AccountPowerMode,
  AppModule,
  GridiumSnapshot,
  LayoutMode,
  MobileSyncSettingsInput,
  PanelRmtSaleInput,
  PerformanceMode,
  PowerAutomationKey,
  SentinelSettingsInput,
  WhatsAppSettingsInput
} from '../shared/contracts'
import { AccountRuntime } from './account-runtime'
import { GridiumAppUpdater } from './app-updater'
import { DisplayPowerController } from './display-power'
import { computeLayout } from './layout'
import { setMobileHuntSummary } from './mobile-hunt-cache'
import { MobileSyncRuntime } from './mobile-sync'
import { searchPokemonRoster } from './pokemon-roster-access'
import { DEFAULT_POWER_AUTOMATION } from './power-policy'
import { SentinelRuntime } from './sentinel-runtime'
import { TelemetryService } from './telemetry'
import { WhatsAppReporter } from './whatsapp-reporter'

let mainWindow: BrowserWindow | null = null
let accounts: AccountRuntime | null = null
let telemetry: TelemetryService | null = null
let displayPower: DisplayPowerController | null = null
let updater: GridiumAppUpdater | null = null
let whatsapp: WhatsAppReporter | null = null
let sentinel: SentinelRuntime | null = null
let mobileSync: MobileSyncRuntime | null = null
let layout: LayoutMode = 4
let selectedAccount: AccountId = 1
let performanceMode: PerformanceMode = 'auto'
let publishTimer: ReturnType<typeof setTimeout> | null = null
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
    telemetry: telemetry?.getSnapshot() ?? {
      cpuPercent: 0,
      memoryMB: 0,
      mainEventLoopMeanMs: 0,
      mainEventLoopMaxMs: 0,
      processCount: 0,
      capturedAt: Date.now()
    },
    updater: updater?.snapshot() ?? {
      currentVersion: app.getVersion(),
      status: 'idle',
      progress: 0,
      message: 'Atualizador iniciando…'
    },
    whatsapp: whatsapp?.snapshot(),
    sentinel: sentinel?.snapshot(),
    mobileSync: mobileSync?.snapshot()
  }
}

function publish(): void {
  if (publishTimer) return
  publishTimer = setTimeout(() => { publishTimer = null; publishNow() }, 100)
}

function publishNow(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  const snapshot = currentSnapshot()
  whatsapp?.observe(snapshot.accounts)
  mainWindow.webContents.send('gridium2:snapshot', snapshot)
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

function lastServerAt(accountId: AccountId): number {
  return accounts?.lastServerAt(accountId) ?? 0
}

async function recoverAccount(accountId: AccountId): Promise<boolean> {
  const runtime = accounts
  if (!runtime || !runtime.snapshots().some((account) => account.id === accountId)) return false
  try {
    await runtime.command(accountId, 'reload')
    return true
  } catch {
    return false
  }
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
    if (!['accounts', 'hunt', 'worth', 'panel', 'settings'].includes(next)) return
    activeModule = next
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
  ipcMain.handle('gridium2:search-pokemon-roster', (_event, id: AccountId, query = '') => {
    if (![1,2,3,4].includes(id)) return []
    return searchPokemonRoster(accounts, id, String(query || '').slice(0, 80))
  })
  ipcMain.handle('gridium2:select-account', (_event, id: AccountId) => {
    if (![1, 2, 3, 4].includes(id)) return
    selectedAccount = id; applyLayout(); publish()
  })
  ipcMain.handle('gridium2:account-command', async (_event, id: AccountId, command: AccountCommand) => {
    if (![1, 2, 3, 4].includes(id) || !['home', 'reload', 'back', 'forward'].includes(command)) return
    await accounts?.command(id, command); publish()
  })
  ipcMain.handle('gridium2:check-for-updates', async () => await updater?.check(false) ?? currentSnapshot().updater)
  ipcMain.handle('gridium2:download-update', async () => await updater?.download() ?? currentSnapshot().updater)
  ipcMain.handle('gridium2:install-update', async () => await updater?.installAndRestart() ?? false)
  ipcMain.handle('gridium2:whatsapp-save-settings', (_event, settings: WhatsAppSettingsInput) => whatsapp?.updateSettings(settings) ?? currentSnapshot().whatsapp)
  ipcMain.handle('gridium2:whatsapp-test', async () => await whatsapp?.sendTest() ?? currentSnapshot().whatsapp)
  ipcMain.handle('gridium2:whatsapp-report-now', async () => await whatsapp?.sendReportNow() ?? currentSnapshot().whatsapp)
  ipcMain.handle('gridium2:sentinel-save-settings', (_event, settings: SentinelSettingsInput) => sentinel?.updateSettings(settings) ?? currentSnapshot().sentinel)
  ipcMain.handle('gridium2:sentinel-recover-now', async (_event, id: AccountId) => {
    if (![1,2,3,4].includes(id)) return false
    return await sentinel?.recoverNow(id) ?? false
  })
  ipcMain.handle('gridium2:mobile-save-settings', (_event, settings: MobileSyncSettingsInput) => mobileSync?.updateSettings(settings) ?? currentSnapshot().mobileSync)
  ipcMain.handle('gridium2:mobile-create-pair-code', async () => await mobileSync?.createPairCode() ?? currentSnapshot().mobileSync)
  ipcMain.handle('gridium2:mobile-hunt-summary', (_event, id: AccountId, summary: unknown) => {
    if (![1,2,3,4].includes(id)) return
    setMobileHuntSummary(id, summary)
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
    title: 'Gridium 2 — Alpha 1.3.17 Reload Loop Hotfix',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  accounts = new AccountRuntime(mainWindow, publish)
  telemetry = new TelemetryService(publish, () => ({ accounts: accounts?.diagnostics(), sentinel: sentinel?.diagnostics(), mobile: mobileSync?.diagnostics() }))
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
  updater = new GridiumAppUpdater(publish)
  whatsapp = new WhatsAppReporter(() => accounts?.snapshots() ?? [], publish)
  sentinel = new SentinelRuntime({
    accountsProvider: () => accounts?.snapshots() ?? [],
    lastServerAtProvider: lastServerAt,
    recoverAccount,
    onChanged: publish
  })
  mobileSync = new MobileSyncRuntime(currentSnapshot, publish)
  registerIpc()
  await createWindow()
  whatsapp.start()
  sentinel.start()
  mobileSync.start()
  if (app.isPackaged) setTimeout(() => void updater?.check(true), 6_000)
  app.on('activate', async () => { if (BrowserWindow.getAllWindows().length === 0) await createWindow() })
})
app.on('before-quit', () => {
  if (publishTimer) clearTimeout(publishTimer)
  publishTimer = null
  telemetry?.stop()
  whatsapp?.stop()
  sentinel?.stop()
  mobileSync?.stop()
  accounts?.destroy()
  displayPower?.destroy()
  displayPower = null
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
