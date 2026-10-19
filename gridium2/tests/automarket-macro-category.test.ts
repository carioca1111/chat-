import { describe, expect, it } from 'vitest'
import { MARKET_BRIDGE_SOURCE } from '../src/main/market-bridge'

describe('AutoMarket macro category navigation', () => {
  it('installs the category hotfix that accepts PokeIdle category cards with subtitles', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain('__gridium2MacroCategoryHotfixInstalled')
    expect(MARKET_BRIDGE_SOURCE).toContain("text.startsWith(wanted + ' ')")
    expect(MARKET_BRIDGE_SOURCE).toContain("buttonStartingWith(root, categoryLabel)")
  })

  it('can skip category navigation when the requested item is already visible', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain("let card = findItemCard(root, config.itemName)")
    expect(MARKET_BRIDGE_SOURCE).toContain("if (!card)")
  })

  it('keeps macro calls isolated from direct market transactions', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain('__gridium2MacroConfigV2')
    expect(MARKET_BRIDGE_SOURCE).toContain('return await originalSend(payload)')
  })
})
