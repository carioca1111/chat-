import { describe, expect, it } from 'vitest'
import { HuntSessionRuntime } from '../src/main/hunt-session-runtime'

describe('HuntSessionRuntime headless supply integration', () => {
  it('learns an unnamed potion id from HP and then reads stock from protocol only', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t: 'welcome', estado: { id: 55, huntSlug: 'outland-02', pokemons: [{ id: 1, xp: 100 }] } }, now)
    runtime.ingest({ t: 'usarItem', itemId: 501 }, now + 100, 'sent')
    runtime.ingest({ t: 'batalha', ev: [{ pokemonId: 'active', hpBefore: 2000, hpAfter: 3000, maxHp: 5000 }] }, now + 300, 'received')

    let snapshot = runtime.snapshot(now + 300)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: '501', name: 'Hyper Potion', used: 1 })
    ]))

    runtime.ingest({ t: 'estado', estado: { huntSlug: 'outland-02', inventory: { '501': 384749 } } }, now + 600, 'received')
    snapshot = runtime.snapshot(now + 600)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionStock).toBe(384749)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: '501', name: 'Hyper Potion', quantity: 384749, used: 1 })
    ]))
  })

  it('learns revive ids from fainted HP transitions without counting them as potion consumption', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()
    runtime.ingest({ t: 'welcome', estado: { id: 56, huntSlug: 'outland-02', pokemons: [{ id: 2, xp: 100 }] } }, now)

    runtime.ingest({ t: 'usarItem', itemId: 701 }, now + 100, 'sent')
    runtime.ingest({ t: 'batalha', ev: [{ pokemonId: 'active', hpBefore: 0, hpAfter: 500, maxHp: 5000 }] }, now + 250, 'received')

    const snapshot = runtime.snapshot(now + 250)
    expect(snapshot.potionsUsedTotal).toBe(0)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: '701', name: 'Revive', used: 1 })
    ]))
  })
})
