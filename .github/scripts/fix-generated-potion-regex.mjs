import { readFileSync, writeFileSync } from 'node:fs'

const path = 'gridium2/src/main/hunt-session-runtime.ts'
let source = readFileSync(path, 'utf8')

// The patch generator uses JS template strings, so escape sequences inside regex
// literals can be consumed before TypeScript sees them. Replace the generated
// effect parsers with equivalent regexes that don't depend on backslash escapes.
source = source.replace(
  /const hpMatch = joined\.match\([^\n]+\)/,
  "const hpMatch = joined.match(/(?:[+][ ]*)?([0-9][0-9.,]*)[ ]*(?:hp|vida)(?:$|[^a-z])/i)"
)
source = source.replace(
  /const match = joined\.match\([^\n]+\)/,
  "const match = joined.match(/([0-9]+(?:[.,][0-9]+)?)[ ]*%/)"
)

writeFileSync(path, source, 'utf8')
console.log('Generated potion effect regexes hardened.')
