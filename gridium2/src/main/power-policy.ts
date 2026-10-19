import type { AccountPowerMode, EffectivePowerState, PowerAutomationSettings } from '../shared/contracts'

export const DEFAULT_POWER_AUTOMATION: PowerAutomationSettings = {
  blackUnfocused: false,
  blackWhenMinimized: true,
  wakeOnSelect: true
}

export interface PowerPolicyInput {
  mode: AccountPowerMode
  accountSelected: boolean
  accountInLayout: boolean
  hostMinimized: boolean
  automation: PowerAutomationSettings
}

export function resolveAccountPowerState(input: PowerPolicyInput): EffectivePowerState {
  if (input.mode === 'suspended') return 'suspended'
  if (input.mode === 'black') return 'black'
  if (input.mode === 'on') return 'on'

  if (input.hostMinimized && input.automation.blackWhenMinimized) return 'black'
  if (input.accountSelected && input.automation.wakeOnSelect) return 'on'
  if (input.accountInLayout && !input.accountSelected && input.automation.blackUnfocused) return 'black'
  return 'on'
}
