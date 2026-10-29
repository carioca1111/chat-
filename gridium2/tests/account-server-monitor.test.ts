import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/main/account-runtime.ts'), 'utf8')

describe('four-account PokeIdle server monitor', () => {
  it('enables every CDP Network monitor before loading any account page', () => {
    const boot = source.slice(source.indexOf('async boot()'), source.indexOf('snapshots():'))
    const monitorBarrier = boot.indexOf('Promise.all(accounts.map((account) => this.attachServerMonitor(account)))')
    const pageLoad = boot.indexOf('Promise.all(accounts.map((account) => this.loadAccount(account)))')
    expect(monitorBarrier).toBeGreaterThanOrEqual(0)
    expect(pageLoad).toBeGreaterThan(monitorBarrier)
    expect(source).not.toContain('this.accounts.set(id, account)\n    void this.attachServerMonitor(account)')
  })

  it('waits for Network.enable and tracks monitor readiness', () => {
    expect(source).toContain("await debuggerApi.sendCommand('Network.enable')")
    expect(source).toContain('account.monitorReady = true')
    expect(source).toContain('monitorAttachPromise')
  })

  it('recovers a missed or detached monitor with a bounded reload', () => {
    expect(source).toContain('scheduleServerMonitorRecovery(account)')
    expect(source).toContain('account.monitorRecoveryAttempts >= 2')
    expect(source).toContain('void this.recoverServerMonitor(account)')
    expect(source).toContain('account.view.webContents.reload()')
  })

  it('does not treat navigation or debugger detach as a Hunt exit', () => {
    const resetStart = source.indexOf('private resetServerState')
    const resetEnd = source.indexOf('private isPokeIdleSocket', resetStart)
    const resetBlock = source.slice(resetStart, resetEnd)
    expect(resetBlock).not.toContain('huntSession.reset()')

    const attachStart = source.indexOf('private async attachServerMonitorNow')
    const detachMethodStart = source.indexOf('private detachServerMonitor', attachStart)
    const attachBlock = source.slice(attachStart, detachMethodStart)
    expect(attachBlock).not.toContain('huntSession.reset()')
  })
})
