import { describe, expect, it } from 'vitest'
import { itemSpriteUrl, normalizeItemName } from '../src/renderer/src/item-visuals'

describe('PokeIdle item visuals', () => {
  it('normalizes PokeIdle item names safely', () => {
    expect(normalizeItemName('  Poké Ball  ')).toBe('poke ball')
    expect(normalizeItemName('Ultimate_Potion')).toBe('ultimate potion')
  })

  it('ships local visual data for supported item families', () => {
    for (const name of ['Poké Ball','Great Ball','Super Ball','Ultra Ball','Small Potion','Great Potion','Ultra Potion','Hyper Potion','Ultimate Potion','Golden Potion','Revive','Max Revive']) {
      expect(itemSpriteUrl(name)).toMatch(/^data:image\/svg\+xml,/)
    }
  })

  it('does not create generic or PokeAPI fallbacks for unknown items', () => {
    expect(itemSpriteUrl('Beast Ball')).toBe('')
    expect(itemSpriteUrl('Master Ball')).toBe('')
    expect(itemSpriteUrl('Super Potion')).toBe('')
    expect(itemSpriteUrl('Mystic Ticket')).toBe('')
  })
})