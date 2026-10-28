import { describe, expect, it } from 'vitest'
import { HeadlessSupplyInference } from '../src/main/headless-supply-inference'

describe('HeadlessSupplyInference', () => {
  it('learns an unnamed potion id from the HP delta without reading UI', () => {
    const infer = new HeadlessSupplyInference()
    const now = Date.now()

    let result = infer.ingest({ t: 'usarItem', itemId: 501 }, now, 'sent')
    expect(result.uses).toHaveLength(0)

    result = infer.ingest({ t: 'batalha', ev: [{ pokemonId: 'active', hpBefore: 2000, hpAfter: 3000, maxHp: 5000 }] }, now + 300, 'received')
    expect(result.learned).toEqual(expect.arrayContaining([{ itemId: '501', name: 'Hyper Potion' }]))
    expect(result.uses).toEqual(expect.arrayContaining([{ itemId: '501', name: 'Hyper Potion', amount: 1, source: 'sent' }]))
  })

  it('learns Revive and Max Revive from fainted-to-alive HP transitions', () => {
    const infer = new HeadlessSupplyInference()
    const now = Date.now()

    infer.ingest({ action: 'usar', itemId: 701 }, now, 'sent')
    let result = infer.ingest({ pokemonId: 'active', hpBefore: 0, hpAfter: 500, maxHp: 5000 }, now + 200, 'received')
    expect(result.learned).toContainEqual({ itemId: '701', name: 'Revive' })

    infer.ingest({ action: 'usar', itemId: 702 }, now + 1_000, 'sent')
    result = infer.ingest({ pokemonId: 'active', hpBefore: 0, hpAfter: 5000, maxHp: 5000 }, now + 1_200, 'received')
    expect(result.learned).toContainEqual({ itemId: '702', name: 'Max Revive' })
  })

  it('uses learned ids to recover stock from an inventory map with no display names', () => {
    const infer = new HeadlessSupplyInference()
    const now = Date.now()

    infer.ingest({ t: 'usarItem', itemId: 501 }, now, 'sent')
    infer.ingest({ hpBefore: 2000, hpAfter: 3000, maxHp: 5000 }, now + 100, 'received')

    const result = infer.ingest({ estado: { inventory: { '501': 384750 } } }, now + 500, 'received')
    expect(result.stock).toContainEqual({ itemId: '501', name: 'Hyper Potion', quantity: 384750 })
  })

  it('does not infer a potion when the heal is capped at max HP and therefore ambiguous', () => {
    const infer = new HeadlessSupplyInference()
    const now = Date.now()

    infer.ingest({ action: 'usar', itemId: 999 }, now, 'sent')
    const result = infer.ingest({ hpBefore: 4500, hpAfter: 5000, maxHp: 5000 }, now + 100, 'received')
    expect(result.learned).toHaveLength(0)
    expect(result.uses).toHaveLength(0)
  })
})
