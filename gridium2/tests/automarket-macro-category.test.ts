import { describe, expect, it } from 'vitest'
import { MARKET_BRIDGE_SOURCE } from '../src/main/market-bridge'

describe('AutoMarket macro category navigation', () => {
  it('does not require category button text to be an exact leaf match', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain("buttonStartingWith(root, categoryLabel)")
    expect(MARKET_BRIDGE_SOURCE).not.toContain("if (!clickExact(root, categoryLabel))")
  })

  it('can skip category navigation when the requested item is already visible', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain("let card = findItemCard(root, config.itemName)")
    expect(MARKET_BRIDGE_SOURCE).toContain("if (!card)")
  })
})
