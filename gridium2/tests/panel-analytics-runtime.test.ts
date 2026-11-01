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

it('counts catalogued tokens across state and bolsa packets without counting starting stock or duplicate balances', () => {
  const tracker = new PanelAnalyticsTracker()
  tracker.learnCatalog({ catalogoItens: [{ id: 73, nome: 'Boss Token' }] })
  tracker.ingestState({}, true)
  const stock = (q: number) => tracker.ingestPacket({ t: 'inventario', bolsa: { 73: q } })
  stock(10)
  stock(11)
  tracker.ingestState({ bolsa: { 73: 11 } }, false)
  stock(4)
  stock(6)
  expect(tracker.snapshot().rareItems).toEqual([{ itemId: '73', name: 'Boss Token', quantity: 3 }])
  expect(new PanelAnalyticsTracker({ initial: tracker.persisted() }).snapshot().rareItemsTotal).toBe(3)
})

it('counts a scalar Boss Token balance once when the bag reports the same balance', () => {
  const tracker = new PanelAnalyticsTracker()
  tracker.ingestState({ bossTokens: 8 }, true)
  tracker.ingestState({ bossTokens: 9 }, false)
  tracker.ingestPacket({ t: 'inventario', bolsa: { 'boss-token': 9 } })
  expect(tracker.snapshot().rareItemsTotal).toBe(1)
})

it('counts compact i/q and nested item records and inventory attached to battle packets', () => {
  const tracker = new PanelAnalyticsTracker()
  tracker.learnCatalog({ estado: { catalogoItens: [{ i: 73, nome: 'Bronze Boss Token' }] } })
  tracker.ingestState({ bolsa: [{ i: 73, q: 4 }] }, true)
  tracker.ingestPacket({ t: 'batalha', bolsa: [[73, 5]], ev: [] })
  tracker.ingestState({ bolsa: [{ item: { id: 73, nome: 'Bronze Boss Token' }, qt: 5 }] }, false)
  expect(tracker.snapshot().rareItemsTotal).toBe(1)
  tracker.ingestState({ bolsa: [{ item: { id: 73, nome: 'Bronze Boss Token' }, qt: 6 }] }, false)
  expect(tracker.snapshot().rareItemsTotal).toBe(2)
})

it('does not export packet values or authentication fields in item diagnostics', () => {
  const tracker = new PanelAnalyticsTracker()
  tracker.ingestPacket({ t: 'unrecognized', auth: 'credential-example', chat: { text: 'private-message-example' }, foo: 'value-example' })
  const report = JSON.stringify(tracker.snapshot().rareItemDiagnostics)
  expect(report).not.toContain('credential-example')
  expect(report).not.toContain('private-message-example')
  expect(report).not.toContain('value-example')
  expect(report).toContain('foo:string')
})
