import { describe, expect, it } from 'vitest'
import { ECO_VISUAL_CSS, resolveVisualMode } from '../src/main/performance-policy'

describe('Gridium 2 visual performance policy', () => {
  it('keeps only the selected visible account in full visuals in auto mode', () => {
    expect(
      resolveVisualMode({
        accountId: 2,
        selectedAccount: 2,
        visible: true,
        hostActive: true,
        performanceMode: 'auto'
      })
    ).toBe('full')

    expect(
      resolveVisualMode({
        accountId: 3,
        selectedAccount: 2,
        visible: true,
        hostActive: true,
        performanceMode: 'auto'
      })
    ).toBe('eco')
  })

  it('puts detached accounts in eco visuals without changing game timers', () => {
    expect(
      resolveVisualMode({
        accountId: 4,
        selectedAccount: 4,
        visible: false,
        hostActive: true,
        performanceMode: 'auto'
      })
    ).toBe('eco')
  })

  it('puts every account in eco visuals while the host window is inactive', () => {
    expect(
      resolveVisualMode({
        accountId: 1,
        selectedAccount: 1,
        visible: true,
        hostActive: false,
        performanceMode: 'auto'
      })
    ).toBe('eco')
  })

  it('leaves all visuals untouched in full quality mode', () => {
    expect(
      resolveVisualMode({
        accountId: 3,
        selectedAccount: 1,
        visible: false,
        hostActive: false,
        performanceMode: 'full'
      })
    ).toBe('full')
  })

  it('never freezes or hides PokeIdle menus and modals in ECO mode', () => {
    const css = ECO_VISUAL_CSS.toLowerCase()
    for (const forbidden of [
      'animation',
      'transition',
      'opacity',
      'visibility',
      'display',
      'pointer-events',
      'transform',
      'filter',
      'backdrop'
    ]) {
      expect(css).not.toContain(forbidden)
    }
  })
})
