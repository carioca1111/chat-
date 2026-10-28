import { readFileSync, writeFileSync } from 'node:fs'

const path = 'gridium2/src/main/hunt-session-runtime.ts'
let source = readFileSync(path, 'utf8')

function replaceOnce(from, to, label) {
  const index = source.indexOf(from)
  if (index < 0) throw new Error(`Missing patch target: ${label}`)
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Ambiguous patch target: ${label}`)
  source = source.slice(0, index) + to + source.slice(index + from.length)
}

function replaceSection(startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  if (start < 0) throw new Error(`Missing section start: ${label}`)
  const end = source.indexOf(endMarker, start)
  if (end < 0) throw new Error(`Missing section end: ${label}`)
  source = source.slice(0, start) + replacement + source.slice(end)
}

replaceOnce(
  "const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bag', 'consumables', 'consumiveis', 'itemBag', 'inventoryItems', 'itensInventario', 'backpack', 'supplies', 'suprimentos']",
  "const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bolsa', 'bag', 'consumables', 'consumiveis', 'itemBag', 'inventoryItems', 'itensInventario', 'backpack', 'backpackItems', 'supplies', 'suprimentos', 'itemQuantities', 'quantidadesItens']",
  'inventory aliases'
)

replaceOnce(
  "interface TimedAmount { at: number; amount: number }\ntype SustainCategory = 'potions' | 'revives'",
  "interface TimedAmount { at: number; amount: number }\ninterface SupplyUseReconcile { eventPending: number; statePending: number; eventAt: number; stateAt: number }\ninterface SupplyUseEvent { itemId: string; name: string; amount: number; remaining?: number }\ntype SustainCategory = 'potions' | 'revives'",
  'supply interfaces'
)

replaceOnce(
  "  return /(item|iten|invent|bag|mochila|consum|supply|supriment)/.test(normalized)",
  "  return /(item|iten|invent|bag|mochila|bolsa|consum|supply|supriment)/.test(normalized)",
  'inventory key matcher'
)

const inventoryReplacement = `function learnSustainCatalog(value: unknown, target: Map<string, string>, depth = 0): number {
  if (depth > 6) return 0
  let learned = 0
  const register = (idRaw: unknown, nameRaw: unknown): void => {
    if (idRaw === undefined || idRaw === null || String(idRaw) === '') return
    const rawName = text(nameRaw)
    if (!rawName || !sustainCategory(rawName)) return
    const id = String(idRaw)
    const name = canonicalSustainName(rawName)
    if (target.get(id) === name) return
    target.set(id, name)
    learned++
  }

  if (Array.isArray(value)) {
    for (const entry of value) learnSustainCatalog(entry, target, depth + 1)
    return learned
  }
  if (!isRecord(value)) return learned

  const nested = isRecord(value.item) ? value.item
    : isRecord(value.definition) ? value.definition
      : isRecord(value.def) ? value.def
        : undefined
  const directId = first(value.itemId, value.id, value.item_id, value.i, value.code, value.key, value.slug, nested?.itemId, nested?.id, nested?.item_id)
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
  }
  return learned
}

function supplyUseFromEvent(event: JsonRecord, catalog: Map<string, string>): SupplyUseEvent | null {
  const nested = isRecord(event.item) ? event.item
    : isRecord(event.definition) ? event.definition
      : isRecord(event.def) ? event.def
        : undefined
  const idRaw = first(event.itemId, event.item_id, event.i, nested?.itemId, nested?.id, nested?.item_id)
  const itemId = idRaw === undefined || idRaw === null ? '' : String(idRaw)
  const rawName = text(first(
    event.itemNome, event.itemName, event.nomeItem, event.nameItem, event.nome, event.name, event.slug,
    nested?.nome, nested?.name, nested?.label, nested?.slug, nested?.key,
    itemId ? catalog.get(itemId) : undefined
  ))
  const name = rawName ? canonicalSustainName(rawName) : itemId ? catalog.get(itemId) || '' : ''
  if (!name || !sustainCategory(name)) return null

  const semantic = normalizeKey([
    text(first(event.k, event.kind, event.type, event.event, event.evento)),
    text(first(event.action, event.acao, event.operation, event.operacao)),
    name
  ].filter(Boolean).join(' '))
  if (/(drop|loot|ganh|receb|reward|premi|compr|vend|market|shop)/.test(semantic)) return null
  const explicitUsed = finite(first(event.used, event.usado, event.usados, event.consumed, event.consumido, event.consumidos, event.quantidadeUsada, event.qtdUsada))
  const useSignal = /(use|used|uso|usou|usar|consum|potion|pocao|revive|reviver|heal|cura|recuper)/.test(semantic)
  if (!useSignal && !(explicitUsed !== undefined && explicitUsed > 0)) return null
  const amount = Math.max(1, Math.floor(explicitUsed ?? 1))
  const remainingRaw = finite(first(event.remaining, event.sobra, event.restante, event.quantityLeft, event.qtdRestante, event.estoque, event.stock))
  const remaining = remainingRaw !== undefined && remainingRaw >= 0 ? Math.floor(remainingRaw) : undefined
  return { itemId: itemId || normalizePokeIdleItemName(name), name, amount, remaining }
}

function inventoryRows(root: JsonRecord, catalog: Map<string, string>): Array<{ itemId: string; name: string; quantity: number }> {
  const rows = new Map<string, { itemId: string; name: string; quantity: number }>()

  const resolvedName = (idRaw: unknown, fallbackName = ''): string => {
    const id = idRaw === undefined || idRaw === null ? '' : String(idRaw)
    const fromCatalog = id ? catalog.get(id) : undefined
    const candidate = fromCatalog || fallbackName
    return candidate ? canonicalSustainName(candidate) : ''
  }

  const add = (idRaw: unknown, value: unknown, fallbackName = ''): boolean => {
    if (typeof value === 'number' || typeof value === 'string') {
      const quantity = finite(value)
      const name = resolvedName(idRaw, fallbackName)
      if (quantity === undefined || quantity < 0 || !name || !sustainCategory(name)) return false
      const itemId = idRaw === undefined || idRaw === null || String(idRaw) === '' ? normalizePokeIdleItemName(name) : String(idRaw)
      rows.set(itemId, { itemId, name, quantity: Math.floor(quantity) })
      return true
    }
    if (!isRecord(value)) return false

    const nestedItem = isRecord(value.item) ? value.item
      : isRecord(value.definition) ? value.definition
        : isRecord(value.def) ? value.def
          : isRecord(value.catalog) ? value.catalog
            : undefined
    const quantity = finite(first(
      value.qtd, value.quantidade, value.quantity, value.qty, value.count, value.amount, value.total, value.estoque, value.stock, value.q, value.qt, value.quant
    ))
    const resolvedId = first(
      value.itemId, value.id, value.item_id, value.i,
      nestedItem?.itemId, nestedItem?.id, nestedItem?.item_id, nestedItem?.key, nestedItem?.slug,
      idRaw
    )
    const rawName = text(first(
      value.nome, value.name, value.itemNome, value.itemName, value.label, value.slug, value.key, value.itemKey, value.itemSlug, value.code, value.tipo,
      nestedItem?.nome, nestedItem?.name, nestedItem?.label, nestedItem?.slug, nestedItem?.key, nestedItem?.code,
      resolvedId !== undefined && resolvedId !== null ? catalog.get(String(resolvedId)) : undefined,
      fallbackName
    ))
    if (quantity === undefined || quantity < 0) return false
    const name = resolvedName(resolvedId, rawName)
    if (!name || !sustainCategory(name)) return false
    const itemId = resolvedId === undefined || resolvedId === null || String(resolvedId) === '' ? normalizePokeIdleItemName(name) : String(resolvedId)
    rows.set(itemId, { itemId, name, quantity: Math.floor(quantity) })
    return true
  }

  const parseContainer = (container: unknown, hint = '', depth = 0): void => {
    if (depth > 6) return
    if (Array.isArray(container)) {
      for (const entry of container) {
        if (Array.isArray(entry) && entry.length >= 2) {
          add(entry[0], entry[1], String(entry[0] ?? ''))
          continue
        }
        if (!isRecord(entry)) continue
        const id = first(entry.itemId, entry.id, entry.item_id, entry.i, entry.slug, entry.key)
        add(id, entry, hint)
        for (const [key, child] of Object.entries(entry)) {
          if ((isRecord(child) || Array.isArray(child)) && (looksLikeInventoryKey(key) || key === 'item' || key === 'definition' || key === 'def')) parseContainer(child, key, depth + 1)
        }
      }
      return
    }
    if (!isRecord(container)) return

    add(first(container.itemId, container.id, container.item_id, container.i, container.slug, container.key), container, hint)
    for (const [mapKey, child] of Object.entries(container)) {
      if (typeof child === 'number' || typeof child === 'string') {
        add(mapKey, child, mapKey)
        continue
      }
      if (isRecord(child)) {
        add(first(child.itemId, child.id, child.item_id, child.i, child.slug, child.key, mapKey), child, mapKey)
        parseContainer(child, mapKey, depth + 1)
      } else if (Array.isArray(child)) {
        parseContainer(child, mapKey, depth + 1)
      }
    }
  }

  const scanForContainers = (value: unknown, depth = 0): void => {
    if (!isRecord(value) || depth > 6) return
    for (const [key, child] of Object.entries(value)) {
      if (looksLikeInventoryKey(key)) {
        parseContainer(child, key)
        continue
      }
      if (isRecord(child)) scanForContainers(child, depth + 1)
    }
  }

  for (const key of INVENTORY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(root, key)) parseContainer(root[key], key)
  }
  scanForContainers(root)
  return [...rows.values()]
}

`
replaceSection('function inventoryRows(', '\nexport class HuntSessionRuntime', inventoryReplacement, 'inventory parser')

replaceOnce(
  "  private readonly consumables = new Map<string, ConsumableState>()\n  private readonly shinySeenEvents = new Set<string>()",
  "  private readonly consumables = new Map<string, ConsumableState>()\n  private readonly itemCatalog = new Map<string, string>()\n  private readonly usageReconcile = new Map<string, SupplyUseReconcile>()\n  private readonly shinySeenEvents = new Set<string>()",
  'runtime supply fields'
)

replaceOnce(
  "  ingest(packet: unknown, at = Date.now()): boolean {\n    if (!isRecord(packet)) return false\n    const type = String(packet.t || '')",
  "  ingest(packet: unknown, at = Date.now()): boolean {\n    if (!isRecord(packet)) return false\n    learnSustainCatalog(packet, this.itemCatalog)\n    const type = String(packet.t || '')",
  'catalog learning on every packet'
)

replaceOnce(
  `    if (type === 'batalha') {
      const changed = this.ingestBattleEvents(packet, at)
      if (changed) {
        this.updatedAt = at
        markSessionsDirty()
      }
      return changed
    }
    if (type !== 'welcome' && type !== 'estado') return false`,
  `    if (type === 'batalha') {
      const changed = this.ingestBattleEvents(packet, at)
      if (changed) {
        this.updatedAt = at
        markSessionsDirty()
      }
      return changed
    }
    if (type !== 'welcome' && type !== 'estado') {
      if (!this.huntSlug) return false
      const changed = this.ingestConsumableInventory(inventoryRows(packet, this.itemCatalog), false, at)
      if (changed) {
        this.updatedAt = at
        markSessionsDirty()
      }
      return changed
    }`,
  'separate inventory packets'
)

replaceSection(
  '      const inventory = inventoryRows(estado)',
  '\n    }\n\n    this.prune(at)',
  `      const inventory = inventoryRows(packet, this.itemCatalog)
      if (this.ingestConsumableInventory(inventory, fullState, at)) changed = true`,
  'state inventory ingestion'
)

replaceOnce(
  "    this.consumables.clear()\n    this.shinySeenEvents.clear()",
  "    this.consumables.clear()\n    this.usageReconcile.clear()\n    if (!preserveAccount) this.itemCatalog.clear()\n    this.shinySeenEvents.clear()",
  'session supply reset'
)

replaceOnce(
  "      potionItems: this.consumables.size,\n      xpState: this.xpState.size,",
  "      potionItems: this.consumables.size,\n      sustainCatalog: this.itemCatalog.size,\n      supplyReconcile: this.usageReconcile.size,\n      xpState: this.xpState.size,",
  'supply diagnostics'
)

const classMethods = `  private findConsumable(itemId: string, name: string): [string, ConsumableState] | null {
    const direct = this.consumables.get(itemId)
    if (direct) return [itemId, direct]
    const normalized = normalizePokeIdleItemName(canonicalSustainName(name))
    for (const [id, item] of this.consumables) {
      if (normalizePokeIdleItemName(canonicalSustainName(item.name)) === normalized) return [id, item]
    }
    return null
  }

  private registerSupplyUse(itemId: string, name: string, amount: number, at: number, source: 'event' | 'state', remaining?: number): boolean {
    if (!this.huntSlug || amount <= 0 || !sustainCategory(name)) return false
    const canonicalName = canonicalSustainName(name)
    const key = normalizePokeIdleItemName(canonicalName)
    const reconcile = this.usageReconcile.get(key) ?? { eventPending: 0, statePending: 0, eventAt: 0, stateAt: 0 }
    const ttl = 30_000
    if (reconcile.eventAt && at - reconcile.eventAt > ttl) reconcile.eventPending = 0
    if (reconcile.stateAt && at - reconcile.stateAt > ttl) reconcile.statePending = 0

    let matched = 0
    if (source === 'event') {
      matched = Math.min(amount, reconcile.statePending)
      reconcile.statePending -= matched
      const unmatched = amount - matched
      reconcile.eventPending += unmatched
      reconcile.eventAt = at
    } else {
      matched = Math.min(amount, reconcile.eventPending)
      reconcile.eventPending -= matched
      const unmatched = amount - matched
      reconcile.statePending += unmatched
      reconcile.stateAt = at
    }
    this.usageReconcile.set(key, reconcile)

    const counted = amount - matched
    const found = this.findConsumable(itemId, canonicalName)
    const storageId = found?.[0] ?? itemId || key
    const previous = found?.[1] ?? { itemId: storageId, name: canonicalName, quantity: remaining ?? 0, used: 0 }
    let quantity = previous.quantity
    if (remaining !== undefined) quantity = remaining
    else if (source === 'event' && counted > 0 && quantity > 0) quantity = Math.max(0, quantity - counted)

    if (counted <= 0 && quantity === previous.quantity && previous.name === canonicalName) return false
    const next = { itemId: storageId, name: canonicalName, quantity, used: previous.used + counted }
    this.consumables.set(storageId, next)
    if (counted > 0 && sustainCategory(canonicalName) === 'potions') {
      this.potionsUsedTotal += counted
      this.potionUseEvents.push({ at, amount: counted })
      this.potionLastHourTotal += counted
    }
    this.touchConsumables()
    return true
  }

  private ingestConsumableInventory(inventory: Array<{ itemId: string; name: string; quantity: number }>, fullState: boolean, at: number): boolean {
    if (!inventory.length) return false
    let changed = false
    if (fullState) {
      const replacement = new Map<string, ConsumableState>()
      for (const row of inventory) {
        const found = this.findConsumable(row.itemId, row.name)
        replacement.set(row.itemId, { ...row, used: found?.[1].used ?? 0 })
      }
      if (!sameConsumableState(this.consumables, replacement)) {
        this.consumables.clear()
        for (const [id, item] of replacement) this.consumables.set(id, item)
        this.touchConsumables()
        changed = true
      }
      return changed
    }

    for (const row of inventory) {
      const found = this.findConsumable(row.itemId, row.name)
      const previous = found?.[1]
      const previousId = found?.[0]
      if (previous && row.quantity < previous.quantity) {
        const used = previous.quantity - row.quantity
        if (this.registerSupplyUse(row.itemId, row.name, used, at, 'state', row.quantity)) changed = true
        if (previousId && previousId !== row.itemId) this.consumables.delete(previousId)
        continue
      }
      if (!previous || previous.quantity !== row.quantity || previous.name !== row.name || previousId !== row.itemId) {
        if (previousId && previousId !== row.itemId) this.consumables.delete(previousId)
        this.consumables.set(row.itemId, { ...row, used: previous?.used ?? 0 })
        this.touchConsumables()
        changed = true
      }
    }
    return changed
  }

`
replaceOnce('  private ingestBattleEvents(packet: JsonRecord, at: number): boolean {', classMethods + '  private ingestBattleEvents(packet: JsonRecord, at: number): boolean {', 'supply runtime methods')

replaceOnce(
  "    let seenAdded = 0\n    let caughtAdded = 0",
  "    let seenAdded = 0\n    let caughtAdded = 0\n    let supplyChanged = false",
  'battle supply changed flag'
)

replaceOnce(
  "      if (!isRecord(raw)) continue\n      const kind = normalizeKey(text(first(raw.k, raw.kind, raw.type, raw.event, raw.evento)))",
  "      if (!isRecord(raw)) continue\n      const supplyUse = supplyUseFromEvent(raw, this.itemCatalog)\n      if (supplyUse && this.registerSupplyUse(supplyUse.itemId, supplyUse.name, supplyUse.amount, at, 'event', supplyUse.remaining)) supplyChanged = true\n      const kind = normalizeKey(text(first(raw.k, raw.kind, raw.type, raw.event, raw.evento)))",
  'battle supply event observer'
)

replaceOnce(
  `    if (seenAdded <= 0 && caughtAdded <= 0) return false
    this.shiniesSeen += seenAdded
    this.shiniesCaught += caughtAdded
    if (this.recentBattleShinyCaughtAt.length > 32) this.recentBattleShinyCaughtAt.splice(0, this.recentBattleShinyCaughtAt.length - 32)
    this.updatedAt = at
    return true`,
  `    const shinyChanged = seenAdded > 0 || caughtAdded > 0
    if (!shinyChanged && !supplyChanged) return false
    if (shinyChanged) {
      this.shiniesSeen += seenAdded
      this.shiniesCaught += caughtAdded
      if (this.recentBattleShinyCaughtAt.length > 32) this.recentBattleShinyCaughtAt.splice(0, this.recentBattleShinyCaughtAt.length - 32)
    }
    this.updatedAt = at
    return true`,
  'battle return combines supply and shiny'
)

replaceOnce(
  "    const cutoff = at - HOUR\n    const shinyCaptureCutoff = at - 30_000",
  "    const cutoff = at - HOUR\n    const shinyCaptureCutoff = at - 30_000\n    const supplyReconcileCutoff = at - 30_000\n    for (const [key, value] of this.usageReconcile) {\n      if (Math.max(value.eventAt, value.stateAt) < supplyReconcileCutoff) this.usageReconcile.delete(key)\n    }",
  'supply reconcile pruning'
)

writeFileSync(path, source, 'utf8')

const testPath = 'gridium2/tests/hunt-session-runtime.test.ts'
let tests = readFileSync(testPath, 'utf8')
const insertAt = tests.lastIndexOf('\n})')
if (insertAt < 0) throw new Error('Could not locate test suite end')
const additions = `

  it('resolves numeric bolsa item ids from a server catalog and tracks separate inventory packets', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({
      t: 'welcome',
      catalogoItens: [
        { id: 501, nome: 'Ultra Potion' },
        { id: 601, nome: 'Revive' }
      ],
      estado: {
        id: 90,
        huntSlug: 'outland-02',
        pokemons: [{ id: 1, xp: 0 }],
        bolsa: { 501: 12, 601: 4 }
      }
    }, now)

    let snapshot = runtime.snapshot(now)
    expect(snapshot.potionStock).toBe(12)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: '501', name: 'Ultra Potion', quantity: 12, used: 0 }),
      expect.objectContaining({ itemId: '601', name: 'Revive', quantity: 4, used: 0 })
    ]))

    runtime.ingest({ t: 'inventario', bolsa: { 501: 10, 601: 3 } }, now + 1_000)
    snapshot = runtime.snapshot(now + 1_000)
    expect(snapshot.potionStock).toBe(10)
    expect(snapshot.potionsUsedTotal).toBe(2)
    expect(snapshot.potionItems.find((item) => item.name === 'Ultra Potion')?.used).toBe(2)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.quantity).toBe(3)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.used).toBe(1)
  })

  it('counts confirmed potion/revive battle use and reconciles a later inventory delta without double count', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({
      t: 'welcome',
      itemCatalog: [
        { itemId: 501, name: 'Ultra Potion' },
        { itemId: 601, name: 'Max Revive' }
      ],
      estado: {
        id: 91,
        huntSlug: 'forest',
        pokemons: [{ id: 1, xp: 0 }],
        inventory: { 501: 10, 601: 3 }
      }
    }, now)

    runtime.ingest({ t: 'batalha', ev: [
      { k: 'itemUsado', itemId: 501, used: 1 },
      { k: 'reviveUsado', itemId: 601, used: 1 }
    ] }, now + 1_000)

    let snapshot = runtime.snapshot(now + 1_000)
    expect(snapshot.potionStock).toBe(9)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.quantity).toBe(2)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.used).toBe(1)

    runtime.ingest({ t: 'estado', estado: { huntSlug: 'forest', inventory: { 501: 9, 601: 2 } } }, now + 1_500)
    snapshot = runtime.snapshot(now + 1_500)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Ultra Potion')?.used).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.used).toBe(1)
  })

  it('reconciles state-first consumption with a later battle event', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()
    runtime.ingest({ t:'welcome', catalogoItens:[{ id:501, nome:'Great Potion' }], estado:{ id:92, huntSlug:'forest', pokemons:[{ id:1, xp:0 }], bolsa:{ 501:5 } } }, now)
    runtime.ingest({ t:'inventario', bolsa:{ 501:4 } }, now + 1_000)
    runtime.ingest({ t:'batalha', ev:[{ k:'pocaoUsada', itemId:501, consumed:1 }] }, now + 1_500)
    const snapshot = runtime.snapshot(now + 1_500)
    expect(snapshot.potionStock).toBe(4)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Great Potion')?.used).toBe(1)
  })`
tests = tests.slice(0, insertAt) + additions + tests.slice(insertAt)
writeFileSync(testPath, tests, 'utf8')

console.log('Applied PokeIdle supply protocol fix with bolsa/catalog/event reconciliation.')
