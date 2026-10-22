import { describe, expect, it } from 'vitest'
import { buildSeries } from '../src/renderer/src/PanelView'

describe('panel timeline windows', () => {
  const now = Date.UTC(2026, 9, 22, 6, 55, 42) // 03:55:42 em Brasília

  it('renders exactly 60 minute points', () => {
    const points = buildSeries([], 'minute', 'captures', undefined, now)
    expect(points).toHaveLength(60)
    expect(points.at(-1)?.at).toBe(Date.UTC(2026, 9, 22, 6, 55, 0))
  })

  it('renders exactly 24 hourly points', () => {
    const points = buildSeries([], 'hour', 'captures', undefined, now)
    expect(points).toHaveLength(24)
    expect(points.at(-1)?.at).toBe(Date.UTC(2026, 9, 22, 6, 0, 0))
  })

  it('renders exactly 30 days aligned to midnight in Brasilia', () => {
    const points = buildSeries([], 'day', 'captures', undefined, now)
    expect(points).toHaveLength(30)
    expect(points.at(-1)?.at).toBe(Date.UTC(2026, 9, 22, 3, 0, 0))
  })
})
