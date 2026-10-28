import { readFileSync, writeFileSync } from 'node:fs'

function replaceOnce(path, from, to) {
  const source = readFileSync(path, 'utf8')
  if (!source.includes(from)) throw new Error(`${path}: version anchor not found`)
  writeFileSync(path, source.replace(from, to))
}

replaceOnce('gridium2/src/renderer/src/App.tsx', 'ALPHA 1.3.9', 'ALPHA 1.3.13')
replaceOnce('gridium2/src/renderer/index.html', '<title>Gridium 2 — Alpha 1.3.6 Vale a Pena</title>', '<title>Gridium 2 — Alpha 1.3.13 Live Supply Protocol</title>')
replaceOnce('gridium2/src/main/index.ts', "title: 'Gridium 2 — Alpha 1.3.8 Hunt Persistence'", "title: 'Gridium 2 — Alpha 1.3.13 Live Supply Protocol'")
console.log('Alpha 1.3.13 UI version labels updated.')
