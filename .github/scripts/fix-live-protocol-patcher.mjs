import { readFileSync, writeFileSync } from 'node:fs'

const path = '.github/scripts/apply-potion-live-protocol-fix.mjs'
let source = readFileSync(path, 'utf8')
const pattern = /if \(!raw\.includes\('[^']*t[^']*'\)\) return/
if (!pattern.test(source)) throw new Error('t-filter anchor not found in patcher')
source = source.replace(pattern, `if (!raw.includes('"t"')) return`)
writeFileSync(path, source)
console.log('Live protocol patch anchor hardened.')
