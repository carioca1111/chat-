import { readFileSync, writeFileSync } from 'node:fs'

const path = 'gridium2/src/main/hunt-session-runtime.ts'
let source = readFileSync(path, 'utf8')
const from = `  for (const candidate of candidates) {\n    const canonical = canonicalPokeIdleItem(candidate)\n    if (canonical?.category === 'potions' || canonical?.category === 'revives') return canonical.name\n  }`
const to = `  for (const candidate of candidates) {\n    const canonical = canonicalPokeIdleItem(candidate)\n    if (canonical?.category === 'potions' || canonical?.category === 'revives') {\n      const genericRevive = canonical.name === 'Revive' && normalizePokeIdleItemName(candidate) === 'revive'\n      const maxReviveHint = candidates.some((entry) => normalizeKey(entry).includes('100'))\n        || finite(first(value.price, value.preco, value.cost, value.custo, value.valor, value.unitPrice, value.precoUnitario)) === 5000\n      if (!(genericRevive && maxReviveHint)) return canonical.name\n    }\n  }`
if (!source.includes(from)) throw new Error('Generic canonical candidate loop not found')
source = source.replace(from, to)
writeFileSync(path, source, 'utf8')
console.log('Max Revive effect now overrides generic revive category.')
