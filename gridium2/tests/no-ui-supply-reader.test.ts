import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('headless supply architecture', () => {
  it('does not depend on reading PokeIdle UI/DOM for potion or revive tracking', () => {
    const accountRuntime = readFileSync('src/main/account-runtime.ts', 'utf8')
    const huntRuntime = readFileSync('src/main/hunt-session-runtime.ts', 'utf8')

    expect(accountRuntime).not.toContain('POKEIDLE_UI_SUPPLY_SCAN_SCRIPT')
    expect(accountRuntime).not.toContain('startSupplyUiMonitor')
    expect(accountRuntime).not.toContain('scanSupplyUi')
    expect(huntRuntime).not.toContain('ingestUiConsumables')
    expect(existsSync('src/main/pokeidle-ui-supply-scan.ts')).toBe(false)
    expect(huntRuntime).toContain('HeadlessSupplyInference')
  })
})
