import { CoalescedWriter } from './coalesced-writer'
import { app, BrowserWindow, session, WebContentsView } from 'electron'
import type { Session } from 'electron'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AccountCommand,
  AccountId,
  AccountPowerMode,
  AccountSnapshot,
  AccountStatus,
  EffectivePowerState,
  HuntProfileScan,
  HuntProtocolStatus,
  PanelRmtSaleInput,
  PerformanceMode,
  PowerAutomationKey,
  PowerAutomationSettings,
  VisualMode
} from '../shared/contracts'
import { HuntSessionRuntime } from './hunt-session-runtime'
import type { Rect } from './layout'
import type { PanelAnalyticsPersistedState } from './panel-analytics-runtime'
import { ECO_VISUAL_CSS, resolveVisualMode } from './performance-policy'
import { DEFAULT_POWER_AUTOMATION, resolveAccountPowerState } from './power-policy'
import { PokeIdleServerState } from './pokeidle-server-state'
import { POKEIDLE_UI_SUPPLY_SCAN_SCRIPT, type UiSupplyRow } from './pokeidle-ui-supply-scan'
import { DEFAULT_ACCOUNT_ZOOM, normalizeAccountZoom } from './zoom'

const GAME_URL = 'https://pokeidle.io/app'
const POKEIDLE_ORIGINS = new Set(['https://pokeidle.io', 'https://www.pokeidle.io'])
const POWER_MODES = new Set<AccountPowerMode>(['auto', 'on', 'black', 'suspended'])

type StoredPanelAnalytics = Partial<Record<AccountId, PanelAnalyticsPersistedState>>

interface StoredPowerSettings {
  modes: Partial<Record<AccountId, AccountPowerMode>>
  automation: PowerAutomationSettings
}

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
  powerMode: AccountPowerMode
  desiredPowerState: EffectivePowerState
  appliedPowerState: EffectivePowerState
  powerUpdateRunning: boolean
  suspendSupported: boolean
  huntProfile: HuntProfileScan | null
  huntProtocolStatus: HuntProtocolStatus
  huntSession: HuntSessionRuntime
  serverState: PokeIdleServerState
  lastServerAt: number
  socketUrls: Map<string, string>
  debuggerOwned: boolean
  debuggerMessageHandler: ((event: Electron.Event, method: string, params: unknown) => void) | null
  debuggerDetachHandler: (() => void) | null
  supplyUiTimer: ReturnType<typeof setInterval> | null
  supplyUiScanRunning: boolean
}

export class AccountRuntime {
  private readonly accounts = new Map<AccountId, AccountSlot>()
  private readonly authWindows = new Set<BrowserWindow>()
  private readonly zoomFilePath = join(app.getPath('userData'), 'gridium2-account-zoom.json')
  private readonly powerFilePath = join(app.getPath('userData'), 'gridium2-power-settings.json')
  private readonly panelAnalyticsFilePath = join(app.getPath('userData'), 'gridium2-panel-analytics-v2.json')
  private zoomWrite: Promise<void> = Promise.resolve()
  private powerWrite: Promise<void> = Promise.resolve()
  private readonly panelWriter = new CoalescedWriter(() => this.persistPanelAnalytics())
  private persistenceMetrics = { bytes: 0, durationMs: 0 }
  private powerAutomation: PowerAutomationSettings = { ...DEFAULT_POWER_AUTOMATION }
  private disposed = false

  constructor(
    private readonly window: BrowserWindow,
    private readonly onChanged: () => void
  ) {
    const storedZoom = this.loadZoomSettings()
    const storedPower = this.loadPowerSettings()
    const storedPanelAnalytics = this.loadPanelAnalyticsSettings()
    this.powerAutomation = storedPower.automation
    for (const id of [1, 2, 3, 4] as AccountId[]) {
      this.createAccount(
        id,
        normalizeAccountZoom(storedZoom[id] ?? DEFAULT_ACCOUNT_ZOOM),
        storedPower.modes[id] ?? 'auto',
        storedPanelAnalytics[id] ?? null
      )
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
      powerMode: account.powerMode,
      effectivePowerState: account.desiredPowerState,
      suspendSupported: account.suspendSupported,
      panelAnalytics: account.serverState.analytics(),
      huntProfile: account.huntProfile ? { ...account.huntProfile } : null,
      huntProtocolStatus: account.huntProtocolStatus,
      huntSession: account.huntSession.snapshot()
    }))
  }

  lastServerAt(accountId: AccountId): number {
    return this.accounts.get(accountId)?.lastServerAt ?? 0
  }

  addPanelRmtSale(accountId: AccountId, sale: PanelRmtSaleInput): boolean {
    const account = this.accounts.get(accountId)
    if (!account) return false
    const changed = account.serverState.registerRmtSale(sale)
    if (changed) {
      this.schedulePersistPanelAnalytics()
      this.onChanged()
    }
    return changed
  }

  getPowerAutomation(): PowerAutomationSettings {
    return { ...this.powerAutomation }
  }

  setPowerMode(accountId: AccountId, mode: AccountPowerMode): void {
    const account = this.accounts.get(accountId)
    if (!account || !POWER_MODES.has(mode) || account.powerMode === mode) return
    account.powerMode = mode
    this.persistPowerSettings()
    this.onChanged()
  }

  setAllPowerModes(mode: AccountPowerMode): void {
    if (!POWER_MODES.has(mode)) return
    let changed = false
    for (const account of this.accounts.values()) {
      if (account.powerMode === mode) continue
      account.powerMode = mode
      changed = true
    }
    if (!changed) return
    this.persistPowerSettings()
    this.onChanged()
  }

  setPowerAutomation(key: PowerAutomationKey, enabled: boolean): void {
    if (!(key in this.powerAutomation) || this.powerAutomation[key] === enabled) return
    this.powerAutomation = { ...this.powerAutomation, [key]: enabled }
    this.persistPowerSettings()
    this.onChanged()
  }

  applyLayout(
    bounds: Partial<Record<AccountId, Rect>>,
    visible: AccountId[],
    selectedAccount: AccountId,
    performanceMode: PerformanceMode,
    hostActive: boolean,
    hostMinimized: boolean
  ): void {
    if (this.disposed) return
    const visibleSet = new Set(visible)

    for (const account of this.accounts.values()) {
      const accountInLayout = visibleSet.has(account.id)
      account.visible = accountInLayout

      const effectivePowerState = resolveAccountPowerState({
        mode: account.powerMode,
        accountSelected: account.id === selectedAccount,
        accountInLayout,
        hostMinimized,
        automation: this.powerAutomation
      })
      this.requestPowerState(account, effectivePowerState)

      const shouldAttach = accountInLayout && effectivePowerState === 'on'
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

  getHuntProfile(accountId: AccountId): HuntProfileScan | null {
    return this.accounts.get(accountId)?.huntProfile ?? null
  }

  async scanHuntProfile(accountId: AccountId): Promise<HuntProfileScan | null> {
    return this.getHuntProfile(accountId)
  }

  async command(accountId: AccountId, command: AccountCommand): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account || account.view.webContents.isDestroyed() || account.desiredPowerState === 'suspended') return
    const wc = account.view.webContents
    switch (command) {
      case 'home': await wc.loadURL(GAME_URL); break
      case 'reload': wc.reload(); break
      case 'back': if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break
      case 'forward': if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break
    }
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.panelWriter.stop()
    this.flushPanelAnalyticsSync()
    for (const auth of this.authWindows) if (!auth.isDestroyed()) auth.close()
    this.authWindows.clear()
    for (const account of this.accounts.values()) {
      this.stopSupplyUiMonitor(account)
      this.detachServerMonitor(account)
      if (account.attached) {
        try { this.window.contentView.removeChildView(account.view) } catch { /* window teardown */ }
      }
      if (!account.view.webContents.isDestroyed()) account.view.webContents.close()
    }
    this.accounts.clear()
  }

  private createAccount(id: AccountId, zoomPercent: number, powerMode: AccountPowerMode, analyticsInitial: PanelAnalyticsPersistedState | null): void {
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
      id, name: `Conta ${id}`, partition, session: accountSession, view,
      attached: false, visible: false, status: 'booting', title: 'PokeIdle.io',
      desiredVisualMode: 'eco', appliedVisualMode: 'full', ecoCssKey: null, visualUpdateRunning: false,
      zoomPercent, powerMode, desiredPowerState: 'on', appliedPowerState: 'on', powerUpdateRunning: false,
      suspendSupported: true, huntProfile: null, huntProtocolStatus: 'waiting',
      huntSession: new HuntSessionRuntime(),
      serverState: new PokeIdleServerState({
        analyticsInitial,
        onAnalyticsPersist: () => this.schedulePersistPanelAnalytics()
      }),
      lastServerAt: 0,
      socketUrls: new Map(), debuggerOwned: false, debuggerMessageHandler: null, debuggerDetachHandler: null,
      supplyUiTimer: null, supplyUiScanRunning: false
    }

    this.accounts.set(id, account)
    void this.attachServerMonitor(account)

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (!this.isAllowedPopupUrl(url)) return { action: 'deny' }
      return { action: 'allow', overrideBrowserWindowOptions: this.authWindowOptions(account) }
    })
    view.webContents.on('did-create-window', (childWindow) => this.trackAuthWindow(account, childWindow))

    view.webContents.on('did-start-loading', () => {
      this.stopSupplyUiMonitor(account)
      this.clearInjectedVisualStyle(account)
      this.resetServerState(account)
      this.patchAccount(account, { status: 'loading' })
    })
    view.webContents.on('did-stop-loading', () => {
      if (!view.webContents.isDestroyed()) view.webContents.setZoomFactor(account.zoomPercent / 100)
      this.patchAccount(account, { status: 'ready' })
      this.startSupplyUiMonitor(account)
      this.requestVisualMode(account, account.desiredVisualMode)
      this.requestPowerState(account, account.desiredPowerState)
    })
    view.webContents.on('did-fail-load', (_event, code) => { if (code !== -3) this.patchAccount(account, { status: 'offline' }) })
    view.webContents.on('page-title-updated', (_event, title) => this.patchAccount(account, { title }))
    view.webContents.on('render-process-gone', () => {
      this.stopSupplyUiMonitor(account)
      this.resetServerState(account)
      this.patchAccount(account, { status: 'crashed' })
    })
    view.webContents.on('did-navigate', () => this.onChanged())
    view.webContents.on('did-navigate-in-page', () => this.onChanged())
  }

  private async attachServerMonitor(account: AccountSlot): Promise<void> {
    const wc = account.view.webContents
    if (this.disposed || wc.isDestroyed() || account.debuggerMessageHandler) return
    const debuggerApi = wc.debugger
    try {
      if (!debuggerApi.isAttached()) {
        debuggerApi.attach('1.3')
        account.debuggerOwned = true
      }
      const onMessage = (_event: Electron.Event, method: string, params: unknown): void => {
        if (this.disposed || wc.isDestroyed()) return
        this.handleDebuggerMessage(account, method, params)
      }
      const onDetach = (): void => {
        account.socketUrls.clear()
        account.serverState.reset()
        account.huntSession.reset()
        account.huntProfile = null
        account.huntProtocolStatus = 'unavailable'
        account.debuggerOwned = false
        account.suspendSupported = false
        account.lastServerAt = 0
        if (!this.disposed) this.onChanged()
      }
      account.debuggerMessageHandler = onMessage
      account.debuggerDetachHandler = onDetach
      debuggerApi.on('message', onMessage)
      debuggerApi.on('detach', onDetach)
      await debuggerApi.sendCommand('Network.enable')
      if (account.huntProtocolStatus === 'unavailable') account.huntProtocolStatus = 'waiting'
      account.suspendSupported = true
    } catch {
      account.huntProtocolStatus = 'unavailable'
      account.huntProfile = null
      account.suspendSupported = false
      account.lastServerAt = 0
      if (!this.disposed) this.onChanged()
    }
  }

  private detachServerMonitor(account: AccountSlot): void {
    const wc = account.view.webContents
    if (wc.isDestroyed()) return
    const debuggerApi = wc.debugger
    if (account.debuggerMessageHandler) debuggerApi.removeListener('message', account.debuggerMessageHandler)
    if (account.debuggerDetachHandler) debuggerApi.removeListener('detach', account.debuggerDetachHandler)
    account.debuggerMessageHandler = null
    account.debuggerDetachHandler = null
    account.socketUrls.clear()
    if (account.debuggerOwned && debuggerApi.isAttached()) {
      try { debuggerApi.detach() } catch { /* teardown only */ }
    }
    account.debuggerOwned = false
  }

  private handleDebuggerMessage(account: AccountSlot, method: string, params: unknown): void {
    if (!params || typeof params !== 'object') return
    const payload = params as { requestId?: string; url?: string; response?: { opcode?: number; payloadData?: string } }
    const requestId = String(payload.requestId || '')

    if (method === 'Network.webSocketCreated') {
      if (requestId && typeof payload.url === 'string') account.socketUrls.set(requestId, payload.url)
      return
    }
    if (method === 'Network.webSocketClosed') {
      if (requestId) account.socketUrls.delete(requestId)
      return
    }
    const receivedFrame = method === 'Network.webSocketFrameReceived'
    const sentFrame = method === 'Network.webSocketFrameSent'
    if ((!receivedFrame && !sentFrame) || !requestId) return

    const socketUrl = account.socketUrls.get(requestId)
    if (!socketUrl || !this.isPokeIdleSocket(socketUrl)) return
    const frame = payload.response
    if (!frame || typeof frame.payloadData !== 'string') return
    let raw = ''
    if (frame.opcode === 1) raw = frame.payloadData
    else if (frame.opcode === 2) {
      try { raw = Buffer.from(frame.payloadData, 'base64').toString('utf8') } catch { return }
    } else return
    if (!raw.trim()) return

    try {
      const packet = JSON.parse(raw) as unknown
      if (!packet || typeof packet !== 'object') return
      account.lastServerAt = Date.now()
      const huntSessionChanged = account.huntSession.ingest(packet, account.lastServerAt, sentFrame ? 'sent' : 'received')
      if (sentFrame) {
        if (huntSessionChanged) this.onChanged()
        return
      }
      const auxiliaryChanged = account.serverState.ingestAuxiliary(packet, account.lastServerAt)
      if (!/"t"\s*:\s*"(?:welcome|estado)"/.test(raw)) {
        if (auxiliaryChanged || huntSessionChanged) this.onChanged()
        return
      }
      const result = account.serverState.ingest(packet, account.lastServerAt)
      if (!result.accepted) {
        if (auxiliaryChanged || huntSessionChanged) this.onChanged()
        return
      }
      const statusChanged = account.huntProtocolStatus !== 'live'
      account.huntProtocolStatus = 'live'
      if (result.changed) account.huntProfile = result.profile
      else if (account.huntProfile === null && result.profile) account.huntProfile = result.profile
      if (result.changed || statusChanged || auxiliaryChanged || huntSessionChanged) this.onChanged()
    } catch {
      // Raw payloads are deliberately never logged or persisted.
    }
  }


  private startSupplyUiMonitor(account: AccountSlot): void {
    this.stopSupplyUiMonitor(account)
    if (this.disposed || account.view.webContents.isDestroyed()) return
    const scan = (): void => { void this.scanSupplyUi(account) }
    account.supplyUiTimer = setInterval(scan, 1_500)
    setTimeout(scan, 250)
  }

  private stopSupplyUiMonitor(account: AccountSlot): void {
    if (account.supplyUiTimer) clearInterval(account.supplyUiTimer)
    account.supplyUiTimer = null
    account.supplyUiScanRunning = false
  }

  private async scanSupplyUi(account: AccountSlot): Promise<void> {
    const wc = account.view.webContents
    if (this.disposed || wc.isDestroyed() || account.supplyUiScanRunning || account.status !== 'ready' || account.desiredPowerState === 'suspended') return
    account.supplyUiScanRunning = true
    try {
      const rawRows = await wc.executeJavaScript(POKEIDLE_UI_SUPPLY_SCAN_SCRIPT, false) as unknown
      if (!Array.isArray(rawRows)) return
      const rows: UiSupplyRow[] = []
      for (const raw of rawRows.slice(0, 8)) {
        if (!raw || typeof raw !== 'object') continue
        const row = raw as Partial<UiSupplyRow>
        if (typeof row.itemId !== 'string' || typeof row.name !== 'string' || typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity < 0) continue
        rows.push({ itemId: row.itemId.slice(0, 80), name: row.name.slice(0, 80), quantity: Math.floor(row.quantity) })
      }
      if (rows.length && account.huntSession.ingestUiConsumables(rows, Date.now()) && !this.disposed) this.onChanged()
    } catch {
      // The automation controls may not exist on every PokeIdle screen. This fallback is best-effort only.
    } finally {
      account.supplyUiScanRunning = false
    }
  }

  private resetServerState(account: AccountSlot): void {
    account.socketUrls.clear()
    const changed = account.serverState.reset() || account.huntProfile !== null || account.huntProtocolStatus !== 'waiting'
    account.huntSession.reset()
    account.lastServerAt = 0
    account.huntProfile = null
    if (account.huntProtocolStatus !== 'unavailable') account.huntProtocolStatus = 'waiting'
    if (changed && !this.disposed) this.onChanged()
  }

  private isPokeIdleSocket(url: string): boolean {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'wss:' && (parsed.hostname === 'pokeidle.io' || parsed.hostname === 'www.pokeidle.io')
    } catch { return false }
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

  private requestPowerState(account: AccountSlot, state: EffectivePowerState): void {
    account.desiredPowerState = state
    void this.reconcilePowerState(account)
  }

  private async reconcilePowerState(account: AccountSlot): Promise<void> {
    if (account.powerUpdateRunning || this.disposed || account.view.webContents.isDestroyed()) return
    account.powerUpdateRunning = true
    try {
      const wc = account.view.webContents
      while (!this.disposed && !wc.isDestroyed() && account.appliedPowerState !== account.desiredPowerState) {
        const target = account.desiredPowerState
        const debuggerApi = wc.debugger
        if (target === 'suspended') {
          wc.setBackgroundThrottling(true)
          if (debuggerApi.isAttached()) {
            try { await debuggerApi.sendCommand('Page.setWebLifecycleState', { state: 'frozen' }); account.suspendSupported = true }
            catch { account.suspendSupported = false }
          } else account.suspendSupported = false
        } else {
          if (account.appliedPowerState === 'suspended' && debuggerApi.isAttached()) {
            try { await debuggerApi.sendCommand('Page.setWebLifecycleState', { state: 'active' }); account.suspendSupported = true }
            catch { account.suspendSupported = false }
          }
          wc.setBackgroundThrottling(target !== 'black')
        }
        account.appliedPowerState = target
        if (!this.disposed) this.onChanged()
      }
    } finally {
      account.powerUpdateRunning = false
      if (!this.disposed && !account.view.webContents.isDestroyed() && account.appliedPowerState !== account.desiredPowerState) void this.reconcilePowerState(account)
    }
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
      if (!this.disposed && !account.view.webContents.isDestroyed() && account.appliedVisualMode !== account.desiredVisualMode) void this.reconcileVisualMode(account)
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
      for (const id of [1,2,3,4] as AccountId[]) {
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

  private loadPowerSettings(): StoredPowerSettings {
    const fallback: StoredPowerSettings = { modes: {}, automation: { ...DEFAULT_POWER_AUTOMATION } }
    try {
      const parsed = JSON.parse(readFileSync(this.powerFilePath, 'utf8')) as { modes?: Record<string, unknown>; automation?: Partial<Record<PowerAutomationKey, unknown>> }
      const modes: Partial<Record<AccountId, AccountPowerMode>> = {}
      for (const id of [1,2,3,4] as AccountId[]) {
        const value = parsed.modes?.[String(id)]
        if (typeof value === 'string' && POWER_MODES.has(value as AccountPowerMode)) modes[id] = value as AccountPowerMode
      }
      const automation: PowerAutomationSettings = {
        blackUnfocused: typeof parsed.automation?.blackUnfocused === 'boolean' ? parsed.automation.blackUnfocused : DEFAULT_POWER_AUTOMATION.blackUnfocused,
        blackWhenMinimized: typeof parsed.automation?.blackWhenMinimized === 'boolean' ? parsed.automation.blackWhenMinimized : DEFAULT_POWER_AUTOMATION.blackWhenMinimized,
        wakeOnSelect: typeof parsed.automation?.wakeOnSelect === 'boolean' ? parsed.automation.wakeOnSelect : DEFAULT_POWER_AUTOMATION.wakeOnSelect
      }
      return { modes, automation }
    } catch { return fallback }
  }

  private persistPowerSettings(): void {
    const payload = JSON.stringify({ modes: Object.fromEntries([...this.accounts.values()].map((account) => [String(account.id), account.powerMode])), automation: this.powerAutomation }, null, 2)
    this.powerWrite = this.powerWrite.catch(() => undefined).then(() => writeFile(this.powerFilePath, payload, 'utf8')).catch(() => undefined)
  }

  private loadPanelAnalyticsSettings(): StoredPanelAnalytics {
    try {
      const parsed = JSON.parse(readFileSync(this.panelAnalyticsFilePath, 'utf8')) as { accounts?: Record<string, PanelAnalyticsPersistedState> } | Record<string, PanelAnalyticsPersistedState>
      const source = ('accounts' in parsed && parsed.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : parsed) as Record<string, PanelAnalyticsPersistedState>
      const out: StoredPanelAnalytics = {}
      for (const id of [1,2,3,4] as AccountId[]) {
        const value = source[String(id)]
        if (value && typeof value === 'object') out[id] = value
      }
      return out
    } catch { return {} }
  }

  private schedulePersistPanelAnalytics(): void {
    if (!this.disposed) this.panelWriter.mark()
  }

  private panelAnalyticsPayload(): string {
    const accounts = Object.fromEntries([...this.accounts.values()].map((account) => [String(account.id), account.serverState.analyticsPersisted()]))
    return JSON.stringify({ version: 2, savedAt: Date.now(), accounts })
  }

  private async persistPanelAnalytics(): Promise<void> {
    if (!this.accounts.size || this.disposed) return
    const started = performance.now()
    const payload = this.panelAnalyticsPayload()
    const temporary = `${this.panelAnalyticsFilePath}.pending`
    await writeFile(temporary, payload, 'utf8')
    if (!this.disposed) renameSync(temporary, this.panelAnalyticsFilePath)
    this.persistenceMetrics = { bytes: Buffer.byteLength(payload), durationMs: performance.now() - started }
  }

  diagnostics() {
    return { persistence: { ...this.panelWriter.diagnostics(), ...this.persistenceMetrics },
      accounts: [...this.accounts.values()].map((a) => ({ id: a.id, sockets: a.socketUrls.size, lastServerAt: a.lastServerAt,
        listeners: a.view.webContents.eventNames().reduce((n, e) => n + a.view.webContents.listenerCount(e), 0),
        huntSession: a.huntSession.diagnostics(), ...a.serverState.diagnostics() })) }
  }

  private flushPanelAnalyticsSync(): void {
    if (!this.accounts.size) return
    try { writeFileSync(this.panelAnalyticsFilePath, this.panelAnalyticsPayload(), 'utf8') } catch { /* best-effort shutdown flush */ }
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
    let closeTimer: ReturnType<typeof setTimeout> | null = null
    const observeNavigation = (_event: Electron.Event, nextUrl: string): void => {
      if (!nextUrl || nextUrl === 'about:blank') return
      if (this.isPokeIdleUrl(nextUrl)) {
        if (!visitedExternalProvider) return
        if (closeTimer) return
        closeTimer = setTimeout(() => {
          closeTimer = null
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
      if (closeTimer) clearTimeout(closeTimer)
      this.authWindows.delete(auth)
      if (!this.disposed && !account.view.webContents.isDestroyed()) account.view.webContents.focus()
    })
  }

  private isAllowedPopupUrl(url: string): boolean {
    if (url === 'about:blank') return true
    try { const parsed = new URL(url); return parsed.protocol === 'https:' || parsed.protocol === 'http:' } catch { return false }
  }

  private isPokeIdleUrl(url: string): boolean {
    try { return POKEIDLE_ORIGINS.has(new URL(url).origin) } catch { return false }
  }
}
