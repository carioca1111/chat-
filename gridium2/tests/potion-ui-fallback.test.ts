import { describe, expect, it } from 'vitest'
import { HuntSessionRuntime } from '../src/main/hunt-session-runtime'
import { POKEIDLE_UI_SUPPLY_NAMES, POKEIDLE_UI_SUPPLY_SCAN_SCRIPT } from '../src/main/pokeidle-ui-supply-scan'

describe('PokeIdle UI potion/revive fallback', () => {
  it('tracks the exact live UI item names and counts stock decreases as usage', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t: 'welcome', estado: { id: 1, huntSlug: 'outland-02', pokemons: [{ id: 1, xp: 0 }] } }, now)

    runtime.ingestUiConsumables([
      { itemId: 'ui:smallpotion', name: 'Small Potion', quantity: 384_750 },
      { itemId: 'ui:greatpotion', name: 'Great Potion', quantity: 0 },
      { itemId: 'ui:ultrapotion', name: 'Ultra Potion', quantity: 0 },
      { itemId: 'ui:hyperpotion', name: 'Hyper Potion', quantity: 0 },
      { itemId: 'ui:ultimatepotion', name: 'Ultimate Potion', quantity: 0 },
      { itemId: 'ui:goldenpotion', name: 'Golden Potion', quantity: 9_998 },
      { itemId: 'ui:revive', name: 'Revive', quantity: 10_292 },
      { itemId: 'ui:maxrevive', name: 'Max Revive', quantity: 0 }
    ], now + 500)

    let snapshot = runtime.snapshot(now + 500)
    expect(snapshot.potionStock).toBe(394_748)
    expect(snapshot.potionsUsedTotal).toBe(0)
    expect(snapshot.potionItems.map((item) => [item.name, item.quantity])).toEqual(expect.arrayContaining([
      ['Small Potion', 384_750],
      ['Golden Potion', 9_998],
      ['Revive', 10_292],
      ['Max Revive', 0]
    ]))

    runtime.ingestUiConsumables([
      { itemId: 'ui:smallpotion', name: 'Small Potion', quantity: 384_748 },
      { itemId: 'ui:goldenpotion', name: 'Golden Potion', quantity: 9_997 },
      { itemId: 'ui:revive', name: 'Revive', quantity: 10_291 }
    ], now + 2_000)

    snapshot = runtime.snapshot(now + 2_000)
    expect(snapshot.potionStock).toBe(394_745)
    expect(snapshot.potionsUsedTotal).toBe(3)
    expect(snapshot.potionsUsedLastHour).toBe(3)
    expect(snapshot.potionItems.find((item) => item.name === 'Small Potion')?.used).toBe(2)
    expect(snapshot.potionItems.find((item) => item.name === 'Golden Potion')?.used).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.used).toBe(1)
  })

  it('contains the exact PokeIdle labels supplied by the live automation UI', () => {
    expect(POKEIDLE_UI_SUPPLY_NAMES).toEqual([
      'Small Potion', 'Great Potion', 'Ultra Potion', 'Hyper Potion',
      'Ultimate Potion', 'Golden Potion', 'Revive', 'Max Revive'
    ])
    for (const name of POKEIDLE_UI_SUPPLY_NAMES) expect(POKEIDLE_UI_SUPPLY_SCAN_SCRIPT).toContain(name)
    expect(POKEIDLE_UI_SUPPLY_SCAN_SCRIPT).toContain('data-tooltip')
    expect(POKEIDLE_UI_SUPPLY_SCAN_SCRIPT).toContain('aria-label')
    expect(POKEIDLE_UI_SUPPLY_SCAN_SCRIPT).toContain("element.getAttribute('src')")
  })
})
