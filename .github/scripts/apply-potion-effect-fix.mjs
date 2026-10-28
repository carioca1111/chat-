import { readFileSync, writeFileSync } from 'node:fs'

const runtimePath = 'gridium2/src/main/hunt-session-runtime.ts'
const testPath = 'gridium2/tests/hunt-session-runtime.test.ts'

let source = readFileSync(runtimePath, 'utf8')
const replaceOnce = (from, to, label) => {
  const i = source.indexOf(from)
  if (i < 0) throw new Error(`Missing runtime patch target: ${label}`)
  if (source.indexOf(from, i + from.length) >= 0) throw new Error(`Ambiguous runtime patch target: ${label}`)
  source = source.slice(0, i) + to + source.slice(i + from.length)
}

replaceOnce(
`function canonicalSustainName(name: string): string {
  const direct = canonicalPokeIdleItem(name)
  if (direct) return direct.name
  const splitCamel = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return canonicalPokeIdleItem(splitCamel)?.name ?? splitCamel
}

function looksLikeInventoryKey`,
`function canonicalSustainName(name: string): string {
  const direct = canonicalPokeIdleItem(name)
  if (direct) return direct.name
  const splitCamel = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return canonicalPokeIdleItem(splitCamel)?.name ?? splitCamel
}

const CURRENT_POTION_BY_HEAL = new Map<number, string>([
  [60, 'Small Potion'],
  [150, 'Great Potion'],
  [400, 'Ultra Potion'],
  [1000, 'Hyper Potion'],
  [3000, 'Ultimate Potion']
])

function humanNumber(value: string): number | undefined {
  const compact = value.trim().replace(/\s/g, '')
  if (!compact) return undefined
  const normalized = compact.includes('.') && !compact.includes(',')
    ? compact.replace(/\./g, '')
    : compact.replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function inferSustainName(value: JsonRecord, fallbackName = '', contextHint = ''): string {
  const candidates = [
    fallbackName,
    text(first(value.nome, value.name, value.itemNome, value.itemName, value.label, value.slug, value.key, value.code, value.tipo, value.type)),
    text(first(value.category, value.categoria, value.group, value.grupo)),
    text(first(value.effect, value.efeito, value.description, value.descricao, value.detail, value.detalhe, value.healText, value.curaTexto)),
    text(first(value.icon, value.image, value.img, value.sprite, value.asset)),
    contextHint
  ].filter(Boolean)

  for (const candidate of candidates) {
    const canonical = canonicalPokeIdleItem(candidate)
    if (canonical?.category === 'potions' || canonical?.category === 'revives') return canonical.name
  }

  const joined = candidates.join(' ')
  const normalized = normalizePokeIdleItemName(joined.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
  const compact = normalizeKey(joined)
  const itemContext = /(item|iten|catalog|market|shop|loja|potion|pocao|revive|reviver|consum|bolsa|bag|invent)/.test(normalizeKey(`${contextHint} ${joined}`))
    || Object.prototype.hasOwnProperty.call(value, 'itemId')
    || Object.prototype.hasOwnProperty.call(value, 'item_id')

  const aliases: Array<[RegExp, string]> = [
    [/(?:potion|pocao)(?:1|60)(?:$|[^0-9])/, 'Small Potion'],
    [/(?:potion|pocao)(?:2|150)(?:$|[^0-9])/, 'Great Potion'],
    [/(?:potion|pocao)(?:3|400)(?:$|[^0-9])/, 'Ultra Potion'],
    [/(?:potion|pocao)(?:4|1000)(?:$|[^0-9])/, 'Hyper Potion'],
    [/(?:potion|pocao)(?:5|3000)(?:$|[^0-9])/, 'Ultimate Potion'],
    [/(?:potion|pocao)(?:6)(?:$|[^0-9])/, 'Golden Potion'],
    [/(?:maxrevive|revive2|reviver2)/, 'Max Revive'],
    [/(?:revive1|reviver1)/, 'Revive']
  ]
  for (const [pattern, name] of aliases) if (pattern.test(compact)) return name

  const absoluteRaw = first(
    value.heal, value.healing, value.healAmount, value.healHp, value.hpRestore, value.restoreHp,
    value.cura, value.curaHp, value.hpCura, value.vidaRestore, value.restoreAmount, value.curaQuantidade
  )
  const absolute = finite(absoluteRaw)
  if (itemContext && absolute !== undefined) {
    const mapped = CURRENT_POTION_BY_HEAL.get(Math.round(absolute))
    if (mapped) return mapped
  }

  if (itemContext) {
    const hpMatch = joined.match(/(?:\+\s*)?([0-9][0-9.,]*)\s*(?:hp|vida)\b/i)
    const hpAmount = hpMatch ? humanNumber(hpMatch[1]) : undefined
    if (hpAmount !== undefined) {
      const mapped = CURRENT_POTION_BY_HEAL.get(Math.round(hpAmount))
      if (mapped) return mapped
    }
  }

  let percent = finite(first(value.healPercent, value.hpPercent, value.restorePercent, value.curaPercent, value.percent, value.porcentagem))
  if (percent === undefined) {
    const match = joined.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/)
    if (match) percent = humanNumber(match[1])
  }
  const price = finite(first(value.price, value.preco, value.cost, value.custo, value.valor, value.unitPrice, value.precoUnitario))
  const reviveSemantic = /(revive|reviver|reanima|ressusc)/.test(normalized)
  const potionSemantic = /(potion|pocao|cura|heal)/.test(normalized)
  if (percent !== undefined) {
    const rounded = Math.round(percent)
    if (rounded === 10 && (reviveSemantic || price === 600)) return 'Revive'
    if (rounded === 100 && (reviveSemantic || price === 5000)) return 'Max Revive'
    if (rounded === 50 && (potionSemantic || itemContext || price === 2500)) return 'Golden Potion'
  }

  return ''
}

function looksLikeInventoryKey`,
'current potion effect inference')

replaceOnce(
`function learnSustainCatalog(value: unknown, target: Map<string, string>, depth = 0): number {
  if (depth > 6) return 0
  let learned = 0
  const register = (idRaw: unknown, nameRaw: unknown): void => {`,
`function learnSustainCatalog(value: unknown, target: Map<string, string>, depth = 0, contextHint = ''): number {
  if (depth > 6) return 0
  let learned = 0
  const register = (idRaw: unknown, nameRaw: unknown): void => {`,
'catalog signature')

replaceOnce(
`  if (Array.isArray(value)) {
    for (const entry of value) learned += learnSustainCatalog(entry, target, depth + 1)
    return learned
  }`,
`  if (Array.isArray(value)) {
    for (const entry of value) learned += learnSustainCatalog(entry, target, depth + 1, contextHint)
    return learned
  }`,
'catalog array recursion')

replaceOnce(
`  const directId = first(value.itemId, value.id, value.item_id, value.i, value.code, value.key, value.slug, nested?.itemId, nested?.id, nested?.item_id)
  const directName = first(value.nome, value.name, value.itemNome, value.itemName, value.label, value.slug, value.key, nested?.nome, nested?.name, nested?.label, nested?.slug, nested?.key)
  register(directId, directName)

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') register(key, child)
    if (isRecord(child)) {
      const childId = first(child.itemId, child.id, child.item_id, child.i, /^\\d+$/.test(key) ? key : undefined)
      const childName = first(child.nome, child.name, child.itemNome, child.itemName, child.label, child.slug, child.key)
      register(childId, childName)
      learned += learnSustainCatalog(child, target, depth + 1)
    } else if (Array.isArray(child)) {
      learned += learnSustainCatalog(child, target, depth + 1)
    }
  }`,
`  const directId = first(value.itemId, value.id, value.item_id, value.i, value.code, value.key, value.slug, nested?.itemId, nested?.id, nested?.item_id)
  const directName = first(value.nome, value.name, value.itemNome, value.itemName, value.label, value.slug, value.key, nested?.nome, nested?.name, nested?.label, nested?.slug, nested?.key)
  register(directId, inferSustainName(value, text(directName), contextHint) || directName)

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') register(key, child)
    if (isRecord(child)) {
      const childId = first(child.itemId, child.id, child.item_id, child.i, /^\\d+$/.test(key) ? key : undefined)
      const childName = first(child.nome, child.name, child.itemNome, child.itemName, child.label, child.slug, child.key)
      register(childId, inferSustainName(child, text(childName), key) || childName)
      learned += learnSustainCatalog(child, target, depth + 1, key)
    } else if (Array.isArray(child)) {
      learned += learnSustainCatalog(child, target, depth + 1, key)
    }
  }`,
'catalog inference')

replaceOnce(
`  const rawName = text(first(
    event.itemNome, event.itemName, event.nomeItem, event.nameItem, event.nome, event.name, event.slug,
    nested?.nome, nested?.name, nested?.label, nested?.slug, nested?.key,
    itemId ? catalog.get(itemId) : undefined
  ))
  const name = rawName ? canonicalSustainName(rawName) : itemId ? catalog.get(itemId) || '' : ''`,
`  const rawName = text(first(
    event.itemNome, event.itemName, event.nomeItem, event.nameItem, event.nome, event.name, event.slug,
    nested?.nome, nested?.name, nested?.label, nested?.slug, nested?.key,
    itemId ? catalog.get(itemId) : undefined
  ))
  const inferredName = inferSustainName(event, rawName, text(first(event.k, event.kind, event.type, event.event, event.evento)))
  const name = inferredName || (rawName ? canonicalSustainName(rawName) : itemId ? catalog.get(itemId) || '' : '')`,
'battle event effect inference')

replaceOnce(
`    if (quantity === undefined || quantity < 0) return false
    const name = resolvedName(resolvedId, rawName)
    if (!name || !sustainCategory(name)) return false`,
`    if (quantity === undefined || quantity < 0) return false
    const inferredName = inferSustainName(value, rawName, fallbackName)
    const name = resolvedName(resolvedId, inferredName || rawName)
    if (!name || !sustainCategory(name)) return false`,
'inventory row effect inference')

writeFileSync(runtimePath, source, 'utf8')

let test = readFileSync(testPath, 'utf8')
const marker = '\n})\n'
const index = test.lastIndexOf(marker)
if (index < 0) throw new Error('Test suite closing marker not found')
const addition = `

  it('recognizes the six current potions and both revives from effect-only catalog definitions', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({
      t: 'welcome',
      catalogoItens: [
        { id: 101, categoria: 'itens de cura', efeito: '+60 HP', preco: 50 },
        { id: 102, categoria: 'itens de cura', efeito: '+150 HP', preco: 150 },
        { id: 103, categoria: 'itens de cura', efeito: '+400 HP', preco: 400 },
        { id: 104, categoria: 'itens de cura', efeito: '+1.000 HP', preco: 800 },
        { id: 105, categoria: 'itens de cura', efeito: '+3.000 HP', preco: 1500 },
        { id: 106, categoria: 'itens de cura', efeito: 'cura 50% do HP máximo', preco: 2500 },
        { id: 201, categoria: 'revive', efeito: 'restaura 10% do HP', preco: 600 },
        { id: 202, categoria: 'revive', efeito: 'restaura 100% do HP', preco: 5000 }
      ],
      estado: {
        id: 99,
        huntSlug: 'outland-02',
        pokemons: [{ id: 1, xp: 0 }],
        bolsa: { 101: 10, 102: 20, 103: 30, 104: 40, 105: 50, 106: 60, 201: 70, 202: 80 }
      }
    }, now)

    let snapshot = runtime.snapshot(now)
    expect(snapshot.potionStock).toBe(210)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: '101', name: 'Small Potion', quantity: 10 }),
      expect.objectContaining({ itemId: '102', name: 'Great Potion', quantity: 20 }),
      expect.objectContaining({ itemId: '103', name: 'Ultra Potion', quantity: 30 }),
      expect.objectContaining({ itemId: '104', name: 'Hyper Potion', quantity: 40 }),
      expect.objectContaining({ itemId: '105', name: 'Ultimate Potion', quantity: 50 }),
      expect.objectContaining({ itemId: '106', name: 'Golden Potion', quantity: 60 }),
      expect.objectContaining({ itemId: '201', name: 'Revive', quantity: 70 }),
      expect.objectContaining({ itemId: '202', name: 'Max Revive', quantity: 80 })
    ]))

    runtime.ingest({ t: 'inventario', bolsa: { 101: 9, 102: 19, 103: 29, 104: 39, 105: 49, 106: 59, 201: 69, 202: 79 } }, now + 5_000)
    snapshot = runtime.snapshot(now + 5_000)
    expect(snapshot.potionStock).toBe(204)
    expect(snapshot.potionsUsedTotal).toBe(6)
    expect(snapshot.potionsUsedLastHour).toBe(6)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.used).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.used).toBe(1)
  })
`
test = test.slice(0, index) + addition + test.slice(index)
writeFileSync(testPath, test, 'utf8')

console.log('Applied current PokeIdle potion/revive effect catalog fix.')
