import { describe, expect, it } from 'vitest'
import { HuntSessionRuntime } from '../src/main/hunt-session-runtime'

describe('HuntSessionRuntime', () => {
  it('preserves the Hunt across reload/reconnect and resets only on a real Hunt exit or switch', () => {
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

    const beforeReconnect = runtime.snapshot(now + 2_000)
    expect(beforeReconnect.huntSlug).toBe('outland-02')
    expect(beforeReconnect.capturesTotal).toBe(1)
    expect(beforeReconnect.capturesByPotency).toEqual([0,0,0,0,1])
    expect(beforeReconnect.shiniesSeen).toBe(1)
    expect(beforeReconnect.shiniesCaught).toBe(1)
    expect(beforeReconnect.killsEstimatedTotal).toBe(1)
    expect(beforeReconnect.potionStock).toBe(10)
    expect(beforeReconnect.potionsUsedTotal).toBe(2)

    // AccountRuntime calls reset() on page reload/debugger transport loss.
    // This must never end an active Hunt Control session.
    runtime.reset(now + 3_000)
    const afterTransportReset = runtime.snapshot(now + 3_000)
    expect(afterTransportReset.sessionStartedAt).toBe(beforeReconnect.sessionStartedAt)
    expect(afterTransportReset.huntSlug).toBe('outland-02')
    expect(afterTransportReset.capturesTotal).toBe(1)
    expect(afterTransportReset.killsEstimatedTotal).toBe(1)
    expect(afterTransportReset.potionsUsedTotal).toBe(2)

    // A fresh welcome for the same Hunt re-baselines volatile state without
    // clearing counters or recounting existing Pokémon as captures. Different
    // case/separator formatting is treated as the same canonical Hunt identity.
    runtime.ingest({ t: 'welcome', estado: {
      id: 77, huntSlug: 'OUTLAND-02', shiniesSeen: 11,
      pokemons: [{ id: 1, xp: 140, potencia: 2 }, { id: 2, xp: 0, potencia: 5, shiny: true }],
      inventory: [{ id: 501, name: 'Ultra Potion', quantity: 10 }]
    } }, now + 4_000)

    const afterReconnect = runtime.snapshot(now + 4_000)
    expect(afterReconnect.sessionStartedAt).toBe(beforeReconnect.sessionStartedAt)
    expect(afterReconnect.capturesTotal).toBe(1)
    expect(afterReconnect.killsEstimatedTotal).toBe(1)
    expect(afterReconnect.potionsUsedTotal).toBe(2)

    // No Hunt field means incomplete/partial state, not an exit.
    runtime.ingest({ t: 'estado', estado: { pkMud: [{ id: 1, xp: 150 }] } }, now + 5_000)
    expect(runtime.snapshot(now + 5_000).huntSlug).toBeTruthy()

    // Explicit empty Hunt is the real exit signal and is the point where the
    // session must reset.
    runtime.ingest({ t: 'estado', estado: { huntSlug: '' } }, now + 6_000)
    const afterExit = runtime.snapshot(now + 6_000)
    expect(afterExit.huntSlug).toBe('')
    expect(afterExit.capturesTotal).toBe(0)
    expect(afterExit.killsEstimatedTotal).toBe(0)
    expect(afterExit.potionsUsedTotal).toBe(0)
    expect(afterExit.potionStock).toBe(0)

    // Entering a new Hunt starts a clean session at the entry timestamp.
    runtime.ingest({ t: 'estado', estado: {
      huntSlug: 'forest-new', shiniesSeen: 11,
      pkMud: [{ id: 3, xp: 0, potencia: 3 }],
      inventory: [{ id: 501, name: 'Ultra Potion', quantity: 10 }]
    } }, now + 7_000)
    const newHunt = runtime.snapshot(now + 7_000)
    expect(newHunt.huntSlug).toBe('forest-new')
    expect(newHunt.sessionStartedAt).toBe(now + 7_000)
    expect(newHunt.capturesTotal).toBe(0)
  })

  it('treats a direct Hunt switch as leaving the previous Hunt', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t: 'welcome', estado: {
      id: 1, huntSlug: 'route-a', pokemons: [{ id: 10, xp: 0 }]
    } }, now)
    runtime.ingest({ t: 'estado', estado: {
      huntSlug: 'route-a', pkMud: [{ id: 11, xp: 0, potencia: 4 }]
    } }, now + 1_000)
    expect(runtime.snapshot(now + 1_000).capturesTotal).toBe(1)

    runtime.ingest({ t: 'estado', estado: {
      huntSlug: 'route-b', pkMud: [{ id: 20, xp: 0, potencia: 5 }]
    } }, now + 2_000)

    const afterSwitch = runtime.snapshot(now + 2_000)
    expect(afterSwitch.huntSlug).toBe('route-b')
    expect(afterSwitch.sessionStartedAt).toBe(now + 2_000)
    expect(afterSwitch.capturesTotal).toBe(0)
  })
})
