import { describe, expect, it } from 'vitest'
import { PanelAnalyticsTracker, isRareItemName } from '../src/main/panel-analytics-runtime'

describe('PanelAnalyticsTracker', () => {
  it('uses welcome as baseline and counts only new pokemon ids', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [{ id: 1, potencia: 2, nota: 3.2, quality: 1.2 }] }, true, 1_000)
    expect(tracker.snapshot(1_000).capturesTotal).toBe(0)

    tracker.ingestState({ pkMud: [{ id: 2, speciesName: 'Blastoise', potencia: 3, nota: 3.7, quality: 1.4 }] }, false, 2_000)
    const snap = tracker.snapshot(2_000)
    expect(snap.capturesTotal).toBe(1)
    expect(snap.capturesByPotency).toEqual([0,0,1,0,0])
    expect(snap.noteBands).toEqual([0,0,0,0,1,0,0,0])
    expect(snap.note35Plus).toBe(1)
  })

  it('does not double count updates to an existing pokemon', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [] }, true, 1_000)
    tracker.ingestState({ pkMud: [{ id: 'abc', potencia: 5 }] }, false, 2_000)
    tracker.ingestState({ pkMud: [{ id: 'abc', level: 10 }] }, false, 3_000)
    expect(tracker.snapshot(3_000).capturesTotal).toBe(1)
    expect(tracker.snapshot(3_000).capturesByPotency[4]).toBe(1)
  })

  it('counts shiny caught only from a confirmed new capture', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [] }, true, 1_000)
    tracker.ingestState({ pkMud: [{ id: 5, speciesName: 'Gengar', shiny: true, potencia: 4 }] }, false, 2_000)
    const snap = tracker.snapshot(2_000)
    expect(snap.shiniesCaught).toBe(1)
    expect(snap.events[0].accountEvent).toBe('shiny-caught')
  })

  it('keeps shiny seen unknown unless the server exposes an explicit counter', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [] }, true, 1_000)
    expect(tracker.snapshot(1_000).shiniesSeen).toBeNull()
    tracker.ingestState({ shiniesSeen: 7 }, false, 2_000)
    expect(tracker.snapshot(2_000).shiniesSeen).toBe(7)
  })

  it('tracks rare inventory increases but ignores common consumables', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ items: [{ id: 10, name: 'Boss Token', qtd: 2 }, { id: 20, name: 'Ultra Potion', qtd: 50 }] }, true, 1_000)
    tracker.ingestState({ items: [{ id: 10, name: 'Boss Token', qtd: 4 }, { id: 20, name: 'Ultra Potion', qtd: 70 }] }, false, 2_000)
    const snap = tracker.snapshot(2_000)
    expect(snap.rareItemsTotal).toBe(2)
    expect(snap.rareItems[0]).toMatchObject({ name: 'Boss Token', quantity: 2 })
    expect(isRareItemName('Ultra Potion')).toBe(false)
    expect(isRareItemName('TM Rara')).toBe(true)
  })

  it('counts only captures inside the last hour for capturesLastHour', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [] }, true, 0)
    tracker.ingestState({ pkMud: [{ id: 1 }] }, false, 1_000)
    tracker.ingestState({ pkMud: [{ id: 2 }] }, false, 3_599_000)
    expect(tracker.snapshot(3_600_000).capturesLastHour).toBe(2)
    expect(tracker.snapshot(3_602_000).capturesLastHour).toBe(1)
  })
})
