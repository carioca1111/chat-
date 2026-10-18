import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_ZOOM_STEP,
  DEFAULT_ACCOUNT_ZOOM,
  MAX_ACCOUNT_ZOOM,
  MIN_ACCOUNT_ZOOM,
  normalizeAccountZoom
} from '../src/main/zoom'

describe('individual account zoom', () => {
  it('keeps the supported minimum, maximum and default', () => {
    expect(MIN_ACCOUNT_ZOOM).toBe(50)
    expect(MAX_ACCOUNT_ZOOM).toBe(140)
    expect(DEFAULT_ACCOUNT_ZOOM).toBe(100)
    expect(ACCOUNT_ZOOM_STEP).toBe(5)
  })

  it('clamps values outside the supported range', () => {
    expect(normalizeAccountZoom(20)).toBe(50)
    expect(normalizeAccountZoom(180)).toBe(140)
  })

  it('rounds zoom to five-percent steps', () => {
    expect(normalizeAccountZoom(83)).toBe(85)
    expect(normalizeAccountZoom(107)).toBe(105)
  })

  it('falls back safely for invalid values', () => {
    expect(normalizeAccountZoom(Number.NaN)).toBe(100)
    expect(normalizeAccountZoom(Number.POSITIVE_INFINITY)).toBe(100)
  })
})
