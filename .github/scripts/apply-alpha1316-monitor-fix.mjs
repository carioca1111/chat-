import { readFileSync, writeFileSync } from 'node:fs'

const path = 'gridium2/src/main/account-runtime.ts'
let source = readFileSync(path, 'utf8')

function replaceOnce(from, to, label) {
  const first = source.indexOf(from)
  if (first < 0) throw new Error(`Missing patch target: ${label}`)
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous patch target: ${label}`)
  source = source.slice(0, first) + to + source.slice(first + from.length)
}

replaceOnce(
`  debuggerOwned: boolean
  debuggerMessageHandler: ((event: Electron.Event, method: string, params: unknown) => void) | null
  debuggerDetachHandler: (() => void) | null
}`,
`  debuggerOwned: boolean
  debuggerMessageHandler: ((event: Electron.Event, method: string, params: unknown) => void) | null
  debuggerDetachHandler: (() => void) | null
  monitorAttachPromise: Promise<void> | null
  monitorReady: boolean
  monitorRecoveryTimer: ReturnType<typeof setTimeout> | null
  monitorRecoveryAttempts: number
}`,
'account monitor fields')

replaceOnce(
`  async boot(): Promise<void> {
    await Promise.all([...this.accounts.values()].map((account) => this.loadAccount(account)))
  }`,
`  async boot(): Promise<void> {
    const accounts = [...this.accounts.values()]
    // The CDP Network domain must be active before any PokeIdle page is allowed to
    // create its WebSocket. Otherwise a fast second/third/fourth account can open
    // the socket before Network.enable completes and remain in "AGUARDANDO SERVIDOR"
    // forever because webSocketCreated is never replayed by Chromium.
    await Promise.all(accounts.map((account) => this.attachServerMonitor(account)))
    await Promise.all(accounts.map((account) => this.loadAccount(account)))
  }`,
'boot monitor barrier')

replaceOnce(
`      lastServerAt: 0,
      socketUrls: new Map(), debuggerOwned: false, debuggerMessageHandler: null, debuggerDetachHandler: null
    }

    this.accounts.set(id, account)
    void this.attachServerMonitor(account)`,
`      lastServerAt: 0,
      socketUrls: new Map(), debuggerOwned: false, debuggerMessageHandler: null, debuggerDetachHandler: null,
      monitorAttachPromise: null, monitorReady: false, monitorRecoveryTimer: null, monitorRecoveryAttempts: 0
    }

    this.accounts.set(id, account)`,
'account initialization and eager monitor removal')

replaceOnce(
`    view.webContents.on('did-stop-loading', () => {
      if (!view.webContents.isDestroyed()) view.webContents.setZoomFactor(account.zoomPercent / 100)
      this.patchAccount(account, { status: 'ready' })
      this.requestVisualMode(account, account.desiredVisualMode)
      this.requestPowerState(account, account.desiredPowerState)
    })`,
`    view.webContents.on('did-stop-loading', () => {
      if (!view.webContents.isDestroyed()) view.webContents.setZoomFactor(account.zoomPercent / 100)
      this.patchAccount(account, { status: 'ready' })
      this.requestVisualMode(account, account.desiredVisualMode)
      this.requestPowerState(account, account.desiredPowerState)
      this.scheduleServerMonitorRecovery(account)
    })`,
'load watchdog')

replaceOnce(
`    for (const account of this.accounts.values()) {
      this.detachServerMonitor(account)`,
`    for (const account of this.accounts.values()) {
      this.cancelServerMonitorRecovery(account)
      this.detachServerMonitor(account)`,
'destroy recovery timer')

const attachStart = source.indexOf('  private async attachServerMonitor(account: AccountSlot): Promise<void> {')
const detachStart = source.indexOf('  private detachServerMonitor(account: AccountSlot): void {', attachStart)
if (attachStart < 0 || detachStart < 0) throw new Error('Unable to locate monitor methods')
const oldAttach = source.slice(attachStart, detachStart)
const newAttach = `  private attachServerMonitor(account: AccountSlot): Promise<void> {
    const wc = account.view.webContents
    if (this.disposed || wc.isDestroyed()) return Promise.resolve()
    if (account.monitorAttachPromise) return account.monitorAttachPromise
    if (account.monitorReady && account.debuggerMessageHandler) return Promise.resolve()

    const pending = this.attachServerMonitorNow(account)
    const tracked = pending.finally(() => {
      if (account.monitorAttachPromise === tracked) account.monitorAttachPromise = null
    })
    account.monitorAttachPromise = tracked
    return tracked
  }

  private async attachServerMonitorNow(account: AccountSlot): Promise<void> {
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
        debuggerApi.removeListener('message', onMessage)
        debuggerApi.removeListener('detach', onDetach)
        if (account.debuggerMessageHandler === onMessage) account.debuggerMessageHandler = null
        if (account.debuggerDetachHandler === onDetach) account.debuggerDetachHandler = null
        account.socketUrls.clear()
        account.serverState.reset()
        // A debugger/CDP detach is a transport failure, not a Hunt exit. The Hunt
        // session is deliberately preserved and will be reconciled after recovery.
        account.huntProfile = null
        account.huntProtocolStatus = 'unavailable'
        account.debuggerOwned = false
        account.monitorReady = false
        account.suspendSupported = false
        account.lastServerAt = 0
        if (!this.disposed) {
          this.onChanged()
          this.scheduleServerMonitorRecovery(account, 1_000)
        }
      }

      account.debuggerMessageHandler = onMessage
      account.debuggerDetachHandler = onDetach
      debuggerApi.on('message', onMessage)
      debuggerApi.on('detach', onDetach)

      // Do not load PokeIdle until this await has completed. This is the barrier that
      // prevents accounts 2-4 from missing Network.webSocketCreated at startup.
      await debuggerApi.sendCommand('Network.enable')
      account.monitorReady = true
      if (account.huntProtocolStatus === 'unavailable') account.huntProtocolStatus = 'waiting'
      account.suspendSupported = true
    } catch {
      this.detachServerMonitor(account)
      account.huntProtocolStatus = 'unavailable'
      account.huntProfile = null
      account.monitorReady = false
      account.suspendSupported = false
      account.lastServerAt = 0
      if (!this.disposed) {
        this.onChanged()
        this.scheduleServerMonitorRecovery(account, 1_500)
      }
    }
  }

`
source = source.replace(oldAttach, newAttach)

replaceOnce(
`    account.debuggerMessageHandler = null
    account.debuggerDetachHandler = null
    account.socketUrls.clear()
    if (account.debuggerOwned && debuggerApi.isAttached()) {`,
`    account.debuggerMessageHandler = null
    account.debuggerDetachHandler = null
    account.socketUrls.clear()
    account.monitorReady = false
    if (account.debuggerOwned && debuggerApi.isAttached()) {`,
'detach monitor ready state')

const insertionMarker = `  private handleDebuggerMessage(account: AccountSlot, method: string, params: unknown): void {`
const recoveryMethods = `  private scheduleServerMonitorRecovery(account: AccountSlot, delayMs = 7_500): void {
    if (this.disposed || account.view.webContents.isDestroyed() || account.huntProtocolStatus === 'live' || account.monitorRecoveryTimer) return
    const timer = setTimeout(() => {
      account.monitorRecoveryTimer = null
      if (this.disposed || account.view.webContents.isDestroyed() || account.huntProtocolStatus === 'live') return
      if (!this.isPokeIdleUrl(account.view.webContents.getURL())) return
      if (account.monitorRecoveryAttempts >= 2) return
      account.monitorRecoveryAttempts++
      void this.recoverServerMonitor(account)
    }, delayMs)
    timer.unref?.()
    account.monitorRecoveryTimer = timer
  }

  private cancelServerMonitorRecovery(account: AccountSlot): void {
    if (!account.monitorRecoveryTimer) return
    clearTimeout(account.monitorRecoveryTimer)
    account.monitorRecoveryTimer = null
  }

  private async recoverServerMonitor(account: AccountSlot): Promise<void> {
    if (this.disposed || account.view.webContents.isDestroyed()) return
    this.detachServerMonitor(account)
    await this.attachServerMonitor(account)
    if (this.disposed || account.view.webContents.isDestroyed() || !account.monitorReady) return
    if (account.huntProtocolStatus === 'live') return
    // Network.enable does not replay WebSocket creation events for an already-open
    // socket. One bounded reload creates a fresh socket while the monitor is ready.
    if (this.isPokeIdleUrl(account.view.webContents.getURL())) account.view.webContents.reload()
  }

`
if (!source.includes(insertionMarker)) throw new Error('Missing handleDebuggerMessage insertion point')
source = source.replace(insertionMarker, recoveryMethods + insertionMarker)

replaceOnce(
`      const statusChanged = account.huntProtocolStatus !== 'live'
      account.huntProtocolStatus = 'live'
      if (result.changed) account.huntProfile = result.profile`,
`      const statusChanged = account.huntProtocolStatus !== 'live'
      account.huntProtocolStatus = 'live'
      account.monitorRecoveryAttempts = 0
      this.cancelServerMonitorRecovery(account)
      if (result.changed) account.huntProfile = result.profile`,
'live state cancels recovery')

replaceOnce(
`    const changed = account.serverState.reset() || account.huntProfile !== null || account.huntProtocolStatus !== 'waiting'
    account.huntSession.reset()
    account.lastServerAt = 0`,
`    const changed = account.serverState.reset() || account.huntProfile !== null || account.huntProtocolStatus !== 'waiting'
    // Navigation/reload is not a Hunt exit. HuntSessionRuntime decides continuity
    // from the next authoritative welcome/estado packet and persists it independently.
    account.lastServerAt = 0`,
'navigation preserves Hunt session')

replaceOnce(
`      accounts: [...this.accounts.values()].map((a) => ({ id: a.id, sockets: a.socketUrls.size, lastServerAt: a.lastServerAt,
        listeners:`,
`      accounts: [...this.accounts.values()].map((a) => ({ id: a.id, sockets: a.socketUrls.size, lastServerAt: a.lastServerAt,
        monitorReady: a.monitorReady, monitorRecoveryAttempts: a.monitorRecoveryAttempts,
        listeners:`,
'monitor diagnostics')

writeFileSync(path, source, 'utf8')
console.log('Applied Alpha 1.3.16 multi-account server monitor fix.')
