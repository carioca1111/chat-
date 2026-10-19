import { describe, expect, it } from 'vitest'
import { DEFAULT_POWER_AUTOMATION, resolveAccountPowerState } from '../src/main/power-policy'

describe('Gridium 2 account power policy', () => {
  it('keeps explicit screen modes authoritative', () => {
    expect(resolveAccountPowerState({ mode: 'on', accountSelected: false, accountInLayout: true, hostMinimized: true, automation: DEFAULT_POWER_AUTOMATION })).toBe('on')
    expect(resolveAccountPowerState({ mode: 'black', accountSelected: true, accountInLayout: true, hostMinimized: false, automation: DEFAULT_POWER_AUTOMATION })).toBe('black')
    expect(resolveAccountPowerState({ mode: 'suspended', accountSelected: true, accountInLayout: true, hostMinimized: false, automation: DEFAULT_POWER_AUTOMATION })).toBe('suspended')
  })

  it('turns an automatic account black while the host is minimized', () => {
    expect(resolveAccountPowerState({ mode: 'auto', accountSelected: true, accountInLayout: true, hostMinimized: true, automation: DEFAULT_POWER_AUTOMATION })).toBe('black')
  })

  it('wakes the selected automatic account when the app is visible', () => {
    expect(resolveAccountPowerState({ mode: 'auto', accountSelected: true, accountInLayout: true, hostMinimized: false, automation: DEFAULT_POWER_AUTOMATION })).toBe('on')
  })

  it('can black out non-selected accounts in multi-account layouts', () => {
    expect(resolveAccountPowerState({
      mode: 'auto', accountSelected: false, accountInLayout: true, hostMinimized: false,
      automation: { ...DEFAULT_POWER_AUTOMATION, blackUnfocused: true }
    })).toBe('black')
  })

  it('does not black out secondary accounts unless that automation is enabled', () => {
    expect(resolveAccountPowerState({ mode: 'auto', accountSelected: false, accountInLayout: true, hostMinimized: false, automation: DEFAULT_POWER_AUTOMATION })).toBe('on')
  })
})
