import { describe, expect, it } from 'vitest'
import { FarmGoldAnalyticsTracker } from '../src/main/farm-gold-analytics-runtime'

describe('farm-only Gold analytics', () => {
  it('counts farm Gold but excludes Pokemon and item Market sales', () => {
    const tracker = new FarmGoldAnalyticsTracker()
    const now = 1_700_000_000_000

    tracker.ingestState({ id: 1, gold: 1_000 }, true, now)
    tracker.ingestState({ gold: 1_025 }, false, now + 1_000)

    tracker.ingestPacket({
      t: 'batalha',
      ev: [{ k: 'marketVendido', tipo: 'pokemon', pokemonId: 8, valor: 100, moeda: 'gold' }]
    }, now + 2_000)
    tracker.ingestState({ gold: 1_125 }, false, now + 3_000)

    tracker.ingestPacket({
      t: 'batalha',
      ev: [{ k: 'marketVendido', tipo: 'item', itemId: 55, valor: 500, moeda: 'gold' }]
    }, now + 4_000)
    tracker.ingestState({ gold: 1_625 }, false, now + 5_000)

    const snapshot = tracker.snapshot(now + 6_000)
    expect(snapshot.goldEarnedTotal).toBe(25)
    expect(snapshot.goldEarnedLastHour).toBe(25)
    expect(snapshot.historyMinute.reduce((sum, bucket) => sum + bucket.goldEarned, 0)).toBe(25)
  })

  it('keeps simultaneous farm Gold after subtracting the Market credit', () => {
    const tracker = new FarmGoldAnalyticsTracker()
    const now = 1_700_000_000_000

    tracker.ingestState({ id: 1, gold: 10_000 }, true, now)
    tracker.ingestPacket({
      t: 'batalha',
      ev: [{ k: 'marketVendido', tipo: 'pokemon', pokemonId: 9, valor: 1_000, moeda: 'gold' }]
    }, now + 1_000)
    tracker.ingestState({ gold: 11_075 }, false, now + 2_000)

    expect(tracker.snapshot(now + 3_000).goldEarnedTotal).toBe(75)
  })

  it('keeps RMT revenue separate from Gold gained', () => {
    const tracker = new FarmGoldAnalyticsTracker()
    const now = 1_700_000_000_000

    tracker.ingestState({ id: 1, gold: 5_000 }, true, now)
    tracker.registerRmtSale(42.5, 'Pokémon RMT', now + 1_000)

    const snapshot = tracker.snapshot(now + 2_000)
    expect(snapshot.goldEarnedTotal).toBe(0)
    expect(snapshot.rmtBrlRevenue).toBe(42.5)
  })

  it('migrates old history by removing Market Gold that was mixed into Gold earned', () => {
    const now = 1_700_000_000_000
    const minuteAt = Math.floor(now / 60_000) * 60_000
    const tracker = new FarmGoldAnalyticsTracker({
      initial: {
        version: 2,
        goldEarnedTotal: 1_325,
        marketCoinsRevenue: 1_200,
        historyMinute: [{ at: minuteAt, pokemonXp: 0, captures: 0, goldEarned: 1_325, marketCoins: 1_200, marketGems: 0, rmtBrl: 0 }],
        historyHour: [{ at: Math.floor(now / 3_600_000) * 3_600_000, pokemonXp: 0, captures: 0, goldEarned: 1_325, marketCoins: 1_200, marketGems: 0, rmtBrl: 0 }],
        historyDay: [{ at: new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime(), pokemonXp: 0, captures: 0, goldEarned: 1_325, marketCoins: 1_200, marketGems: 0, rmtBrl: 0 }]
      }
    })

    const snapshot = tracker.snapshot(now)
    expect(snapshot.goldEarnedTotal).toBe(125)
    expect(snapshot.historyMinute.reduce((sum, bucket) => sum + bucket.goldEarned, 0)).toBe(125)
  })
})
