import { describe, expect, it } from 'vitest'
import { AUTO_MARKET_VISUAL_PRESETS } from '../src/renderer/src/automarket-presets'
import { normalizeItemName } from '../src/renderer/src/item-visuals'
import { MARKET_BRIDGE_SOURCE } from '../src/main/market-bridge'
import { POKEIDLE_AUTO_MARKET_CATALOG } from '../src/shared/pokeidle-item-catalog'

describe('AutoMarket PokeIdle catalog', () => {
  it('contains exactly the items shown by the current PokeIdle Market', () => {
    expect(AUTO_MARKET_VISUAL_PRESETS.balls.map((x) => x.name)).toEqual(['Poké Ball','Great Ball','Super Ball','Ultra Ball'])
    expect(AUTO_MARKET_VISUAL_PRESETS.potions.map((x) => x.name)).toEqual(['Small Potion','Great Potion','Ultra Potion','Hyper Potion','Ultimate Potion','Golden Potion'])
    expect(AUTO_MARKET_VISUAL_PRESETS.revives.map((x) => x.name)).toEqual(['Revive','Max Revive'])
    expect(AUTO_MARKET_VISUAL_PRESETS).toEqual(POKEIDLE_AUTO_MARKET_CATALOG)
  })

  it('does not ship generic Pokemon items that are absent from PokeIdle', () => {
    const names = Object.values(AUTO_MARKET_VISUAL_PRESETS).flat().map((x) => x.name)
    for (const invalid of ['Beast Ball','Master Ball','Premier Ball','Potion','Super Potion','Max Potion','Full Restore']) {
      expect(names).not.toContain(invalid)
    }
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

  it('keeps the validated market.itens detail read without changing transactions', () => {
    expect(MARKET_BRIDGE_SOURCE).toContain("payload.t === 'market.item'")
    expect(MARKET_BRIDGE_SOURCE).toContain("t: 'market.itens'")
    expect(MARKET_BRIDGE_SOURCE).toContain('elemento: Number(payload.itemId)')
    expect(MARKET_BRIDGE_SOURCE).not.toContain("payload.t === 'market.comprar'")
  })
})
