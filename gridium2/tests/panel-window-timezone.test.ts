import { describe, expect, it } from 'vitest'
import { buildSeries } from '../src/renderer/src/PanelView'
import type { PanelAnalyticsSnapshot } from '../src/shared/contracts'

const METRICS = ['goldEarned', 'pokemonXp', 'captures'] as const
const EMPTY: PanelAnalyticsSnapshot = {
  revision: 0,
  sessionStartedAt: 0,
  capturesTotal: 0,
  capturesLastHour: 0,
  capturesByPotency: [0,0,0,0,0],
  noteBands: [0,0,0,0,0,0,0,0],
  note35Plus: 0,
  shiniesSeen: null,
  shiniesCaught: 0,
  rareItems: [],
  rareItemsTotal: 0,
  lastCaptureAt: null,
  pokemonXpTotal: 0,
  pokemonXpLastHour: 0,
  goldEarnedTotal: 0,
  goldEarnedLastHour: 0,
  marketCoinsRevenue: 0,
  marketGemsRevenue: 0,
  rmtBrlRevenue: 0,
  historyMinute: [],
  historyHour: [],
  historyDay: [],
  events: []
}

describe('panel timeline windows in Brasilia', () => {
  const now = Date.UTC(2026, 9, 22, 6, 55, 42) // 03:55:42 em Brasília

  it('aligns 60 minute points for Gold, XP and captures', () => {
    for (const metric of METRICS) {
      const points = buildSeries([], 'minute', metric, undefined, now)
      expect(points).toHaveLength(60)
      expect(points.at(-1)?.at).toBe(Date.UTC(2026, 9, 22, 6, 55, 0))
    }
  })

  it('aligns 24 hourly points for Gold, XP and captures', () => {
    for (const metric of METRICS) {
      const points = buildSeries([], 'hour', metric, undefined, now)
      expect(points).toHaveLength(24)
      expect(points.at(-1)?.at).toBe(Date.UTC(2026, 9, 22, 6, 0, 0))
    }
  })

  it('aligns 30 days to midnight in Brasilia and regroups hourly data across local midnight', () => {
    const row: PanelAnalyticsSnapshot = {
      ...EMPTY,
      historyHour: [
        { at: Date.UTC(2026, 9, 22, 2, 0, 0), pokemonXp: 10, captures: 1, goldEarned: 100, marketCoins: 0, marketGems: 0, rmtBrl: 0 },
        { at: Date.UTC(2026, 9, 22, 3, 0, 0), pokemonXp: 20, captures: 2, goldEarned: 200, marketCoins: 0, marketGems: 0, rmtBrl: 0 }
      ]
    }

    for (const metric of METRICS) {
      const points = buildSeries([row], 'day', metric, undefined, now)
      expect(points).toHaveLength(30)
      expect(points.at(-1)?.at).toBe(Date.UTC(2026, 9, 22, 3, 0, 0))
    }

    const captures = buildSeries([row], 'day', 'captures', undefined, now)
    const xp = buildSeries([row], 'day', 'pokemonXp', undefined, now)
    const gold = buildSeries([row], 'day', 'goldEarned', undefined, now)
    expect(captures.at(-2)?.value).toBe(1)
    expect(captures.at(-1)?.value).toBe(2)
    expect(xp.at(-2)?.value).toBe(10)
    expect(xp.at(-1)?.value).toBe(20)
    expect(gold.at(-2)?.value).toBe(100)
    expect(gold.at(-1)?.value).toBe(200)
  })
})
