import { describe, expect, it } from 'vitest'
import { buildSeries } from '../src/renderer/src/PanelView'

const METRICS = ['goldEarned', 'pokemonXp', 'captures'] as const

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

  it('aligns 30 days to midnight in Brasilia for Gold, XP and captures', () => {
    for (const metric of METRICS) {
      const points = buildSeries([], 'day', metric, undefined, now)
      expect(points).toHaveLength(30)
      expect(points.at(-1)?.at).toBe(Date.UTC(2026, 9, 22, 3, 0, 0))
    }
  })
})
