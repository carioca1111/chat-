import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/main/account-runtime.ts'), 'utf8')

describe('Alpha 1.3.15 base server recognition hotfix', () => {
  it('enables all CDP Network monitors before loading PokeIdle pages', () => {
    const boot = source.slice(source.indexOf('async boot()'), source.indexOf('snapshots():'))
    const monitorBarrier = boot.indexOf('Promise.all(accounts.map((account) => this.attachServerMonitor(account)))')
    const pageLoad = boot.indexOf('Promise.all(accounts.map((account) => this.loadAccount(account)))')
    expect(monitorBarrier).toBeGreaterThanOrEqual(0)
    expect(pageLoad).toBeGreaterThan(monitorBarrier)
    expect(source).not.toContain('this.accounts.set(id, account)\n    void this.attachServerMonitor(account)')
  })

  it('preserves WebSocket request IDs during normal document loads', () => {
    const loadingStart = source.indexOf("view.webContents.on('did-start-loading'")
    const loadingEnd = source.indexOf("view.webContents.on('did-stop-loading'", loadingStart)
    const loadingBlock = source.slice(loadingStart, loadingEnd)
    expect(loadingBlock).toContain('this.resetServerState(account, true)')

    const resetStart = source.indexOf('private resetServerState')
    const resetEnd = source.indexOf('private isPokeIdleSocket', resetStart)
    const resetBlock = source.slice(resetStart, resetEnd)
    expect(resetBlock).toContain('preserveSocketMap = false')
    expect(resetBlock).toContain('if (!preserveSocketMap) account.socketUrls.clear()')
  })

  it('does not introduce the 1.3.16/1.3.17 reload watchdog', () => {
    expect(source).not.toContain('scheduleServerMonitorRecovery')
    expect(source).not.toContain('recoverServerMonitor')
    expect(source).not.toContain('monitorRecoveryAttempts')
  })

  it('still fully clears transport state after an actual renderer crash', () => {
    const crashStart = source.indexOf("view.webContents.on('render-process-gone'")
    const crashEnd = source.indexOf("view.webContents.on('did-navigate'", crashStart)
    const crashBlock = source.slice(crashStart, crashEnd)
    expect(crashBlock).toContain('this.resetServerState(account)')
    expect(crashBlock).not.toContain('this.resetServerState(account, true)')
  })
})
