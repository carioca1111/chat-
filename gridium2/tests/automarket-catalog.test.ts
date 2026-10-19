import { describe, expect, it } from 'vitest'
import { AUTO_MARKET_VISUAL_PRESETS } from '../src/renderer/src/automarket-presets'
import { normalizeItemName } from '../src/renderer/src/item-visuals'
import { MARKET_BRIDGE_SOURCE } from '../src/main/market-bridge'

describe('AutoMarket visual catalog', () => {
  it('ships visible names for every replenishment category', () => {
    expect(AUTO_MARKET_VISUAL_PRESETS.balls.map((x) => x.name)).toContain('Ultra Ball')
    expect(AUTO_MARKET_VISUAL_PRESETS.potions.map((x) => x.name)).toContain('Ultra Potion')
    expect(AUTO_MARKET_VISUAL_PRESETS.revives.map((x) => x.name)).toContain('Revive')
    expect(Object.values(AUTO_MARKET_VISUAL_PRESETS).every((rows) => rows.length > 0)).toBe(true)
  })

  it('does not embed or pretend to know PokeIdle server item IDs', () => {
    for (const rows of Object.values(AUTO_MARKET_VISUAL_PRESETS)) {
      for (const item of rows) {
        expect(item.name.trim().length).toBeGreaterThan(0)
        expect(item.key).not.toMatch(/^\d+$/)
        expect(normalizeItemName(item.name)).not.toMatch(/^item #/)
        expect('itemId' in item).toBe(false)
      }
    }
  })

  it('uses the previously validated market.itens detail read without changing transactions', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain("payload.t === 'market.item'")
    expect(MARKET_BRIDGE_SOURCE).toContain("t: 'market.itens'")
    expect(MARKET_BRIDGE_SOURCE).toContain('elemento: Number(payload.itemId)')
    expect(MARKET_BRIDGE_SOURCE).not.toContain("payload.t === 'market.comprar'")
  })
})
