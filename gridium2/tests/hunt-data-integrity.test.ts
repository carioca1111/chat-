import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'

describe('Hunt current-server dataset', () => {
  it('contains a valid gzip payload with a broad hunt roster', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/src/hunt-data.ts'), 'utf8')
    const match = source.match(/GZIP_BASE64 = `([^`]*)`/s)
    expect(match).not.toBeNull()
    const decoded = gunzipSync(Buffer.from(match![1], 'base64')).toString('utf8')
    const rows = JSON.parse(decoded) as unknown[]
    expect(rows.length).toBeGreaterThan(1000)
  })
})
