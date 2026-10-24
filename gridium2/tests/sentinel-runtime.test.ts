import { describe, expect, it } from 'vitest'
import type { AccountSnapshot, HuntLearningSnapshot, PanelHistoryBucket } from '../src/shared/contracts'
import { analyzePerformance } from '../src/main/sentinel-runtime'

const MINUTE = 60_000

function bucket(at: number, pokemonXp: number, captures: number, goldEarned: number): PanelHistoryBucket {
  return { at, pokemonXp, captures, goldEarned, marketCoins: 0, marketGems: 0, rmtBrl: 0 }
}

function account(historyMinute: PanelHistoryBucket[]): AccountSnapshot {
  return {
    id: 1,
    name: 'Conta 1',
    status: 'ready',
    url: 'https://pokeidle.io/app',
    title: 'PokeIdle.io',
    canGoBack: false,
    canGoForward: false,
    attached: false,
    visualMode: 'eco',
    zoomPercent: 100,
    powerMode: 'auto',
    effectivePowerState: 'on',
    suspendSupported: true,
    huntProfile: { huntSlug: 'outland-test', speciesId: 6, speciesName: 'Charizard', source: 'server', detectedAt: Date.now() },
    huntProtocolStatus: 'live',
    huntSession: {
      huntSlug: 'outland-test', sessionStartedAt: 0, capturesTotal: 0, capturesLastHour: 0,
      capturesByPotency: [0,0,0,0,0], shiniesSeen: 0, shiniesCaught: 0,
      killsEstimatedTotal: 0, killsEstimatedLastHour: 0, potionStock: 0,
      potionsUsedTotal: 0, potionsUsedLastHour: 0, potionItems: [], lastCaptureAt: null, updatedAt: 0
    },
    panelAnalytics: {
      revision: 1,
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
      historyMinute,
      historyHour: [],
      historyDay: [],
      events: []
    }
  }
}

function stableHistory(now: number, currentScale = 1): PanelHistoryBucket[] {
  const rows: PanelHistoryBucket[] = []
  for (let minutesAgo = 360; minutesAgo >= 1; minutesAgo--) {
    const current = minutesAgo <= 15
    const scale = current ? currentScale : 1
    rows.push(bucket(now - minutesAgo * MINUTE, 10_000 * scale, 1 * scale, 1_000 * scale))
  }
  return rows
}

describe('Gridium Sentinel anomaly detector', () => {
  it('does not flag a healthy account near its learned baseline', () => {
    const now = Date.now()
    expect(analyzePerformance(account(stableHistory(now, 1)), now)).toBeNull()
  })

  it('flags a critical collapse without triggering on ordinary variance', () => {
    const now = Date.now()
    const result = analyzePerformance(account(stableHistory(now, 0.1)), now)
    expect(result).not.toBeNull()
    expect(result?.severity).toBe('critical')
    expect(result?.deltaPercent).toBeLessThan(-70)
  })

  it('does not invent an anomaly when there is not enough history', () => {
    const now = Date.now()
    const history = Array.from({ length: 12 }, (_, index) => bucket(now - (12 - index) * MINUTE, 100, 0, 0))
    expect(analyzePerformance(account(history), now)).toBeNull()
  })

  it('uses Hunt Learning as the XP baseline when confidence is sufficient', () => {
    const now = Date.now()
    const learning: HuntLearningSnapshot = {
      accountId: 1,
      huntSlug: 'outland-test',
      speciesId: 6,
      speciesName: 'Charizard',
      observedXpPerHour: 1_000_000,
      minutesObserved: 90,
      samples: 180,
      confidence: 75
    }
    const history = Array.from({ length: 15 }, (_, index) => bucket(now - (15 - index) * MINUTE, 1_000, 0, 0))
    const result = analyzePerformance(account(history), now, learning)
    expect(result?.metric).toBe('xp')
    expect(result?.baselinePerHour).toBe(1_000_000)
    expect(result?.severity).toBe('critical')
  })
})