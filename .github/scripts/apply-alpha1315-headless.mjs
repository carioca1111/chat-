import fs from 'node:fs'

function read(path) { return fs.readFileSync(path, 'utf8') }
function write(path, value) { fs.writeFileSync(path, value, 'utf8') }
function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing patch anchor: ${label}`)
  return text.replace(from, to)
}

const accountPath = 'gridium2/src/main/account-runtime.ts'
let account = read(accountPath)
account = replaceOnce(account, "import { POKEIDLE_UI_SUPPLY_SCAN_SCRIPT, type UiSupplyRow } from './pokeidle-ui-supply-scan'\n", '', 'UI scanner import')
account = replaceOnce(account, "  supplyUiTimer: ReturnType<typeof setInterval> | null\n  supplyUiScanRunning: boolean\n", '', 'UI scanner slot fields')
account = replaceOnce(account, ",\n      supplyUiTimer: null, supplyUiScanRunning: false\n", "\n", 'UI scanner slot init')
account = account.replaceAll('      this.stopSupplyUiMonitor(account)\n', '')
account = account.replaceAll('      this.startSupplyUiMonitor(account)\n', '')
const uiStart = account.indexOf('\n\n  private startSupplyUiMonitor(account: AccountSlot): void {')
const uiEnd = account.indexOf('\n  private resetServerState(account: AccountSlot): void {', uiStart)
if (uiStart < 0 || uiEnd < 0) throw new Error('Could not locate UI supply monitor methods')
account = account.slice(0, uiStart) + '\n\n' + account.slice(uiEnd)
if (account.includes('executeJavaScript(POKEIDLE_UI_SUPPLY_SCAN_SCRIPT') || account.includes('SupplyUiMonitor')) throw new Error('UI scanner still active in account-runtime')
write(accountPath, account)

const helperPath = 'gridium2/src/main/headless-supply-inference.ts'
let helper = read(helperPath)
helper = replaceOnce(
  helper,
  "        this.learn(itemId, effectName, result)\n        if (!known) result.uses.push({ itemId, name: effectName, amount: 1, remaining: remainingOf(value), source: transport === 'sent' ? 'sent' : 'event' })\n",
  "        this.learn(itemId, effectName, result)\n",
  'direct-effect duplicate use'
)
helper = replaceOnce(
  helper,
  "    this.learn(pending.itemId, name, result)\n    result.uses.push({ itemId: pending.itemId, name, amount: 1, remaining: pending.remaining, source: pending.source })\n",
  "    this.learn(pending.itemId, name, result)\n    const knownStock = this.rawStock.get(pending.itemId)\n    if (pending.remaining !== undefined) this.rawStock.set(pending.itemId, pending.remaining)\n    else if (knownStock !== undefined && knownStock > 0) this.rawStock.set(pending.itemId, knownStock - 1)\n    result.uses.push({ itemId: pending.itemId, name, amount: 1, remaining: pending.remaining, source: pending.source })\n",
  'headless stock decrement after inferred use'
)
write(helperPath, helper)

const runtimePath = 'gridium2/src/main/hunt-session-runtime.ts'
let runtime = read(runtimePath)
runtime = replaceOnce(runtime, "import { PokemonIdLedger } from './pokemon-id-ledger'\n", "import { PokemonIdLedger } from './pokemon-id-ledger'\nimport { HeadlessSupplyInference, type HeadlessSupplyInferenceResult } from './headless-supply-inference'\n", 'headless import')
runtime = replaceOnce(runtime, "type SupplyEventSource = 'event' | 'sent' | 'ui'\n", "type SupplyEventSource = 'event' | 'sent'\n", 'remove ui source')
runtime = replaceOnce(runtime, "  private readonly itemCatalog = new Map<string, string>()\n", "  private readonly itemCatalog = new Map<string, string>()\n  private readonly headlessSupply = new HeadlessSupplyInference()\n", 'headless field')

const oldBranchBlock = `    if (!isRecord(packet)) return false\n    learnSustainCatalog(packet, this.itemCatalog)\n    const type = String(packet.t || '')\n    if (type === 'batalha') {\n      const changed = this.ingestBattleEvents(packet, at, transport === 'sent' ? 'sent' : 'event')\n      if (changed) {\n        this.updatedAt = at\n        markSessionsDirty()\n      }\n      return changed\n    }\n    if (type !== 'welcome' && type !== 'estado') {\n      if (!this.huntSlug) return false\n      let changed = this.ingestGenericSupplyEvents(packet, at, transport === 'sent' ? 'sent' : 'event')\n      if (this.ingestConsumableInventory(inventoryRows(packet, this.itemCatalog), false, at)) changed = true\n      if (changed) {\n        this.updatedAt = at\n        markSessionsDirty()\n      }\n      return changed\n    }\n    const estado = isRecord(packet.estado) ? packet.estado : null\n`
const newBranchBlock = `    if (!isRecord(packet)) return false\n    const type = String(packet.t || '')\n    if (type === 'batalha') {\n      learnSustainCatalog(packet, this.itemCatalog)\n      let changed = this.applyHeadlessSupply(this.headlessSupply.ingest(packet, at, transport), at)\n      if (this.ingestBattleEvents(packet, at, transport === 'sent' ? 'sent' : 'event')) changed = true\n      if (changed) {\n        this.updatedAt = at\n        markSessionsDirty()\n      }\n      return changed\n    }\n    if (type !== 'welcome' && type !== 'estado') {\n      learnSustainCatalog(packet, this.itemCatalog)\n      let changed = this.applyHeadlessSupply(this.headlessSupply.ingest(packet, at, transport), at)\n      if (this.huntSlug && this.ingestGenericSupplyEvents(packet, at, transport === 'sent' ? 'sent' : 'event')) changed = true\n      if (this.huntSlug && this.ingestConsumableInventory(inventoryRows(packet, this.itemCatalog), false, at)) changed = true\n      if (changed) {\n        this.updatedAt = at\n        markSessionsDirty()\n      }\n      return changed\n    }\n    const estado = isRecord(packet.estado) ? packet.estado : null\n`
runtime = replaceOnce(runtime, oldBranchBlock, newBranchBlock, 'ingest branch integration')

runtime = replaceOnce(
  runtime,
  "    let changed = sessionTransition\n",
  "    learnSustainCatalog(packet, this.itemCatalog)\n    let changed = sessionTransition\n    if (this.applyHeadlessSupply(this.headlessSupply.ingest(packet, at, transport), at)) changed = true\n",
  'welcome/estado headless apply'
)

const uiMethodStart = runtime.indexOf('\n\n  ingestUiConsumables(')
const snapshotStart = runtime.indexOf('\n  snapshot(at = Date.now()): HuntSessionSnapshot {', uiMethodStart)
if (uiMethodStart < 0 || snapshotStart < 0) throw new Error('Could not locate ingestUiConsumables')
const applyMethod = `\n\n  private applyHeadlessSupply(result: HeadlessSupplyInferenceResult, at: number): boolean {\n    let changed = false\n    for (const entry of result.learned) {\n      if (this.itemCatalog.get(entry.itemId) !== entry.name) this.itemCatalog.set(entry.itemId, entry.name)\n    }\n    for (const use of result.uses) {\n      if (this.registerSupplyUse(use.itemId, use.name, use.amount, at, use.source, use.remaining)) changed = true\n    }\n    for (const stock of result.stock) {\n      if (this.ingestConsumableInventory([stock], false, at, 'state')) changed = true\n    }\n    return changed\n  }\n\n`
runtime = runtime.slice(0, uiMethodStart) + applyMethod + runtime.slice(snapshotStart)

runtime = replaceOnce(
  runtime,
  "    this.recentSupplyMirrors.clear()\n    if (!preserveAccount) this.itemCatalog.clear()\n",
  "    this.recentSupplyMirrors.clear()\n    this.headlessSupply.reset(preserveAccount)\n    if (!preserveAccount) this.itemCatalog.clear()\n",
  'headless reset'
)
if (runtime.includes('ingestUiConsumables') || runtime.includes("'ui'")) throw new Error('UI supply path still present in hunt-session-runtime')
write(runtimePath, runtime)

const packagePath = 'gridium2/package.json'
let pkg = read(packagePath)
pkg = pkg.replace('2.0.0-alpha.13.14', '2.0.0-alpha.13.15')
pkg = pkg.replace('Gridium 2 Alpha 1.3.14 - PokeIdle UI potion/revive stock fallback', 'Gridium 2 Alpha 1.3.15 - headless potion/revive protocol inference')
write(packagePath, pkg)

const builderPath = 'gridium2/electron-builder.yml'
let builder = read(builderPath).replace('Gridium-2-Alpha-1.3.14-Setup.${ext}', 'Gridium-2-Alpha-1.3.15-Setup.${ext}')
write(builderPath, builder)

const appPath = 'gridium2/src/renderer/src/App.tsx'
let app = read(appPath).replace('ALPHA 1.3.14', 'ALPHA 1.3.15')
write(appPath, app)

const htmlPath = 'gridium2/src/renderer/index.html'
let html = read(htmlPath).replace('Gridium 2 — Alpha 1.3.14 Potion UI Fallback', 'Gridium 2 — Alpha 1.3.15 Headless Supply')
write(htmlPath, html)

const mainPath = 'gridium2/src/main/index.ts'
let main = read(mainPath).replace('Gridium 2 — Alpha 1.3.14 Potion UI Fallback', 'Gridium 2 — Alpha 1.3.15 Headless Supply')
write(mainPath, main)

const uiScannerPath = 'gridium2/src/main/pokeidle-ui-supply-scan.ts'
if (fs.existsSync(uiScannerPath)) fs.rmSync(uiScannerPath)

console.log('Alpha 1.3.15 headless supply patch applied')
