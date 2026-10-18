import { describe, expect, it } from 'vitest'
import { computeLayout } from '../src/main/layout'

describe('Gridium 2 layout engine', () => {
  it('uses one full native view in single mode', () => {
    const result = computeLayout({ width: 1600, height: 900 }, 1, 3)
    expect(result.visible).toEqual([3])
    expect(result.bounds[3]?.width).toBeGreaterThan(1000)
    expect(result.bounds[1]).toBeUndefined()
  })

  it('rotates the two-view pair from the selected account', () => {
    expect(computeLayout({ width: 1600, height: 900 }, 2, 4).visible).toEqual([4, 1])
  })

  it('keeps four views bounded and non-overlapping on desktop', () => {
    const result = computeLayout({ width: 1600, height: 900 }, 4, 1)
    expect(result.visible).toEqual([1, 2, 3, 4])
    for (const id of result.visible) {
      const rect = result.bounds[id]!
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
      expect(rect.x).toBeGreaterThanOrEqual(288)
      expect(rect.y).toBeGreaterThanOrEqual(64)
      expect(rect.x + rect.width).toBeLessThanOrEqual(1600)
      expect(rect.y + rect.height).toBeLessThanOrEqual(900)
    }
  })

  it('falls back to vertical two-view layout on narrow windows', () => {
    const result = computeLayout({ width: 1100, height: 780 }, 2, 1)
    const a = result.bounds[1]!
    const b = result.bounds[2]!
    expect(a.x).toBe(b.x)
    expect(b.y).toBeGreaterThan(a.y)
  })
})
