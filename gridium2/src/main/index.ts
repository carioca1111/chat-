import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type {
  AccountCommand,
  AccountId,
  GridiumSnapshot,
  LayoutMode,
  PerformanceMode
} from '../shared/contracts'
import { AccountRuntime } from './account-runtime'
import { computeLayout } from './layout'
import { TelemetryService } from './telemetry'

let mainWindow: BrowserWindow | null = null
let accounts: AccountRuntime | null = null
let telemetry: TelemetryService | null = null
let layout: LayoutMode = 4
let selectedAccount: AccountId = 1
let performanceMode: PerformanceMode = 'auto'

function currentSnapshot(): GridiumSnapshot {
  return {
    layout,
    selectedAccount,
    performanceMode,
    accounts: accounts?.snapshots() ?? [],
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
  return Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized() &&
      mainWindow.isFocused()
  )
}

function applyLayout(): void {
  if (!mainWindow || !accounts) return
  const [width, height] = mainWindow.getContentSize()
  const result = computeLayout({ width, height }, layout, selectedAccount)
  accounts.applyLayout(result.bounds, result.visible, selectedAccount, performanceMode, hostIsActive())
}

function registerIpc(): void {
  ipcMain.handle('gridium2:get-snapshot', () => currentSnapshot())
  ipcMain.handle('gridium2:set-layout', (_event, next: LayoutMode) => {
    if (![1, 2, 4].includes(next)) return
    layout = next
    applyLayout()
    publish()
  })
  ipcMain.handle('gridium2:set-performance-mode', (_event, next: PerformanceMode) => {
    if (!['auto', 'full'].includes(next)) return
    performanceMode = next
    applyLayout()
    publish()
  })
  ipcMain.handle('gridium2:set-account-zoom', (_event, id: AccountId, zoomPercent: number) => {
    if (![1, 2, 3, 4].includes(id)) return
    if (!Number.isFinite(zoomPercent)) return
    accounts?.setZoom(id, zoomPercent)
    publish()
  })
  ipcMain.handle('gridium2:select-account', (_event, id: AccountId) => {
    if (![1, 2, 3, 4].includes(id)) return
    selectedAccount = id
    applyLayout()
    publish()
  })
  ipcMain.handle('gridium2:account-command', async (_event, id: AccountId, command: AccountCommand) => {
    if (![1, 2, 3, 4].includes(id)) return
    if (!['home', 'reload', 'back', 'forward'].includes(command)) return
    await accounts?.command(id, command)
    publish()
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
    title: 'Gridium 2 — Alpha 0.2.1 Individual Zoom',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  accounts = new AccountRuntime(mainWindow, publish)
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
    telemetry?.stop()
    telemetry = null
    accounts?.destroy()
    accounts = null
    mainWindow = null
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    applyLayout()
    publish()
  })

  void accounts.boot().finally(() => {
    applyLayout()
    publish()
  })
}

app.whenReady().then(async () => {
  registerIpc()
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow()
  })
})

app.on('before-quit', () => {
  telemetry?.stop()
  accounts?.destroy()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
