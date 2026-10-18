import { BrowserWindow, session, WebContentsView } from 'electron'
import type { Session } from 'electron'
import type { AccountCommand, AccountId, AccountSnapshot, AccountStatus } from '../shared/contracts'
import type { Rect } from './layout'

const GAME_URL = 'https://pokeidle.io/'

interface AccountSlot {
  id: AccountId
  name: string
  partition: string
  session: Session
  view: WebContentsView
  attached: boolean
  status: AccountStatus
  title: string
}

export class AccountRuntime {
  private readonly accounts = new Map<AccountId, AccountSlot>()
  private disposed = false

  constructor(
    private readonly window: BrowserWindow,
    private readonly onChanged: () => void
  ) {
    for (const id of [1, 2, 3, 4] as AccountId[]) this.createAccount(id)
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
      attached: account.attached
    }))
  }

  applyLayout(bounds: Partial<Record<AccountId, Rect>>, visible: AccountId[]): void {
    if (this.disposed) return
    const visibleSet = new Set(visible)

    for (const account of this.accounts.values()) {
      const shouldAttach = visibleSet.has(account.id)
      if (shouldAttach && !account.attached) {
        this.window.contentView.addChildView(account.view)
        account.attached = true
      } else if (!shouldAttach && account.attached) {
        this.window.contentView.removeChildView(account.view)
        account.attached = false
      }

      const rect = bounds[account.id]
      if (shouldAttach && rect) account.view.setBounds(rect)
    }

    this.onChanged()
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
    for (const account of this.accounts.values()) {
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

  private createAccount(id: AccountId): void {
    const partition = `persist:gridium2-account-${id}`
    const accountSession = session.fromPartition(partition)
    accountSession.setUserAgent(this.chromeUserAgent())

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
    view.webContents.setWindowOpenHandler(({ url }) => {
      this.openAuthWindow(id, url)
      return { action: 'deny' }
    })

    const account: AccountSlot = {
      id,
      name: `Conta ${id}`,
      partition,
      session: accountSession,
      view,
      attached: false,
      status: 'booting',
      title: 'PokeIdle.io'
    }

    view.webContents.on('did-start-loading', () => this.patchAccount(account, { status: 'loading' }))
    view.webContents.on('did-stop-loading', () => this.patchAccount(account, { status: 'ready' }))
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
      this.patchAccount(account, { status: 'ready' })
    } catch {
      this.patchAccount(account, { status: 'offline' })
    }
  }

  private patchAccount(account: AccountSlot, patch: Partial<Pick<AccountSlot, 'status' | 'title'>>): void {
    Object.assign(account, patch)
    this.onChanged()
  }

  private openAuthWindow(accountId: AccountId, url: string): void {
    const account = this.accounts.get(accountId)
    if (!account || this.disposed) return

    const auth = new BrowserWindow({
      parent: this.window,
      width: 560,
      height: 760,
      minWidth: 420,
      minHeight: 620,
      autoHideMenuBar: true,
      backgroundColor: '#0b0d18',
      webPreferences: {
        session: account.session,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true
      }
    })

    auth.webContents.setWindowOpenHandler(({ url: nestedUrl }) => {
      void auth.loadURL(nestedUrl)
      return { action: 'deny' }
    })

    const maybeCloseAfterReturn = (_event: Electron.Event, nextUrl: string): void => {
      if (nextUrl.startsWith('https://pokeidle.io/')) {
        setTimeout(() => {
          if (!auth.isDestroyed()) auth.close()
          if (!account.view.webContents.isDestroyed()) account.view.webContents.reload()
        }, 350)
      }
    }

    auth.webContents.on('did-navigate', maybeCloseAfterReturn)
    auth.webContents.on('did-redirect-navigation', maybeCloseAfterReturn)
    void auth.loadURL(url)
  }

  private chromeUserAgent(): string {
    const chrome = process.versions.chrome ?? '134.0.0.0'
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
}
