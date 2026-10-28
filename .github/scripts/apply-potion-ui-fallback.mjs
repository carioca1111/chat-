import fs from 'node:fs'

function replaceOrThrow(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing anchor: ${label}`)
  return source.replace(from, to)
}

const accountPath = 'gridium2/src/main/account-runtime.ts'
let account = fs.readFileSync(accountPath, 'utf8')
account = replaceOrThrow(
  account,
  "import { PokeIdleServerState } from './pokeidle-server-state'\n",
  "import { PokeIdleServerState } from './pokeidle-server-state'\nimport { POKEIDLE_UI_SUPPLY_SCAN_SCRIPT, type UiSupplyRow } from './pokeidle-ui-supply-scan'\n",
  'account import'
)
account = replaceOrThrow(
  account,
  "  debuggerDetachHandler: (() => void) | null\n}",
  "  debuggerDetachHandler: (() => void) | null\n  supplyUiTimer: ReturnType<typeof setInterval> | null\n  supplyUiScanRunning: boolean\n}",
  'account slot fields'
)
account = replaceOrThrow(
  account,
  "      socketUrls: new Map(), debuggerOwned: false, debuggerMessageHandler: null, debuggerDetachHandler: null\n",
  "      socketUrls: new Map(), debuggerOwned: false, debuggerMessageHandler: null, debuggerDetachHandler: null,\n      supplyUiTimer: null, supplyUiScanRunning: false\n",
  'account init'
)
account = replaceOrThrow(
  account,
  "    for (const account of this.accounts.values()) {\n      this.detachServerMonitor(account)\n",
  "    for (const account of this.accounts.values()) {\n      this.stopSupplyUiMonitor(account)\n      this.detachServerMonitor(account)\n",
  'destroy scanner'
)
account = replaceOrThrow(
  account,
  "    view.webContents.on('did-start-loading', () => {\n      this.clearInjectedVisualStyle(account)\n",
  "    view.webContents.on('did-start-loading', () => {\n      this.stopSupplyUiMonitor(account)\n      this.clearInjectedVisualStyle(account)\n",
  'navigation stop scanner'
)
account = replaceOrThrow(
  account,
  "      this.patchAccount(account, { status: 'ready' })\n      this.requestVisualMode(account, account.desiredVisualMode)\n      this.requestPowerState(account, account.desiredPowerState)\n",
  "      this.patchAccount(account, { status: 'ready' })\n      this.startSupplyUiMonitor(account)\n      this.requestVisualMode(account, account.desiredVisualMode)\n      this.requestPowerState(account, account.desiredPowerState)\n",
  'start scanner after load'
)
account = replaceOrThrow(
  account,
  "    view.webContents.on('render-process-gone', () => {\n      this.resetServerState(account)\n",
  "    view.webContents.on('render-process-gone', () => {\n      this.stopSupplyUiMonitor(account)\n      this.resetServerState(account)\n",
  'render gone scanner'
)
const scannerMethods = `
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

`
account = replaceOrThrow(
  account,
  "  private resetServerState(account: AccountSlot): void {\n",
  scannerMethods + "  private resetServerState(account: AccountSlot): void {\n",
  'scanner methods anchor'
)
fs.writeFileSync(accountPath, account)

const huntPath = 'gridium2/src/main/hunt-session-runtime.ts'
let hunt = fs.readFileSync(huntPath, 'utf8')
hunt = replaceOrThrow(
  hunt,
  "type SupplyEventSource = 'event' | 'sent'\n",
  "type SupplyEventSource = 'event' | 'sent' | 'ui'\n",
  'ui supply source'
)
const uiMethod = `
  ingestUiConsumables(inventory: Array<{ itemId: string; name: string; quantity: number }>, at = Date.now()): boolean {
    if (!Array.isArray(inventory) || inventory.length === 0) return false
    const rows = inventory
      .filter((row) => row && typeof row.itemId === 'string' && typeof row.name === 'string' && Number.isFinite(row.quantity) && row.quantity >= 0)
      .map((row) => ({ itemId: row.itemId, name: canonicalSustainName(row.name), quantity: Math.floor(row.quantity) }))
      .filter((row) => Boolean(sustainCategory(row.name)))
    if (!rows.length) return false
    const changed = this.ingestConsumableInventory(rows, false, at, 'ui')
    if (changed) {
      this.updatedAt = at
      markSessionsDirty()
    }
    return changed
  }

`
hunt = replaceOrThrow(
  hunt,
  "  snapshot(at = Date.now()): HuntSessionSnapshot {\n",
  uiMethod + "  snapshot(at = Date.now()): HuntSessionSnapshot {\n",
  'ui ingest method'
)
hunt = replaceOrThrow(
  hunt,
  "  private ingestConsumableInventory(inventory: Array<{ itemId: string; name: string; quantity: number }>, fullState: boolean, at: number): boolean {\n",
  "  private ingestConsumableInventory(inventory: Array<{ itemId: string; name: string; quantity: number }>, fullState: boolean, at: number, source: SupplyEventSource | 'state' = 'state'): boolean {\n",
  'inventory source signature'
)
hunt = replaceOrThrow(
  hunt,
  "        if (this.registerSupplyUse(row.itemId, row.name, used, at, 'state', row.quantity)) changed = true\n",
  "        if (this.registerSupplyUse(row.itemId, row.name, used, at, source, row.quantity)) changed = true\n",
  'inventory source usage'
)
fs.writeFileSync(huntPath, hunt)
