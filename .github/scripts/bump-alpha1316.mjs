import { readFileSync, writeFileSync } from 'node:fs'

function patch(path, replacements) {
  let text = readFileSync(path, 'utf8')
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(`Missing ${JSON.stringify(from)} in ${path}`)
    text = text.replace(from, to)
  }
  writeFileSync(path, text, 'utf8')
}

patch('gridium2/package.json', [
  ['"version": "2.0.0-alpha.13.15"', '"version": "2.0.0-alpha.13.16"'],
  ['Gridium 2 Alpha 1.3.15 - headless potion/revive protocol inference', 'Gridium 2 Alpha 1.3.16 - four-account server monitor recovery']
])
patch('gridium2/electron-builder.yml', [
  ['Gridium-2-Alpha-1.3.15-Setup.${ext}', 'Gridium-2-Alpha-1.3.16-Setup.${ext}']
])
patch('gridium2/src/renderer/src/App.tsx', [
  ['ALPHA 1.3.15', 'ALPHA 1.3.16']
])
patch('gridium2/src/renderer/index.html', [
  ['Gridium 2 — Alpha 1.3.15 Headless Supply', 'Gridium 2 — Alpha 1.3.16 Multi-Account Monitor']
])
patch('gridium2/src/main/index.ts', [
  ['Gridium 2 — Alpha 1.3.15 Headless Supply', 'Gridium 2 — Alpha 1.3.16 Multi-Account Monitor']
])
console.log('Bumped Gridium 2 to Alpha 1.3.16.')
