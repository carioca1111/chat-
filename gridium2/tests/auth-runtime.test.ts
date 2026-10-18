import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/main/account-runtime.ts'), 'utf8')

describe('Gridium 2 auth runtime contract', () => {
  it('keeps the browser user-agent native for Turnstile consistency', () => {
    expect(source).not.toContain('.setUserAgent(')
    expect(source).not.toContain('chromeUserAgent')
  })

  it('uses persistent isolated partitions for all four accounts', () => {
    expect(source).toContain('persist:gridium2-account-${id}')
    expect(source).toContain('session.fromPartition(partition)')
  })

  it('lets Chromium create auth popups with the owning account session', () => {
    expect(source).toContain("action: 'allow'")
    expect(source).toContain('session: account.session')
    expect(source).toContain("on('did-create-window'")
  })

  it('does not close a first-party auth bootstrap before visiting the provider', () => {
    expect(source).toContain('visitedExternalProvider')
    expect(source).toContain('if (!visitedExternalProvider) return')
  })

  it('keeps Node disabled and sandbox enabled in auth windows', () => {
    expect(source).toContain('nodeIntegration: false')
    expect(source).toContain('sandbox: true')
    expect(source).toContain('webSecurity: true')
  })
})
