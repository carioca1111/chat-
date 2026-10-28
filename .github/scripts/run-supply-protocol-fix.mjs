import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const sourcePath = '.github/scripts/apply-supply-protocol-fix.mjs'
const tempPath = '.github/scripts/.apply-supply-protocol-fix.runtime.mjs'
let source = readFileSync(sourcePath, 'utf8')
source = source.replace(
  "const storageId = found?.[0] ?? itemId || key",
  "const storageId = found?.[0] ?? (itemId || key)"
)
source = source.replace(
  "for (const entry of value) learnSustainCatalog(entry, target, depth + 1)",
  "for (const entry of value) learned += learnSustainCatalog(entry, target, depth + 1)"
)
writeFileSync(tempPath, source, 'utf8')
await import(pathToFileURL(tempPath).href)
