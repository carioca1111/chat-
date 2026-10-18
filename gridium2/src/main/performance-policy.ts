import type { AccountId, PerformanceMode, VisualMode } from '../shared/contracts'

export interface VisualPolicyInput {
  accountId: AccountId
  selectedAccount: AccountId
  visible: boolean
  hostActive: boolean
  performanceMode: PerformanceMode
}

export function resolveVisualMode(input: VisualPolicyInput): VisualMode {
  if (input.performanceMode === 'full') return 'full'
  if (!input.hostActive) return 'eco'
  if (!input.visible) return 'eco'
  return input.accountId === input.selectedAccount ? 'full' : 'eco'
}

export const ECO_VISUAL_CSS = `
*, *::before, *::after {
  animation-play-state: paused !important;
  transition-duration: 0.001ms !important;
  transition-delay: 0ms !important;
  scroll-behavior: auto !important;
}
`
