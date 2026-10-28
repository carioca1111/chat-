import { readFileSync, writeFileSync } from 'node:fs'
const path = '.github/scripts/apply-potion-effect-fix.mjs'
let source = readFileSync(path, 'utf8')
const from = "normalizeKey(`${contextHint} ${joined}`)"
const to = "normalizeKey(contextHint + ' ' + joined)"
if (!source.includes(from)) throw new Error('Expected nested template target not found')
source = source.replace(from, to)
writeFileSync(path, source, 'utf8')
console.log('Potion patch script quoting fixed.')
