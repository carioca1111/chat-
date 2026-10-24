import { describe, expect, it } from 'vitest'
import { HuntSessionRuntime } from '../src/main/hunt-session-runtime'

describe('HuntSessionRuntime', () => {
  it('tracks compact Hunt counters and resets when the Hunt changes', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t: 'welcome', estado: {
      id: 77, huntSlug: 'outland-02', shiniesSeen: 10,
      pokemons: [{ id: 1, xp: 100, potencia: 2 }],
      inventory: [{ id: 501, name: 'Ultra Potion', quantity: 12 }]
    } }, now)

    runtime.ingest({ t: 'estado', estado: {
      huntSlug: 'outland-02', shiniesSeen: 11,
      pkMud: [{ id: 2, xp: 0, potencia: 5, shiny: true }],
      inventory: [{ id: 501, name: 'Ultra Potion', quantity: 10 }]
    } }, now + 1_000)

    runtime.ingest({ t: 'estado', estado: {
      huntSlug: 'outland-02', pkMud: [{ id: 1, xp: 140 }]
    } }, now + 2_000)

    const snapshot = runtime.snapshot(now + 2_000)
    expect(snapshot.huntSlug).toBe('outland-02')
    expect(snapshot.capturesTotal).toBe(1)
    expect(snapshot.capturesByPotency).toEqual([0,0,0,0,1])
    expect(snapshot.shiniesSeen).toBe(1)
    expect(snapshot.shiniesCaught).toBe(1)
    expect(snapshot.killsEstimatedTotal).toBe(1)
    expect(snapshot.potionStock).toBe(10)
    expect(snapshot.potionsUsedTotal).toBe(2)
    expect(snapshot.potionsUsedLastHour).toBe(2)

    runtime.ingest({ t: 'estado', estado: {
      huntSlug: 'forest-new', shiniesSeen: 11,
      pkMud: [{ id: 3, xp: 0, potencia: 3 }],
      inventory: [{ id: 501, name: 'Ultra Potion', quantity: 10 }]
    } }, now + 3_000)

    const afterSwitch = runtime.snapshot(now + 3_000)
    expect(afterSwitch.huntSlug).toBe('forest-new')
    expect(afterSwitch.capturesTotal).toBe(0)
    expect(afterSwitch.killsEstimatedTotal).toBe(0)
    expect(afterSwitch.potionsUsedTotal).toBe(0)
    expect(afterSwitch.shiniesSeen).toBe(0)
    expect(afterSwitch.potionStock).toBe(10)

    runtime.reset(now + 4_000)
    const afterReset = runtime.snapshot(now + 4_000)
    expect(afterReset.huntSlug).toBe('')
    expect(afterReset.potionStock).toBe(0)
  })
})
