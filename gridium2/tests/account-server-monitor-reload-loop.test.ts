import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/main/account-runtime.ts'), 'utf8')

describe('secondary-account server monitor reload-loop regression', () => {
  it('cancels an old watchdog when a new document starts loading', () => {
    const start = source.indexOf("view.webContents.on('did-start-loading'")
    const end = source.indexOf("view.webContents.on('did-stop-loading'", start)
    const block = source.slice(start, end)
    expect(block).toContain('this.cancelServerMonitorRecovery(account)')
  })

  it('preserves tracked WebSocket request IDs during normal loading', () => {
    const start = source.indexOf("view.webContents.on('did-start-loading'")
    const end = source.indexOf("view.webContents.on('did-stop-loading'", start)
    const block = source.slice(start, end)
    expect(block).toContain('this.resetServerState(account, true)')

    const resetStart = source.indexOf('private resetServerState')
    const resetEnd = source.indexOf('private isPokeIdleSocket', resetStart)
    const resetBlock = source.slice(resetStart, resetEnd)
    expect(resetBlock).toContain('preserveSocketMap = false')
    expect(resetBlock).toContain('if (!preserveSocketMap) account.socketUrls.clear()')
  })

  it('still clears socket tracking after a renderer crash', () => {
    const start = source.indexOf("view.webContents.on('render-process-gone'")
    const end = source.indexOf("view.webContents.on('did-navigate'", start)
    const block = source.slice(start, end)
    expect(block).toContain('this.resetServerState(account)')
    expect(block).not.toContain('this.resetServerState(account, true)')
  })

  it('keeps the bounded recovery reload for a genuinely missed socket', () => {
    expect(source).toContain('account.monitorRecoveryAttempts >= 2')
    expect(source).toContain('void this.recoverServerMonitor(account)')
    expect(source).toContain('account.view.webContents.reload()')
  })
})
