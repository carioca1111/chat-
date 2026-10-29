import { readFileSync, writeFileSync } from 'node:fs'

function patch(path, replacements) {
  let text = readFileSync(path, 'utf8')
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(`Missing ${JSON.stringify(from)} in ${path}`)
    text = text.replace(from, to)
  }
  writeFileSync(path, text, 'utf8')
}

patch('gridium2/src/main/account-runtime.ts', [
  [
`    view.webContents.on('did-start-loading', () => {
      this.clearInjectedVisualStyle(account)
      this.resetServerState(account)
      this.patchAccount(account, { status: 'loading' })
    })`,
`    view.webContents.on('did-start-loading', () => {
      this.clearInjectedVisualStyle(account)
      // A new load supersedes any watchdog armed for the previous document.
      // Keep the known WebSocket request IDs: Chromium does not replay
      // Network.webSocketCreated for sockets that survive an in-app navigation.
      this.cancelServerMonitorRecovery(account)
      this.resetServerState(account, true)
      this.patchAccount(account, { status: 'loading' })
    })`
  ],
  [
`  private resetServerState(account: AccountSlot): void {
    account.socketUrls.clear()`,
`  private resetServerState(account: AccountSlot, preserveSocketMap = false): void {
    if (!preserveSocketMap) account.socketUrls.clear()`
  ]
])

patch('gridium2/package.json', [
  ['"version": "2.0.0-alpha.13.16"', '"version": "2.0.0-alpha.13.17"'],
  ['Gridium 2 Alpha 1.3.16 - four-account server monitor recovery', 'Gridium 2 Alpha 1.3.17 - secondary-account reload-loop hotfix']
])
patch('gridium2/package-lock.json', [
  ['"version": "2.0.0-alpha.13.15"', '"version": "2.0.0-alpha.13.17"'],
  ['"version": "2.0.0-alpha.13.15"', '"version": "2.0.0-alpha.13.17"']
])
patch('gridium2/electron-builder.yml', [
  ['Gridium-2-Alpha-1.3.16-Setup.${ext}', 'Gridium-2-Alpha-1.3.17-Setup.${ext}']
])
patch('gridium2/src/renderer/src/App.tsx', [
  ['ALPHA 1.3.16', 'ALPHA 1.3.17']
])
patch('gridium2/src/renderer/index.html', [
  ['Gridium 2 — Alpha 1.3.16 Multi-Account Monitor', 'Gridium 2 — Alpha 1.3.17 Reload Loop Hotfix']
])
patch('gridium2/src/main/index.ts', [
  ['Gridium 2 — Alpha 1.3.16 Multi-Account Monitor', 'Gridium 2 — Alpha 1.3.17 Reload Loop Hotfix']
])

console.log('Applied Gridium 2 Alpha 1.3.17 secondary-account reload-loop hotfix.')
