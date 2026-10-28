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

    runtime.reset(now + 3_000)
    const afterTransportReset = runtime.snapshot(now + 3_000)
    expect(afterTransportReset.sessionStartedAt).toBe(beforeReconnect.sessionStartedAt)
    expect(afterTransportReset.huntSlug).toBe('outland-02')
    expect(afterTransportReset.capturesTotal).toBe(1)
    expect(afterTransportReset.killsEstimatedTotal).toBe(1)
    expect(afterTransportReset.potionsUsedTotal).toBe(2)

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

    runtime.ingest({ t: 'estado', estado: { pkMud: [{ id: 1, xp: 150 }] } }, now + 5_000)
    expect(runtime.snapshot(now + 5_000).huntSlug).toBeTruthy()

    runtime.ingest({ t: 'estado', estado: { huntSlug: '' } }, now + 6_000)
    const afterExit = runtime.snapshot(now + 6_000)
    expect(afterExit.huntSlug).toBe('')
    expect(afterExit.capturesTotal).toBe(0)
    expect(afterExit.killsEstimatedTotal).toBe(0)
    expect(afterExit.potionsUsedTotal).toBe(0)
    expect(afterExit.potionStock).toBe(0)

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

  it('recognizes nested shiny capture flags and explicit shiny encounter events without duplicate seen counts', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t:'welcome', estado:{ id:9, huntSlug:'route-shiny', pokemons:[{ id:1, xp:0 }] } }, now)
    runtime.ingest({ t:'batalha', ev:[{ k:'shinyEncontrado', encounterId:'enc-1', pokemon:{ variant:'shiny' } }] }, now + 1_000)
    runtime.ingest({ t:'batalha', ev:[{ k:'shinyEncontrado', encounterId:'enc-1', pokemon:{ variant:'shiny' } }] }, now + 1_100)
    runtime.ingest({ t:'estado', estado:{ huntSlug:'route-shiny', pkMud:[{ id:2, xp:0, potencia:3, flags:{ isShiny:true } }] } }, now + 2_000)

    const snapshot = runtime.snapshot(now + 2_000)
    expect(snapshot.shiniesSeen).toBe(1)
    expect(snapshot.shiniesCaught).toBe(1)
  })

  it('adopts the first server Hunt without erasing migrated first-boot counters', () => {
    const now = Date.now()
    const startedAt = now - (34 * 60 + 37) * 60 * 1000
    const runtime = new HuntSessionRuntime({
      version: 1,
      huntSlug: '',
      accountId: '',
      sessionStartedAt: startedAt,
      capturesTotal: 723,
      capturesByPotency: [537,143,37,5,1],
      shiniesSeen: 0,
      shiniesSeenBaseline: null,
      shiniesCaught: 0,
      killsEstimatedTotal: 49_236,
      potionsUsedTotal: 0,
      lastCaptureAt: now - 30_000,
      updatedAt: now,
      captureTimes: [],
      killTimes: [],
      potionUseEvents: [],
      potionItems: []
    })

    runtime.ingest({ t:'welcome', estado:{ id:77, huntSlug:'outland-02', shiniesSeen:20, pokemons:[{ id:1, xp:100 }] } }, now + 1_000)
    const restored = runtime.snapshot(now + 1_000)

    expect(restored.huntSlug).toBe('outland-02')
    expect(restored.sessionStartedAt).toBe(startedAt)
    expect(restored.capturesTotal).toBe(723)
    expect(restored.capturesByPotency).toEqual([537,143,37,5,1])
    expect(restored.killsEstimatedTotal).toBe(49_236)
    expect(restored.shiniesSeen).toBe(0)
  })

  it('tracks nested slug/key potion and revive inventory while counting potion use separately', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t: 'welcome', estado: {
      id: 42,
      huntSlug: 'outland-02',
      pokemons: [{ id: 1, xp: 100 }],
      player: {
        backpack: {
          consumables: {
            smallPotion: { key: 'small-potion', qty: 20 },
            revive: { slug: 'revive', count: 8 },
            maxRevive: { item: { slug: 'max-revive' }, quantity: 2 }
          }
        }
      }
    } }, now)

    let snapshot = runtime.snapshot(now)
    expect(snapshot.potionStock).toBe(20)
    expect(snapshot.potionsUsedTotal).toBe(0)
    expect(snapshot.potionItems.map((item) => [item.name, item.quantity, item.used])).toEqual(expect.arrayContaining([
      ['Small Potion', 20, 0],
      ['Revive', 8, 0],
      ['Max Revive', 2, 0]
    ]))

    runtime.ingest({ t: 'estado', estado: {
      huntSlug: 'outland-02',
      player: {
        backpack: {
          consumables: {
            smallPotion: { key: 'small-potion', qty: 17 },
            revive: { slug: 'revive', count: 7 },
            maxRevive: { item: { slug: 'max-revive' }, quantity: 2 }
          }
        }
      }
    } }, now + 10_000)

    snapshot = runtime.snapshot(now + 10_000)
    expect(snapshot.potionStock).toBe(17)
    expect(snapshot.potionsUsedTotal).toBe(3)
    expect(snapshot.potionsUsedLastHour).toBe(3)
    expect(snapshot.potionItems.find((item) => item.name === 'Small Potion')?.used).toBe(3)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.used).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.used).toBe(0)
  })

  it('counts the real PokeIdle bola shiny roll and does not double-count pkMud', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t:'welcome', estado:{ id:5, huntSlug:'forest', pokemons:[{ id:1, xp:0 }] } }, now)
    runtime.ingest({ t:'batalha', ev:[
      { k:'bola', slot:0, ballId:3, shiny:true, sucesso:false },
      { k:'fugiu', nome:'Charmander' }
    ] }, now + 1_000)

    let snapshot = runtime.snapshot(now + 1_000)
    expect(snapshot.shiniesSeen).toBe(1)
    expect(snapshot.shiniesCaught).toBe(0)

    runtime.ingest({ t:'batalha', ev:[
      { k:'bola', slot:0, ballId:3, shiny:true, sucesso:true },
      { k:'capturado', pokemon:{ id:2, speciesId:4, nome:'Charmander', shiny:true } }
    ] }, now + 2_000)

    snapshot = runtime.snapshot(now + 2_000)
    expect(snapshot.shiniesSeen).toBe(2)
    expect(snapshot.shiniesCaught).toBe(1)

    runtime.ingest({ t:'estado', estado:{ huntSlug:'forest', pkMud:[{ id:2, xp:0, potencia:3, shiny:true }] } }, now + 2_100)
    snapshot = runtime.snapshot(now + 2_100)
    expect(snapshot.capturesTotal).toBe(1)
    expect(snapshot.shiniesSeen).toBe(2)
    expect(snapshot.shiniesCaught).toBe(1)
  })

  it('resolves numeric bolsa item ids from a server catalog and tracks separate inventory packets', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({
      t: 'welcome',
      catalogoItens: [
        { id: 501, nome: 'Ultra Potion' },
        { id: 601, nome: 'Revive' }
      ],
      estado: {
        id: 90,
        huntSlug: 'outland-02',
        pokemons: [{ id: 1, xp: 0 }],
        bolsa: { 501: 12, 601: 4 }
      }
    }, now)

    let snapshot = runtime.snapshot(now)
    expect(snapshot.potionStock).toBe(12)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: '501', name: 'Ultra Potion', quantity: 12, used: 0 }),
      expect.objectContaining({ itemId: '601', name: 'Revive', quantity: 4, used: 0 })
    ]))

    runtime.ingest({ t: 'inventario', bolsa: { 501: 10, 601: 3 } }, now + 1_000)
    snapshot = runtime.snapshot(now + 1_000)
    expect(snapshot.potionStock).toBe(10)
    expect(snapshot.potionsUsedTotal).toBe(2)
    expect(snapshot.potionItems.find((item) => item.name === 'Ultra Potion')?.used).toBe(2)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.quantity).toBe(3)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.used).toBe(1)
  })

  it('counts confirmed potion/revive battle use and reconciles a later inventory delta without double count', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({
      t: 'welcome',
      itemCatalog: [
        { itemId: 501, name: 'Ultra Potion' },
        { itemId: 601, name: 'Max Revive' }
      ],
      estado: {
        id: 91,
        huntSlug: 'forest',
        pokemons: [{ id: 1, xp: 0 }],
        inventory: { 501: 10, 601: 3 }
      }
    }, now)

    runtime.ingest({ t: 'batalha', ev: [
      { k: 'itemUsado', itemId: 501, used: 1 },
      { k: 'reviveUsado', itemId: 601, used: 1 }
    ] }, now + 1_000)

    let snapshot = runtime.snapshot(now + 1_000)
    expect(snapshot.potionStock).toBe(9)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.quantity).toBe(2)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.used).toBe(1)

    runtime.ingest({ t: 'estado', estado: { huntSlug: 'forest', inventory: { 501: 9, 601: 2 } } }, now + 1_500)
    snapshot = runtime.snapshot(now + 1_500)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Ultra Potion')?.used).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.used).toBe(1)
  })

  it('reconciles state-first consumption with a later battle event', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()
    runtime.ingest({ t:'welcome', catalogoItens:[{ id:501, nome:'Great Potion' }], estado:{ id:92, huntSlug:'forest', pokemons:[{ id:1, xp:0 }], bolsa:{ 501:5 } } }, now)
    runtime.ingest({ t:'inventario', bolsa:{ 501:4 } }, now + 1_000)
    runtime.ingest({ t:'batalha', ev:[{ k:'pocaoUsada', itemId:501, consumed:1 }] }, now + 1_500)
    const snapshot = runtime.snapshot(now + 1_500)
    expect(snapshot.potionStock).toBe(4)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Great Potion')?.used).toBe(1)
  })
})
