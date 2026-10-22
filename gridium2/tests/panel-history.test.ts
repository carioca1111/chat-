import { describe, expect, it } from 'vitest'
import { PanelAnalyticsTracker } from '../src/main/panel-analytics-runtime'

const HOUR = 60 * 60 * 1000

describe('persistent panel history', () => {
  it('persists totals and 1m/1h/1d buckets across a restart', () => {
    const now = Date.now()
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ id: 77, gold: 10_000, pokemons: [{ id: 1, xp: 100, level: 20, xpNivel: 0, xpProximo: 500 }] }, true, now)
    tracker.ingestState({ gold: 10_075, pkMud: [{ id: 1, xp: 175, level: 20, xpNivel: 0, xpProximo: 500 }] }, false, now + 5_000)
    tracker.ingestState({ gold: 10_125, pkMud: [{ id: 2, speciesId: 6, speciesName: 'Brave Charizard', potencia: 4, nota: 3.5, xp: 0 }] }, false, now + 10_000)
    tracker.ingestPacket({ t: 'batalha', ev: [{ k: 'marketVendido', tipo: 'pokemon', pokemonId: 2, valor: 1200, moeda: 'gold', descricao: 'Brave Charizard' }] }, now + 20_000)
    tracker.ingestState({ gold: 11_325 }, false, now + 21_000)
    tracker.registerRmtSale(35.5, 'Brave Charizard', now + 30_000)

    const before = tracker.snapshot(now + 40_000)
    expect(before.pokemonXpTotal).toBe(75)
    expect(before.capturesTotal).toBe(1)
    expect(before.note35Plus).toBe(1)
    expect(before.goldEarnedTotal).toBe(1325)
    expect(before.marketCoinsRevenue).toBe(1200)
    expect(before.rmtBrlRevenue).toBe(35.5)
    expect(before.historyMinute.length).toBeGreaterThan(0)
    expect(before.historyHour.length).toBeGreaterThan(0)
    expect(before.historyDay.length).toBeGreaterThan(0)

    const restored = new PanelAnalyticsTracker({ initial: tracker.persisted(now + 40_000) })
    const after = restored.snapshot(now + 40_000)
    expect(after.pokemonXpTotal).toBe(75)
    expect(after.capturesTotal).toBe(1)
    expect(after.note35Plus).toBe(1)
    expect(after.goldEarnedTotal).toBe(1325)
    expect(after.marketCoinsRevenue).toBe(1200)
    expect(after.rmtBrlRevenue).toBe(35.5)
    expect(after.events.some((event) => event.accountEvent === 'market-sale')).toBe(true)
    expect(after.events.some((event) => event.accountEvent === 'rmt-sale')).toBe(true)
  })

  it('uses observed Pokemon XP deltas and keeps the last-hour value rolling', () => {
    const now = Date.now()
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [{ id: 7, xp: 1_000, level: 50, xpNivel: 800, xpProximo: 2_000 }] }, true, now)
    tracker.ingestState({ pkMud: [{ id: 7, xp: 1_250, level: 50, xpNivel: 800, xpProximo: 2_000 }] }, false, now + 1_000)
    expect(tracker.snapshot(now + HOUR - 1).pokemonXpLastHour).toBe(250)
    expect(tracker.snapshot(now + HOUR + 61_000).pokemonXpLastHour).toBe(0)
  })

  it('counts every positive Gold balance delta as gross earned Gold', () => {
    const tracker = new PanelAnalyticsTracker()
    const now = Date.now()
    tracker.ingestState({ id: 1, gold: 1_000 }, true, now)
    tracker.ingestState({ gold: 1_025 }, false, now + 1_000) // battle reward
    tracker.ingestPacket({ t: 'batalha', ev: [{ k: 'marketComprado', moeda: 'gold', sobra: 900 }] }, now + 2_000)
    tracker.ingestState({ gold: 940 }, false, now + 3_000) // earned 40 after spending
    tracker.ingestPacket({ t: 'batalha', ev: [{ k: 'marketVendido', tipo: 'pokemon', pokemonId: 8, valor: 100, moeda: 'gold' }] }, now + 4_000)
    tracker.ingestState({ gold: 1_040 }, false, now + 5_000) // market sale reaches balance

    const snapshot = tracker.snapshot(now + 6_000)
    expect(snapshot.goldEarnedTotal).toBe(165)
    expect(snapshot.goldEarnedLastHour).toBe(165)
    expect(snapshot.marketCoinsRevenue).toBe(100)
    expect(snapshot.historyMinute.reduce((sum, bucket) => sum + bucket.goldEarned, 0)).toBe(165)
  })

  it('counts only confirmed Pokemon market sales, never generic item sales', () => {
    const tracker = new PanelAnalyticsTracker()
    const now = Date.now()
    expect(tracker.ingestPacket({ t: 'batalha', ev: [{ k: 'marketVendido', tipo: 'item', itemId: 9, valor: 500, moeda: 'gold' }] }, now)).toBe(false)
    expect(tracker.ingestPacket({ t: 'batalha', ev: [{ k: 'marketVendido', tipo: 'pokemon', pokemonId: 4, valor: 2, moeda: 'orb' }] }, now + 1)).toBe(true)
    expect(tracker.snapshot(now + 2).marketCoinsRevenue).toBe(0)
    expect(tracker.snapshot(now + 2).marketGemsRevenue).toBe(2)
  })
})
