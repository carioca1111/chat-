import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HuntSessionRuntime } from '../src/main/hunt-session-runtime'
import { canonicalPokeIdleItem, POKEIDLE_ITEM_CATALOG } from '../src/shared/pokeidle-item-catalog'

describe('PokeIdle potion/revive network state', () => {
  it('uses the exact live potion and revive names without Golden Potion', () => {
    expect(POKEIDLE_ITEM_CATALOG.potions.map((item) => item.name)).toEqual([
      'Small Potion', 'Great Potion', 'Ultra Potion', 'Hyper Potion', 'Ultimate Potion'
    ])
    expect(POKEIDLE_ITEM_CATALOG.revives.map((item) => item.name)).toEqual(['Revive', 'Max Revive'])
    expect(canonicalPokeIdleItem('smallPotion')?.name).toBe('Small Potion')
    expect(canonicalPokeIdleItem('greatPotion')?.name).toBe('Great Potion')
    expect(canonicalPokeIdleItem('ultraPotion')?.name).toBe('Ultra Potion')
    expect(canonicalPokeIdleItem('hyperPotion')?.name).toBe('Hyper Potion')
    expect(canonicalPokeIdleItem('ultimatePotion')?.name).toBe('Ultimate Potion')
    expect(canonicalPokeIdleItem('maxRevive')?.name).toBe('Max Revive')
    expect(canonicalPokeIdleItem('Golden Potion')).toBeNull()
  })

  it('reads compact inventory keys and counts stock drops while the automation UI is irrelevant', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t: 'welcome', estado: {
      id: 1,
      huntSlug: 'outland-02',
      pokemons: [{ id: 10, xp: 0 }],
      inventory: {
        smallPotion: 384_750,
        greatPotion: 0,
        ultraPotion: 0,
        hyperPotion: 0,
        ultimatePotion: 9_998,
        revive: 10_292,
        maxRevive: 0
      }
    } }, now)

    let snapshot = runtime.snapshot(now)
    expect(snapshot.potionStock).toBe(394_748)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Small Potion', quantity: 384_750 }),
      expect.objectContaining({ name: 'Ultimate Potion', quantity: 9_998 }),
      expect.objectContaining({ name: 'Revive', quantity: 10_292 }),
      expect.objectContaining({ name: 'Max Revive', quantity: 0 })
    ]))

    runtime.ingest({ t: 'estado', estado: {
      huntSlug: 'outland-02',
      inventory: {
        smallPotion: 384_748,
        ultimatePotion: 9_997,
        revive: 10_291,
        maxRevive: 0
      }
    } }, now + 2_000)

    snapshot = runtime.snapshot(now + 2_000)
    expect(snapshot.potionsUsedTotal).toBe(3)
    expect(snapshot.potionsUsedLastHour).toBe(3)
    expect(snapshot.potionItems.find((item) => item.name === 'Small Potion')?.used).toBe(2)
    expect(snapshot.potionItems.find((item) => item.name === 'Ultimate Potion')?.used).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.used).toBe(1)
  })

  it('learns the current live catalog from effect/price metadata when names are omitted', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t: 'welcome', estado: {
      id: 2,
      huntSlug: 'route-current-catalog',
      pokemons: [{ id: 20, xp: 0 }],
      catalog: [
        { id: 101, category: 'potion', effect: 'Cura 20 HP', price: 20 },
        { id: 102, category: 'potion', effect: 'Cura 40 HP', price: 50 },
        { id: 103, category: 'potion', effect: 'Cura 80 HP', price: 125 },
        { id: 104, category: 'potion', effect: 'Cura 100 HP', price: 175 },
        { id: 105, category: 'potion', effect: 'Cura 120 HP', price: 240 },
        { id: 201, category: 'revive', effect: 'Revive com 50% do HP', price: 100 },
        { id: 202, category: 'revive', effect: 'Revive com 100% do HP', price: 350 }
      ],
      inventory: [
        { itemId: 101, quantity: 12 },
        { itemId: 102, quantity: 11 },
        { itemId: 103, quantity: 10 },
        { itemId: 104, quantity: 9 },
        { itemId: 105, quantity: 8 },
        { itemId: 201, quantity: 7 },
        { itemId: 202, quantity: 6 }
      ]
    } }, now)

    const names = runtime.snapshot(now).potionItems.map((item) => item.name)
    expect(names).toEqual(expect.arrayContaining([
      'Small Potion', 'Great Potion', 'Ultra Potion', 'Hyper Potion', 'Ultimate Potion', 'Revive', 'Max Revive'
    ]))
  })

  it('monitors JSON XHR/fetch and PokeIdle subdomains in addition to WebSocket frames', () => {
    const source = readFileSync(new URL('../src/main/account-runtime.ts', import.meta.url), 'utf8')
    expect(source).toContain("Network.requestWillBeSent")
    expect(source).toContain("Network.responseReceived")
    expect(source).toContain("Network.loadingFinished")
    expect(source).toContain("Network.getResponseBody")
    expect(source).toContain("resourceType === 'XHR'")
    expect(source).toContain("resourceType === 'Fetch'")
    expect(source).toContain("host.endsWith('.pokeidle.io')")
    expect(source).toContain("this.ingestNetworkJson(account, postData")
  })
})
