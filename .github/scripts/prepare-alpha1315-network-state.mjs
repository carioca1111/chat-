import fs from 'node:fs'

function replaceOrThrow(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing anchor: ${label}`)
  return source.replace(from, to)
}

function update(path, transform) {
  const source = fs.readFileSync(path, 'utf8')
  const next = transform(source)
  if (next === source) throw new Error(`No changes produced for ${path}`)
  fs.writeFileSync(path, next)
}

update('gridium2/package.json', (source) => {
  source = replaceOrThrow(source, '"version": "2.0.0-alpha.13.13"', '"version": "2.0.0-alpha.13.15"', 'package version')
  return replaceOrThrow(source, 'Gridium 2 Alpha 1.3.13 - live potion/revive WebSocket protocol capture', 'Gridium 2 Alpha 1.3.15 - potion/revive network-state capture without open UI', 'package description')
})

update('gridium2/electron-builder.yml', (source) => replaceOrThrow(
  source,
  'artifactName: Gridium-2-Alpha-1.3.13-Setup.${ext}',
  'artifactName: Gridium-2-Alpha-1.3.15-Setup.${ext}',
  'installer artifact'
))

update('gridium2/src/renderer/src/App.tsx', (source) => replaceOrThrow(
  source,
  'ALPHA 1.3.13',
  'ALPHA 1.3.15',
  'sidebar badge'
))

update('gridium2/src/renderer/index.html', (source) => replaceOrThrow(
  source,
  '<title>Gridium 2 — Alpha 1.3.13 Live Supply Protocol</title>',
  '<title>Gridium 2 — Alpha 1.3.15 Network Supply State</title>',
  'renderer title'
))

update('gridium2/src/main/index.ts', (source) => replaceOrThrow(
  source,
  "title: 'Gridium 2 — Alpha 1.3.13 Live Supply Protocol'",
  "title: 'Gridium 2 — Alpha 1.3.15 Network Supply State'",
  'window title'
))
