import { describe, expect, it } from 'vitest'
import { compareVersions } from '../src/main/app-updater'

describe('Gridium app updater version ordering', () => {
  it('detects newer alpha patch versions', () => {
    expect(compareVersions('2.0.0-alpha.9.1', '2.0.0-alpha.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0-alpha.10.0', '2.0.0-alpha.9.9')).toBeGreaterThan(0)
  })

  it('treats equal versions as equal', () => {
    expect(compareVersions('2.0.0-alpha.9.0', '2.0.0-alpha.9.0')).toBe(0)
  })

  it('rejects older versions', () => {
    expect(compareVersions('2.0.0-alpha.8.3', '2.0.0-alpha.9.0')).toBeLessThan(0)
  })
})
