import { describe, expect, it } from 'vitest'
import { itemSpriteUrl, normalizeItemName } from '../src/renderer/src/item-visuals'

describe('AutoMarket item visuals', () => {
  it('normalizes item names safely', () => {
    expect(normalizeItemName('  Poké Ball  ')).toBe('poke ball')
    expect(normalizeItemName('Hyper_Potion')).toBe('hyper potion')
  })

  it('maps common AutoMarket items to visible sprites', () => {
    expect(itemSpriteUrl('Ultra Ball')).toContain('/ultra-ball.png')
    expect(itemSpriteUrl('Small Potion')).toContain('/potion.png')
    expect(itemSpriteUrl('Hyper Potion')).toContain('/hyper-potion.png')
    expect(itemSpriteUrl('Revive')).toContain('/revive.png')
  })

  it('creates a stable fallback slug for server-provided item names', () => {
    expect(itemSpriteUrl('Mystic Ticket')).toContain('/mystic-ticket.png')
  })
})
