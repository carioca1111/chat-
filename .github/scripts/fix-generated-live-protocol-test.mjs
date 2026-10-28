import { readFileSync, writeFileSync } from 'node:fs'

const path = 'gridium2/tests/potion-live-protocol.test.ts'
let source = readFileSync(path, 'utf8')
const lines = source.split('\n')
let replaced = false
for (let index = 0; index < lines.length; index++) {
  if (!lines[index].includes('.not.toContain') || !lines[index].includes('raw.includes')) continue
  lines[index] = `    expect(source).not.toContain("if (!raw.includes")`
  replaced = true
}
if (!replaced) throw new Error('generated source-filter assertion not found')
writeFileSync(path, lines.join('\n'))
console.log('Generated live protocol test quoting fixed.')
