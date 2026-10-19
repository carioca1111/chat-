import { app, BrowserWindow, session, WebContentsView } from 'electron'
import type { Session } from 'electron'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AccountCommand,
  AccountId,
  AccountPowerMode,
  AccountSnapshot,
  AccountStatus,
  AutoMarketMode,
  AutoMarketRule,
  AutoMarketSnapshot,
  EffectivePowerState,
  HuntProfileScan,
  HuntProtocolStatus,
  PerformanceMode,
  PowerAutomationKey,
  PowerAutomationSettings,
  VisualMode
} from '../shared/contracts'
import { AutoMarketRuntime } from './auto-market-runtime'
import type { AutoMarketPersistedSettings } from './auto-market-runtime'
import type { Rect } from './layout'
import { MARKET_BRIDGE_SOURCE } from './market-bridge'
import { ECO_VISUAL_CSS, resolveVisualMode } from './performance-policy'
import { DEFAULT_POWER_AUTOMATION, resolveAccountPowerState } from './power-policy'
import { PokeIdleServerState } from './pokeidle-server-state'
import { DEFAULT_ACCOUNT_ZOOM, normalizeAccountZoom } from './zoom'

const GAME_URL = 'https://pokeidle.io/app'
const POKEIDLE_ORIGINS = new Set(['https://pokeidle.io', 'https://www.pokeidle.io'])
const POWER_MODES = new Set<AccountPowerMode>(['auto', 'on', 'black', 'suspended'])

type JsonRecord = Record<string, unknown>

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
  serverState: PokeIdleServerState
  socketUrls: Map<string, string>
  debuggerOwned: boolean
  debuggerMessageHandler: ((event: Electron.Event, method: string, params: unknown) => void) | null
  debuggerDetachHandler: (() => void) | null
}

export class AccountRuntime {
  private readonly accounts = new Map<AccountId, AccountSlot>()
  private readonly authWindows = new Set<BrowserWindow>()
  private readonly zoomFilePath = join(app.getPath('userData'), 'gridium2-account-zoom.json')
  private readonly powerFilePath = join(app.getPath('userData'), 'gridium2-power-settings.json')
  private readonly autoMarketFilePath = join(app.getPath('userData'), 'gridium2-automarket.json')
  private readonly autoMarket: AutoMarketRuntime
  private zoomWrite: Promise<void> = Promise.resolve()
  private powerWrite: Promise<void> = Promise.resolve()
  private autoMarketWrite: Promise<void> = Promise.resolve()
  private powerAutomation: PowerAutomationSettings = { ...DEFAULT_POWER_AUTOMATION }
  private disposed = false

  constructor(
    private readonly window: BrowserWindow,
    private readonly onChanged: () => void
  ) {
    const storedZoom = this.loadZoomSettings()
    const storedPower = this.loadPowerSettings()
    this.powerAutomation = storedPower.automation
    this.autoMarket = new AutoMarketRuntime({
      initial: this.loadAutoMarketSettings(),
      onChanged: this.onChanged,
      onPersist: (settings) => this.persistAutoMarketSettings(settings),
      sendCommand: (accountId, command) => this.sendMarketCommand(accountId, command)
    })
    for (const id of [1, 2, 3, 4] as AccountId[]) {
      this.createAccount(
        id,
        normalizeAccountZoom(storedZoom[id] ?? DEFAULT_ACCOUNT_ZOOM),
        storedPower.modes[id] ?? 'auto'
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
      huntProfile: account.huntProfile ? { ...account.huntProfile } : null,
      huntProtocolStatus: account.huntProtocolStatus
    }))
  }

  autoMarketSnapshot(): AutoMarketSnapshot {
    return this.autoMarket.snapshot()
  }

  setAutoMarketUiActive(active: boolean): void {
    this.autoMarket.setUiActive(active)
  }

  setAutoMarketMode(mode: AutoMarketMode): void {
    this.autoMarket.setMode(mode)
  }

  setAutoMarketRule(accountId: AccountId, rule: AutoMarketRule): void {
    this.autoMarket.updateRule(accountId, rule)
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
    this.autoMarket.destroy()
    for (const auth of this.authWindows) if (!auth.isDestroyed()) auth.close()
    this.authWindows.clear()
    for (const account of this.accounts.values()) {
      this.detachServerMonitor(account)
      if (account.attached) {
        try { this.window.contentView.removeChildView(account.view) } catch { /* window teardown */ }
      }
      if (!account.view.webContents.isDestroyed()) account.view.webContents.close()
    }
    this.accounts.clear()
  }

  private createAccount(id: AccountId, zoomPercent: number, powerMode: AccountPowerMode): void {
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
      suspendSupported: true, huntProfile: null, huntProtocolStatus: 'waiting', serverState: new PokeIdleServerState(),
      socketUrls: new Map(), debuggerOwned: false, debuggerMessageHandler: null, debuggerDetachHandler: null
    }

    this.accounts.set(id, account)
    void this.attachServerMonitor(account)

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (!this.isAllowedPopupUrl(url)) return { action: 'deny' }
      return { action: 'allow', overrideBrowserWindowOptions: this.authWindowOptions(account) }
    })
    view.webContents.on('did-create-window', (childWindow) => this.trackAuthWindow(account, childWindow))

    view.webContents.on('did-start-loading', () => {
      this.clearInjectedVisualStyle(account)
      this.resetServerState(account)
      this.patchAccount(account, { status: 'loading' })
    })
    view.webContents.on('did-stop-loading', () => {
      if (!view.webContents.isDestroyed()) view.webContents.setZoomFactor(account.zoomPercent / 100)
      this.patchAccount(account, { status: 'ready' })
      this.requestVisualMode(account, account.desiredVisualMode)
      this.requestPowerState(account, account.desiredPowerState)
      void this.installMarketBridge(account)
    })
    view.webContents.on('did-fail-load', (_event, code) => { if (code !== -3) this.patchAccount(account, { status: 'offline' }) })
    view.webContents.on('page-title-updated', (_event, title) => this.patchAccount(account, { title }))
    view.webContents.on('render-process-gone', () => {
      this.resetServerState(account)
      this.patchAccount(account, { status: 'crashed' })
    })
    view.webContents.on('did-navigate', () => this.onChanged())
    view.webContents.on('did-navigate-in-page', () => this.onChanged())
  }

  private async attachServerMonitor(account: AccountSlot): Promise<void> {
    const wc = account.view.webContents
    if (this.disposed || wc.isDestroyed()) return
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
        account.huntProfile = null
        account.huntProtocolStatus = 'unavailable'
        account.debuggerOwned = false
        account.suspendSupported = false
        this.autoMarket.resetConnection(account.id)
        if (!this.disposed) this.onChanged()
      }
      account.debuggerMessageHandler = onMessage
      account.debuggerDetachHandler = onDetach
      debuggerApi.on('message', onMessage)
      debuggerApi.on('detach', onDetach)
      await debuggerApi.sendCommand('Network.enable')
      try { await debuggerApi.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: MARKET_BRIDGE_SOURCE }) } catch { /* current document install is fallback */ }
      if (account.huntProtocolStatus === 'unavailable') account.huntProtocolStatus = 'waiting'
      account.suspendSupported = true
      await this.installMarketBridge(account)
    } catch {
      account.huntProtocolStatus = 'unavailable'
      account.huntProfile = null
      account.suspendSupported = false
      this.autoMarket.resetConnection(account.id)
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
      if (requestId && typeof payload.url === 'string') {
        account.socketUrls.set(requestId, payload.url)
        if (this.isPokeIdleSocket(payload.url)) this.autoMarket.setSocketReady(account.id, true)
      }
      return
    }
    if (method === 'Network.webSocketClosed') {
      if (requestId) account.socketUrls.delete(requestId)
      const anyGameSocket = [...account.socketUrls.values()].some((url) => this.isPokeIdleSocket(url))
      if (!anyGameSocket) this.autoMarket.setSocketReady(account.id, false)
      return
    }
    if (method !== 'Network.webSocketFrameReceived' || !requestId) return

    const socketUrl = account.socketUrls.get(requestId)
    if (!socketUrl || !this.isPokeIdleSocket(socketUrl)) return
    const frame = payload.response
    if (!frame || frame.opcode !== 1 || typeof frame.payloadData !== 'string') return
    const raw = frame.payloadData
    if (!raw.includes('"t"')) return

    try {
      const packet = JSON.parse(raw) as unknown
      this.autoMarket.ingest(account.id, packet)
      if (!/"t"\s*:\s*"(?:welcome|estado)"/.test(raw)) return
      const result = account.serverState.ingest(packet)
      if (!result.accepted) return
      const statusChanged = account.huntProtocolStatus !== 'live'
      account.huntProtocolStatus = 'live'
      if (result.changed) account.huntProfile = result.profile
      else if (account.huntProfile === null && result.profile) account.huntProfile = result.profile
      if (result.changed || statusChanged) this.onChanged()
    } catch {
      // Raw payloads are deliberately never logged or persisted.
    }
  }

  private resetServerState(account: AccountSlot): void {
    account.socketUrls.clear()
    const changed = account.serverState.reset() || account.huntProfile !== null || account.huntProtocolStatus !== 'waiting'
    account.huntProfile = null
    if (account.huntProtocolStatus !== 'unavailable') account.huntProtocolStatus = 'waiting'
    this.autoMarket.resetConnection(account.id)
    if (changed && !this.disposed) this.onChanged()
  }

  private async installMarketBridge(account: AccountSlot): Promise<boolean> {
    const wc = account.view.webContents
    if (this.disposed || wc.isDestroyed()) return false
    try { return await wc.executeJavaScript(MARKET_BRIDGE_SOURCE, true) === true } catch { return false }
  }

  private async sendMarketCommand(accountId: AccountId, command: JsonRecord): Promise<{ ok: boolean; reason?: string }> {
    const account = this.accounts.get(accountId)
    if (!account || account.view.webContents.isDestroyed()) return { ok: false, reason: 'conta-indisponivel' }
    if (account.desiredPowerState === 'suspended') return { ok: false, reason: 'conta-suspensa' }
    if (!this.isPokeIdleUrl(account.view.webContents.getURL())) return { ok: false, reason: 'fora-do-pokeidle' }
    const clean = this.validateAutoMarketCommand(command)
    if (!clean) return { ok: false, reason: 'comando-rejeitado' }
    if (!await this.installMarketBridge(account)) return { ok: false, reason: 'bridge-indisponivel' }
    try {
      const encoded = JSON.stringify(clean)
      const result = await account.view.webContents.executeJavaScript(`window.__gridium2MarketSend ? window.__gridium2MarketSend(${encoded}) : ({ok:false,reason:'bridge-missing'})`, true) as { ok?: boolean; reason?: string }
      return result?.ok === true ? { ok: true } : { ok: false, reason: String(result?.reason || 'socket-unavailable') }
    } catch (error) {
      return { ok: false, reason: String(error instanceof Error ? error.message : error) }
    }
  }

  private validateAutoMarketCommand(input: JsonRecord): JsonRecord | null {
    const type = String(input.t || '')
    if (type === 'market.itens') {
      const categoria = String(input.categoria ?? '').slice(0, 80)
      const elementoRaw = input.elemento
      const elemento = elementoRaw === '' || elementoRaw === undefined ? '' : Number(elementoRaw)
      if (elemento !== '' && (!Number.isSafeInteger(elemento) || elemento <= 0)) return null
      return { t: type, elemento, categoria }
    }
    if (type === 'market.item') {
      const itemId = Number(input.itemId)
      const pagina = Math.max(1, Math.min(10, Number(input.pagina) || 1))
      if (!Number.isSafeInteger(itemId) || itemId <= 0) return null
      return { t: type, tipo: 'item', itemId, pagina }
    }
    if (type === 'market.comprar') {
      const id = Number(input.id), qtd = Number(input.qtd), preco = Number(input.preco), moeda = String(input.moeda || '')
      if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(qtd) || qtd <= 0 || qtd > 9999) return null
      if (!Number.isFinite(preco) || preco <= 0 || !['gold','orb'].includes(moeda)) return null
      return { t: type, id, qtd, preco, moeda }
    }
    return null
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

  private loadAutoMarketSettings(): AutoMarketPersistedSettings {
    try {
      const parsed = JSON.parse(readFileSync(this.autoMarketFilePath, 'utf8')) as AutoMarketPersistedSettings
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch { return {} }
  }

  private persistAutoMarketSettings(settings: AutoMarketPersistedSettings): void {
    const payload = JSON.stringify(settings, null, 2)
    this.autoMarketWrite = this.autoMarketWrite.catch(() => undefined).then(() => writeFile(this.autoMarketFilePath, payload, 'utf8')).catch(() => undefined)
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
    try { const parsed = new URL(url); return parsed.protocol === 'https:' || parsed.protocol === 'http:' } catch { return false }
  }

  private isPokeIdleUrl(url: string): boolean {
    try { return POKEIDLE_ORIGINS.has(new URL(url).origin) } catch { return false }
  }
}
