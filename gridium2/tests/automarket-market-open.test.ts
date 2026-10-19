import { describe, expect, it } from 'vitest'
import { MARKET_BRIDGE_SOURCE } from '../src/main/market-bridge'

describe('AutoMarket Market menu navigation', () => {
  it('waits for the game menu to settle before activating Market', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain('await sleep(220)')
    expect(MARKET_BRIDGE_SOURCE).toContain('marketMenuTarget')
  })

  it('retries Market activation instead of getting stuck on the menu', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain('for (let attempt = 0; attempt < 4; attempt += 1)')
    expect(MARKET_BRIDGE_SOURCE).toContain('macro-market-click-no-navigation')
  })

  it('has a real pointer/mouse fallback for the Market card', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain("new MouseEvent('click'")
    expect(MARKET_BRIDGE_SOURCE).toContain("new PointerEvent('pointerdown'")
  })
})
