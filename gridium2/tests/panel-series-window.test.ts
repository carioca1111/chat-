import { describe, expect, it } from 'vitest'
import { buildSeries } from '../src/renderer/src/PanelView'
import type { PanelAnalyticsSnapshot } from '../src/shared/contracts'

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

describe('panel fixed time windows', () => {
  it('renders exactly 60 minute points, 24 hour points and 30 day points', () => {
    const now = new Date(2026, 9, 22, 3, 50, 30).getTime()
    expect(buildSeries([EMPTY], 'minute', 'goldEarned', undefined, now)).toHaveLength(60)
    expect(buildSeries([EMPTY], 'hour', 'goldEarned', undefined, now)).toHaveLength(24)
    expect(buildSeries([EMPTY], 'day', 'goldEarned', undefined, now)).toHaveLength(30)
  })
})
