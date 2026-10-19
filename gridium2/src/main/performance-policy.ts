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

// ECO must never alter opacity, visibility, transforms, filters, pointer events,
// animations or transitions inside PokeIdle. Several game menus use those
// properties as part of their open/close state, so overriding them can freeze
// a modal on its transparent first frame. Rendering savings come from Electron
// view detachment/background throttling; this CSS is intentionally harmless.
export const ECO_VISUAL_CSS = `
html {
  scroll-behavior: auto !important;
}
`
