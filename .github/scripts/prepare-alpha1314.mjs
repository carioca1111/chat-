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
  source = replaceOrThrow(source, '"version": "2.0.0-alpha.13.13"', '"version": "2.0.0-alpha.13.14"', 'package version')
  return replaceOrThrow(source, 'Gridium 2 Alpha 1.3.13 - live potion/revive WebSocket protocol capture', 'Gridium 2 Alpha 1.3.14 - PokeIdle UI potion/revive stock fallback', 'package description')
})

update('gridium2/electron-builder.yml', (source) => replaceOrThrow(
  source,
  'artifactName: Gridium-2-Alpha-1.3.13-Setup.${ext}',
  'artifactName: Gridium-2-Alpha-1.3.14-Setup.${ext}',
  'installer artifact'
))

update('gridium2/src/renderer/src/App.tsx', (source) => replaceOrThrow(
  source,
  'ALPHA 1.3.13',
  'ALPHA 1.3.14',
  'sidebar badge'
))

update('gridium2/src/renderer/index.html', (source) => replaceOrThrow(
  source,
  '<title>Gridium 2 — Alpha 1.3.13 Live Supply Protocol</title>',
  '<title>Gridium 2 — Alpha 1.3.14 Potion UI Fallback</title>',
  'renderer title'
))

update('gridium2/src/main/index.ts', (source) => replaceOrThrow(
  source,
  "title: 'Gridium 2 — Alpha 1.3.13 Live Supply Protocol'",
  "title: 'Gridium 2 — Alpha 1.3.14 Potion UI Fallback'",
  'window title'
))

update('.github/workflows/build-gridium2-alpha08-panel.yml', (source) => {
  source = replaceOrThrow(source, 'name: Build Gridium 2 Live Supply Protocol Fix', 'name: Build Gridium 2 Potion UI Fallback', 'workflow name')
  source = replaceOrThrow(source, '      - fix/potion-revive-live-protocol\n', '      - fix/potion-revive-live-protocol\n      - fix/potion-revive-ui-fallback\n', 'workflow branch')
  source = source.replaceAll('Gridium-2-Alpha-1.3.13-Setup.exe', 'Gridium-2-Alpha-1.3.14-Setup.exe')
  source = source.replaceAll('Gridium-2-Alpha-1.3.13-Live-Supply-Protocol-Windows', 'Gridium-2-Alpha-1.3.14-Potion-UI-Fallback-Windows')
  source = replaceOrThrow(source, 'name: Gridium 2 Alpha 1.3.13 · Live Potion/Revive Protocol Fix', 'name: Gridium 2 Alpha 1.3.14 · Potion/Revive UI Fallback', 'release name')
  const bodyStart = '          body: |\n'
  const bodyEnd = '          prerelease: false\n'
  const start = source.indexOf(bodyStart)
  const end = source.indexOf(bodyEnd, start)
  if (start < 0 || end < 0) throw new Error('Missing release body anchors')
  const body = `          body: |\n            Gridium 2 Alpha 1.3.14 adiciona uma segunda fonte real para poções e revives no Hunt Control.\n\n            - mantém a captura WebSocket da Alpha 1.3.13\n            - adiciona fallback somente leitura da interface real do PokeIdle\n            - reconhece Small Potion, Great Potion, Ultra Potion, Hyper Potion, Ultimate Potion e Golden Potion\n            - reconhece Revive e Max Revive\n            - lê quantidades exibidas nos próprios botões, incluindo separadores como 384.750 e 10.292\n            - trata \"acabou\" como estoque zero\n            - acompanha a queda do estoque para contar consumo de poções e revives\n            - não clica, não ativa automações e não modifica a página do PokeIdle\n            - reconcilia o fallback com eventos/estoque do protocolo para evitar dupla contagem\n            - scanner pausa em conta suspensa e é reiniciado de forma segura após navegação/reload\n            - teste de regressão usa os valores reais dos prints: Small Potion 384.750, Golden Potion 9.998 e Revive 10.292\n            - preserva shiny, Hunt, mobile sync, painel e otimizações anteriores\n            - typecheck, testes unitários, soak com GC e regressão Electron executados no Windows antes da publicação\n`
  source = source.slice(0, start) + body + source.slice(end)
  return source
})
