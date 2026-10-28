import { readFileSync, writeFileSync } from 'node:fs'

const path = '.github/scripts/apply-potion-live-protocol-fix.mjs'
let source = readFileSync(path, 'utf8')
const before = `if (!raw.includes('\\\\\\"t\\\\\\"')) return`
const after = `if (!raw.includes('"t"')) return`
if (!source.includes(before)) throw new Error('escaped t-filter anchor not found in patcher')
source = source.replace(before, after)
writeFileSync(path, source)
console.log('Live protocol patch anchor hardened.')
