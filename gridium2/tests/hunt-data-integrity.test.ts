import { describe, expect, it } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { HUNT_DATA_P1 } from '../src/renderer/src/hunt-data-p1'
import { HUNT_DATA_P2 } from '../src/renderer/src/hunt-data-p2'
import { HUNT_DATA_P3 } from '../src/renderer/src/hunt-data-p3'
import { HUNT_DATA_P4 } from '../src/renderer/src/hunt-data-p4'

describe('Hunt current-server dataset', () => {
  it('contains the verified current-server hunt roster', () => {
    const payload = HUNT_DATA_P1 + HUNT_DATA_P2 + HUNT_DATA_P3 + HUNT_DATA_P4
    const decoded = gunzipSync(Buffer.from(payload, 'base64')).toString('utf8')
    const rows = JSON.parse(decoded) as Array<[number, string]>
    expect(rows).toHaveLength(1052)
    expect(rows.some((row) => row[0] === 1 && row[1] === 'Bulbasaur')).toBe(true)
    expect(rows.some((row) => row[0] === 6 && row[1] === 'Charizard')).toBe(true)
  })
})
