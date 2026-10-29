import { readFileSync, writeFileSync } from 'node:fs'

function readNormalized(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

function replaceOnce(text, from, to, path) {
  if (!text.includes(from)) throw new Error(`Missing expected block in ${path}: ${JSON.stringify(from)}`)
  return text.replace(from, to)
}

const runtimePath = 'gridium2/src/main/account-runtime.ts'
let runtime = readNormalized(runtimePath)

runtime = replaceOnce(runtime,
`  async boot(): Promise<void> {
    await Promise.all([...this.accounts.values()].map((account) => this.loadAccount(account)))
  }`,
`  async boot(): Promise<void> {
    const accounts = [...this.accounts.values()]
    // Alpha 1.3.15 base hotfix: CDP Network must be enabled before PokeIdle
    // can create its WebSocket. Chromium does not replay webSocketCreated later.
    await Promise.all(accounts.map((account) => this.attachServerMonitor(account)))
    await Promise.all(accounts.map((account) => this.loadAccount(account)))
  }`, runtimePath)

runtime = replaceOnce(runtime,
`    this.accounts.set(id, account)
    void this.attachServerMonitor(account)`,
`    this.accounts.set(id, account)`, runtimePath)

runtime = replaceOnce(runtime,
`    view.webContents.on('did-start-loading', () => {
      this.clearInjectedVisualStyle(account)
      this.resetServerState(account)
      this.patchAccount(account, { status: 'loading' })
    })`,
`    view.webContents.on('did-start-loading', () => {
      this.clearInjectedVisualStyle(account)
      // Preserve known WebSocket request IDs across normal PokeIdle loads. Closing
      // an in-game modal/navigation can start a load while the same socket survives;
      // clearing the map here makes Gridium ignore subsequent frames forever.
      this.resetServerState(account, true)
      this.patchAccount(account, { status: 'loading' })
    })`, runtimePath)

runtime = replaceOnce(runtime,
`  private resetServerState(account: AccountSlot): void {
    account.socketUrls.clear()`,
`  private resetServerState(account: AccountSlot, preserveSocketMap = false): void {
    if (!preserveSocketMap) account.socketUrls.clear()`, runtimePath)

writeFileSync(runtimePath, runtime, 'utf8')

const packagePath = 'gridium2/package.json'
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
pkg.version = '2.0.0-alpha.13.18'
pkg.description = 'Gridium 2 Alpha 1.3.18 - Alpha 1.3.15 base server recognition hotfix'
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')

const lockPath = 'gridium2/package-lock.json'
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
lock.version = '2.0.0-alpha.13.18'
if (lock.packages?.['']) lock.packages[''].version = '2.0.0-alpha.13.18'
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')

function patchSimple(path, from, to) {
  let text = readNormalized(path)
  text = replaceOnce(text, from, to, path)
  writeFileSync(path, text, 'utf8')
}

patchSimple('gridium2/electron-builder.yml', 'Gridium-2-Alpha-1.3.15-Setup.${ext}', 'Gridium-2-Alpha-1.3.18-Setup.${ext}')
patchSimple('gridium2/src/renderer/src/App.tsx', 'ALPHA 1.3.15', 'ALPHA 1.3.18')
patchSimple('gridium2/src/renderer/index.html', 'Gridium 2 — Alpha 1.3.15 Headless Supply', 'Gridium 2 — Alpha 1.3.18 · 1.3.15 Base Hotfix')
patchSimple('gridium2/src/main/index.ts', 'Gridium 2 — Alpha 1.3.15 Headless Supply', 'Gridium 2 — Alpha 1.3.18 · 1.3.15 Base Hotfix')

console.log('Applied Alpha 1.3.18 minimal server-recognition hotfix on exact Alpha 1.3.15 base.')
