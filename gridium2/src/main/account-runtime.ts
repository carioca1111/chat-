import { app, BrowserWindow, session, WebContentsView } from 'electron'
import type { Session } from 'electron'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AccountCommand,
  AccountId,
  AccountSnapshot,
  AccountStatus,
  HuntProfileScan,
  PerformanceMode,
  VisualMode
} from '../shared/contracts'
import type { Rect } from './layout'
import { ECO_VISUAL_CSS, resolveVisualMode } from './performance-policy'
import { DEFAULT_ACCOUNT_ZOOM, normalizeAccountZoom } from './zoom'
import { HUNT_PROFILE_SCAN_SCRIPT, parseHuntPageText } from './hunt-scan'

const GAME_URL = 'https://pokeidle.io/app'
const POKEIDLE_ORIGINS = new Set(['https://pokeidle.io', 'https://www.pokeidle.io'])
const HUNT_SCAN_MIN_INTERVAL_MS = 3500

interface AccountSlot {
  id: AccountId
  name: string
  partition: string
  session: Session
  view: WebContentsView
  attached: boolean
  visible: boolean
  status: AccountStatus
  title: string
  desiredVisualMode: VisualMode
  appliedVisualMode: VisualMode
  ecoCssKey: string | null
  visualUpdateRunning: boolean
  zoomPercent: number
  huntProfile: HuntProfileScan | null
  huntScanAt: number
  huntScanPromise: Promise<HuntProfileScan | null> | null
}

export class AccountRuntime {
  private readonly accounts = new Map<AccountId, AccountSlot>()
  private readonly authWindows = new Set<BrowserWindow>()
  private readonly zoomFilePath = join(app.getPath('userData'), 'gridium2-account-zoom.json')
  private zoomWrite: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(
    private readonly window: BrowserWindow,
    private readonly onChanged: () => void
  ) {
    const storedZoom = this.loadZoomSettings()
    for (const id of [1, 2, 3, 4] as AccountId[]) {
      this.createAccount(id, normalizeAccountZoom(storedZoom[id] ?? DEFAULT_ACCOUNT_ZOOM))
    }
  }

  async boot(): Promise<void> {
    await Promise.all([...this.accounts.values()].map((account) => this.loadAccount(account)))
  }

  snapshots(): AccountSnapshot[] {
    return [...this.accounts.values()].map((account) => ({
      id: account.id,
      name: account.name,
      status: account.status,
      url: account.view.webContents.getURL(),
      title: account.title,
      canGoBack: account.view.webContents.navigationHistory.canGoBack(),
      canGoForward: account.view.webContents.navigationHistory.canGoForward(),
      attached: account.attached,
      visualMode: account.desiredVisualMode,
      zoomPercent: account.zoomPercent,
      huntProfile: account.huntProfile ? { ...account.huntProfile } : null
    }))
  }

  applyLayout(
    bounds: Partial<Record<AccountId, Rect>>,
    visible: AccountId[],
    selectedAccount: AccountId,
    performanceMode: PerformanceMode,
    hostActive: boolean
  ): void {
    if (this.disposed) return
    const visibleSet = new Set(visible)

    for (const account of this.accounts.values()) {
      const shouldAttach = visibleSet.has(account.id)
      account.visible = shouldAttach

      if (shouldAttach && !account.attached) {
        this.window.contentView.addChildView(account.view)
        account.attached = true
      } else if (!shouldAttach && account.attached) {
        this.window.contentView.removeChildView(account.view)
        account.attached = false
      }

      const rect = bounds[account.id]
      if (shouldAttach && rect) account.view.setBounds(rect)

      this.requestVisualMode(
        account,
        resolveVisualMode({
          accountId: account.id,
          selectedAccount,
          visible: shouldAttach,
          hostActive,
          performanceMode
        })
      )
    }

    this.onChanged()
  }

  setZoom(accountId: AccountId, zoomPercent: number): void {
    const account = this.accounts.get(accountId)
    if (!account || account.view.webContents.isDestroyed()) return

    const normalized = normalizeAccountZoom(zoomPercent)
    if (account.zoomPercent === normalized) return

    account.zoomPercent = normalized
    account.view.webContents.setZoomFactor(normalized / 100)
    this.persistZoomSettings()
    this.onChanged()
  }

  async scanHuntProfile(accountId: AccountId, force = false): Promise<HuntProfileScan | null> {
    const account = this.accounts.get(accountId)
    if (!account || this.disposed || account.view.webContents.isDestroyed()) return null
    if (account.status !== 'ready') return account.huntProfile

    const now = Date.now()
    if (!force && account.huntProfile && now - account.huntScanAt < HUNT_SCAN_MIN_INTERVAL_MS) {
      return account.huntProfile
    }
    if (account.huntScanPromise) return account.huntScanPromise

    const previousSignature = huntSignature(account.huntProfile)
    account.huntScanAt = now
    account.huntScanPromise = (async () => {
      try {
        const text = await account.view.webContents.executeJavaScript(HUNT_PROFILE_SCAN_SCRIPT, true)
        const scan = parseHuntPageText(String(text || ''))
        if (!scan) return account.huntProfile
        account.huntProfile = scan
        if (huntSignature(scan) !== previousSignature) this.onChanged()
        return scan
      } catch {
        return account.huntProfile
      } finally {
        account.huntScanPromise = null
      }
    })()

    return account.huntScanPromise
  }

  async refreshHuntProfiles(): Promise<void> {
    for (const id of [1, 2, 3, 4] as AccountId[]) {
      if (this.disposed) return
      await this.scanHuntProfile(id, false)
      await delay(60)
    }
  }

  async command(accountId: AccountId, command: AccountCommand): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account || account.view.webContents.isDestroyed()) return

    const wc = account.view.webContents
    switch (command) {
      case 'home':
        await wc.loadURL(GAME_URL)
        break
      case 'reload':
        wc.reload()
        break
      case 'back':
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
        break
      case 'forward':
        if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
        break
    }
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true

    for (const auth of this.authWindows) {
      if (!auth.isDestroyed()) auth.close()
    }
    this.authWindows.clear()

    for (const account of this.accounts.values()) {
      account.huntScanPromise = null
      if (account.attached) {
        try {
          this.window.contentView.removeChildView(account.view)
        } catch {
          // Window may already be tearing down.
        }
      }
      if (!account.view.webContents.isDestroyed()) account.view.webContents.close()
    }
    this.accounts.clear()
  }

  private createAccount(id: AccountId, zoomPercent: number): void {
    const partition = `persist:gridium2-account-${id}`
    const accountSession = session.fromPartition(partition)

    const view = new WebContentsView({
      webPreferences: {
        session: accountSession,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: true
      }
    })

    view.setBackgroundColor('#0b0d18')
    view.webContents.setZoomFactor(zoomPercent / 100)

    const account: AccountSlot = {
      id,
      name: `Conta ${id}`,
      partition,
      session: accountSession,
      view,
      attached: false,
      visible: false,
      status: 'booting',
      title: 'PokeIdle.io',
      desiredVisualMode: 'eco',
      appliedVisualMode: 'full',
      ecoCssKey: null,
      visualUpdateRunning: false,
      zoomPercent,
      huntProfile: null,
      huntScanAt: 0,
      huntScanPromise: null
    }

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (!this.isAllowedPopupUrl(url)) return { action: 'deny' }
      return { action: 'allow', overrideBrowserWindowOptions: this.authWindowOptions(account) }
    })
    view.webContents.on('did-create-window', (childWindow) => this.trackAuthWindow(account, childWindow))

    view.webContents.on('did-start-loading', () => {
      this.clearInjectedVisualStyle(account)
      account.huntProfile = null
      account.huntScanAt = 0
      this.patchAccount(account, { status: 'loading' })
    })
    view.webContents.on('did-stop-loading', () => {
      if (!view.webContents.isDestroyed()) view.webContents.setZoomFactor(account.zoomPercent / 100)
      this.patchAccount(account, { status: 'ready' })
      this.requestVisualMode(account, account.desiredVisualMode)
    })
    view.webContents.on('did-fail-load', (_event, code) => {
      if (code !== -3) this.patchAccount(account, { status: 'offline' })
    })
    view.webContents.on('page-title-updated', (_event, title) => this.patchAccount(account, { title }))
    view.webContents.on('render-process-gone', () => this.patchAccount(account, { status: 'crashed' }))
    view.webContents.on('did-navigate', () => this.onChanged())
    view.webContents.on('did-navigate-in-page', () => this.onChanged())

    this.accounts.set(id, account)
  }

  private async loadAccount(account: AccountSlot): Promise<void> {
    try {
      await account.view.webContents.loadURL(GAME_URL)
      account.view.webContents.setZoomFactor(account.zoomPercent / 100)
      this.patchAccount(account, { status: 'ready' })
    } catch {
      this.patchAccount(account, { status: 'offline' })
    }
  }

  private patchAccount(account: AccountSlot, patch: Partial<Pick<AccountSlot, 'status' | 'title'>>): void {
    Object.assign(account, patch)
    this.onChanged()
  }

  private requestVisualMode(account: AccountSlot, mode: VisualMode): void {
    account.desiredVisualMode = mode
    void this.reconcileVisualMode(account)
  }

  private async reconcileVisualMode(account: AccountSlot): Promise<void> {
    if (account.visualUpdateRunning || this.disposed || account.view.webContents.isDestroyed()) return
    account.visualUpdateRunning = true

    try {
      const wc = account.view.webContents
      while (!this.disposed && !wc.isDestroyed() && account.appliedVisualMode !== account.desiredVisualMode) {
        const target = account.desiredVisualMode
        if (account.ecoCssKey) {
          const key = account.ecoCssKey
          account.ecoCssKey = null
          try { await wc.removeInsertedCSS(key) } catch { /* navigation discarded it */ }
        }
        if (target === 'eco') {
          try {
            const key = await wc.insertCSS(ECO_VISUAL_CSS, { cssOrigin: 'user' })
            if (this.disposed || wc.isDestroyed()) return
            account.ecoCssKey = key
          } catch { /* cosmetic optimization only */ }
        }
        account.appliedVisualMode = target
      }
    } finally {
      account.visualUpdateRunning = false
      if (!this.disposed && !account.view.webContents.isDestroyed() && account.appliedVisualMode !== account.desiredVisualMode) {
        void this.reconcileVisualMode(account)
      }
    }
  }

  private clearInjectedVisualStyle(account: AccountSlot): void {
    const wc = account.view.webContents
    const key = account.ecoCssKey
    account.ecoCssKey = null
    account.appliedVisualMode = 'full'
    if (key && !wc.isDestroyed()) void wc.removeInsertedCSS(key).catch(() => undefined)
  }

  private loadZoomSettings(): Partial<Record<AccountId, number>> {
    try {
      const parsed = JSON.parse(readFileSync(this.zoomFilePath, 'utf8')) as Record<string, unknown>
      const result: Partial<Record<AccountId, number>> = {}
      for (const id of [1, 2, 3, 4] as AccountId[]) {
        const value = parsed[String(id)]
        if (typeof value === 'number') result[id] = normalizeAccountZoom(value)
      }
      return result
    } catch { return {} }
  }

  private persistZoomSettings(): void {
    const payload = JSON.stringify(Object.fromEntries([...this.accounts.values()].map((account) => [String(account.id), account.zoomPercent])), null, 2)
    this.zoomWrite = this.zoomWrite.catch(() => undefined).then(() => writeFile(this.zoomFilePath, payload, 'utf8')).catch(() => undefined)
  }

  private authWindowOptions(account: AccountSlot): Electron.BrowserWindowConstructorOptions {
    return {
      parent: this.window, width: 600, height: 780, minWidth: 460, minHeight: 640, autoHideMenuBar: true,
      backgroundColor: '#0b0d18',
      webPreferences: { session: account.session, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true }
    }
  }

  private trackAuthWindow(account: AccountSlot, auth: BrowserWindow): void {
    if (this.disposed || auth.isDestroyed()) { if (!auth.isDestroyed()) auth.close(); return }
    this.authWindows.add(auth)
    let visitedExternalProvider = false
    const observeNavigation = (_event: Electron.Event, nextUrl: string): void => {
      if (!nextUrl || nextUrl === 'about:blank') return
      if (this.isPokeIdleUrl(nextUrl)) {
        if (!visitedExternalProvider) return
        setTimeout(() => {
          if (!auth.isDestroyed()) auth.close()
          if (!account.view.webContents.isDestroyed()) account.view.webContents.reload()
        }, 450)
        return
      }
      visitedExternalProvider = true
    }
    auth.webContents.on('did-navigate', observeNavigation)
    auth.webContents.on('did-redirect-navigation', observeNavigation)
    auth.webContents.setWindowOpenHandler(({ url }) => {
      if (!this.isAllowedPopupUrl(url)) return { action: 'deny' }
      return { action: 'allow', overrideBrowserWindowOptions: this.authWindowOptions(account) }
    })
    auth.webContents.on('did-create-window', (nestedWindow) => this.trackAuthWindow(account, nestedWindow))
    auth.on('closed', () => {
      this.authWindows.delete(auth)
      if (!this.disposed && !account.view.webContents.isDestroyed()) account.view.webContents.focus()
    })
  }

  private isAllowedPopupUrl(url: string): boolean {
    if (url === 'about:blank') return true
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'https:' || parsed.protocol === 'http:'
    } catch { return false }
  }

  private isPokeIdleUrl(url: string): boolean {
    try { return POKEIDLE_ORIGINS.has(new URL(url).origin) } catch { return false }
  }
}

function huntSignature(scan: HuntProfileScan | null): string {
  if (!scan) return ''
  return JSON.stringify([
    scan.trainerLevel ?? null,
    scan.speciesName ?? null,
    scan.pokemonLevel ?? null,
    scan.quality ?? null,
    scan.potency ?? null,
    scan.ivTotal ?? null,
    scan.ivAverage ?? null,
    scan.shiny ?? null
  ])
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
