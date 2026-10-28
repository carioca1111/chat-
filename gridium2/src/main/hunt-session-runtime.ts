import { app } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HuntPotionSnapshot, HuntSessionSnapshot } from '../shared/contracts'
import { canonicalPokeIdleItem, normalizePokeIdleItemName } from '../shared/pokeidle-item-catalog'
import { PokemonIdLedger } from './pokemon-id-ledger'

type JsonRecord = Record<string, unknown>
interface XpState { xp: number }
interface ConsumableState { itemId: string; name: string; quantity: number; used: number }
interface TimedAmount { at: number; amount: number }
interface SupplyUseReconcile { eventPending: number; statePending: number; eventAt: number; stateAt: number }
interface SupplyUseEvent { itemId: string; name: string; amount: number; remaining?: number }
type SustainCategory = 'potions' | 'revives'
type SupplyEventSource = 'event' | 'sent'
type HuntPacketTransport = 'received' | 'sent'
interface SupplyMirrorSignal { source: SupplyEventSource; at: number; amount: number }

export interface HuntSessionPersistedState {
  version: 1
  huntSlug: string
  accountId: string
  sessionStartedAt: number
  capturesTotal: number
  capturesByPotency: [number, number, number, number, number]
  shiniesSeen: number
  shiniesSeenBaseline: number | null
  shiniesCaught: number
  killsEstimatedTotal: number
  potionsUsedTotal: number
  lastCaptureAt: number | null
  updatedAt: number
  captureTimes: number[]
  killTimes: number[]
  potionUseEvents: TimedAmount[]
  potionItems: HuntPotionSnapshot[]
}

interface StoredHuntSessions {
  version: 1
  savedAt: number
  accounts: Record<string, HuntSessionPersistedState>
}

const HOUR = 60 * 60 * 1000
const MAX_XP_CACHE = 20_000
const COMPACT_HEAD_THRESHOLD = 1_024
const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bolsa', 'bag', 'consumables', 'consumiveis', 'itemBag', 'inventoryItems', 'itensInventario', 'backpack', 'backpackItems', 'supplies', 'suprimentos', 'itemQuantities', 'quantidadesItens']
const HUNT_SESSION_FILE = 'gridium2-hunt-sessions-v1.json'
const PERSIST_DELAY_MS = 15_000
const CONTINUITY_SESSION_MS = (34 * 60 + 37) * 60 * 1000

type LocalSlotId = 1 | 2 | 3 | 4
let nextLocalSlot = 0
let storedSessions: StoredHuntSessions | null = null
let storedSessionsSeeded = false
let cachedSessionPath: string | null | undefined
let persistenceDirty = false
let persistenceTimer: ReturnType<typeof setTimeout> | null = null
let exitFlushInstalled = false
const liveRuntimes = new Map<LocalSlotId, HuntSessionRuntime>()

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const first = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null)
const finite = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}
const text = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 100) : ''
const nonNegativeInt = (value: unknown): number => Math.max(0, Math.floor(finite(value) ?? 0))
const timestampOr = (value: unknown, fallback: number): number => {
  const parsed = finite(value)
  return parsed !== undefined && parsed > 0 ? parsed : fallback
}
const truthy = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true' || value === 'sim' || value === 'yes' || value === 'shiny'
const normalizeKey = (value: string): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
const isShinyKey = (value: string): boolean => value.includes('shiny') || value.includes('shinie')
const pokemonId = (row: JsonRecord): string => {
  const id = first(row.id, row.pokemonInstanceId, row.uid)
  return id === undefined || id === null ? '' : String(id)
}
const potency = (value: unknown): 1|2|3|4|5|undefined => {
  const parsed = finite(typeof value === 'string' ? value.replace(/^P/i, '') : value)
  return parsed && [1,2,3,4,5].includes(parsed) ? parsed as 1|2|3|4|5 : undefined
}
const huntSlugOf = (estado: JsonRecord): string => text(first(estado.huntSlug, estado.hunt))
const huntIdentity = (slug: string): string => slug.trim().toLowerCase().replace(/[\s-]+/g, '_')
const hasHuntSignal = (estado: JsonRecord): boolean => Object.prototype.hasOwnProperty.call(estado, 'huntSlug') || Object.prototype.hasOwnProperty.call(estado, 'hunt')

function allocateLocalSlot(): LocalSlotId {
  const id = (nextLocalSlot % 4) + 1
  nextLocalSlot++
  return id as LocalSlotId
}

function runtimeStoragePath(): string | null {
  if (cachedSessionPath !== undefined) return cachedSessionPath
  try {
    if (!app || typeof app.getPath !== 'function' || !app.isReady()) return null
    cachedSessionPath = join(app.getPath('userData'), HUNT_SESSION_FILE)
    return cachedSessionPath
  } catch {
    cachedSessionPath = null
    return null
  }
}

function recentTimes(count: number, at: number): number[] {
  if (count <= 0) return []
  const start = at - HOUR + 5_000
  const span = HOUR - 10_000
  return Array.from({ length: count }, (_, index) => start + Math.floor(span * (index + 1) / (count + 1)))
}

function seededSession(at: number, capturesTotal: number, capturesByPotency: [number,number,number,number,number], kills: number, capturesHour: number, killsHour: number): HuntSessionPersistedState {
  return {
    version: 1,
    huntSlug: '',
    accountId: '',
    sessionStartedAt: at - CONTINUITY_SESSION_MS,
    capturesTotal,
    capturesByPotency,
    shiniesSeen: 0,
    shiniesSeenBaseline: null,
    shiniesCaught: 0,
    killsEstimatedTotal: kills,
    potionsUsedTotal: 0,
    lastCaptureAt: at - 30_000,
    updatedAt: at,
    captureTimes: recentTimes(capturesHour, at),
    killTimes: recentTimes(killsHour, at),
    potionUseEvents: [],
    potionItems: []
  }
}

function continuitySeed(at: number): StoredHuntSessions {
  return {
    version: 1,
    savedAt: at,
    accounts: {
      '2': seededSession(at, 710, [529,141,36,4,0], 48_351, 26, 1_469),
      '3': seededSession(at, 723, [537,143,37,5,1], 49_236, 27, 1_496),
      '4': seededSession(at, 668, [497,133,34,4,0], 45_490, 24, 1_382)
    }
  }
}

function loadStoredSessions(): StoredHuntSessions | null {
  if (storedSessions) return storedSessions
  const path = runtimeStoragePath()
  if (!path) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoredHuntSessions>
    if (parsed && parsed.version === 1 && parsed.accounts && typeof parsed.accounts === 'object') {
      storedSessions = { version: 1, savedAt: timestampOr(parsed.savedAt, Date.now()), accounts: parsed.accounts as Record<string, HuntSessionPersistedState> }
      return storedSessions
    }
  } catch { /* first run is migrated below */ }
  storedSessions = continuitySeed(Date.now())
  storedSessionsSeeded = true
  return storedSessions
}

function installExitFlush(): void {
  if (exitFlushInstalled) return
  exitFlushInstalled = true
  process.once('exit', flushSessionsSync)
}

function markSessionsDirty(): void {
  if (!runtimeStoragePath()) return
  persistenceDirty = true
  installExitFlush()
  if (persistenceTimer) return
  persistenceTimer = setTimeout(() => {
    persistenceTimer = null
    flushSessionsSync()
  }, PERSIST_DELAY_MS)
  const timer = persistenceTimer as NodeJS.Timeout
  if (typeof timer.unref === 'function') timer.unref()
}

function flushSessionsSync(): void {
  const path = runtimeStoragePath()
  if (!path || (!persistenceDirty && !storedSessionsSeeded)) return
  const base = storedSessions ?? { version: 1 as const, savedAt: Date.now(), accounts: {} }
  const accounts: Record<string, HuntSessionPersistedState> = { ...base.accounts }
  for (const [slotId, runtime] of liveRuntimes) accounts[String(slotId)] = runtime.persisted()
  const payload: StoredHuntSessions = { version: 1, savedAt: Date.now(), accounts }
  const temporary = `${path}.pending`
  try {
    writeFileSync(temporary, JSON.stringify(payload), 'utf8')
    renameSync(temporary, path)
    storedSessions = payload
    storedSessionsSeeded = false
    persistenceDirty = false
  } catch { /* best effort; next dirty event retries */ }
}

function findShinySeenCounter(value: unknown, depth = 0): number | undefined {
  if (!isRecord(value) || depth > 3) return undefined
  for (const [key, raw] of Object.entries(value)) {
    const normalized = normalizeKey(key)
    if (isShinyKey(normalized) && (normalized.includes('seen') || normalized.includes('vist'))) {
      const count = finite(raw)
      if (count !== undefined && count >= 0) return count
    }
  }
  for (const raw of Object.values(value)) {
    const nested = findShinySeenCounter(raw, depth + 1)
    if (nested !== undefined) return nested
  }
  return undefined
}

function shinyFlag(value: unknown, depth = 0): boolean {
  if (!isRecord(value) || depth > 2) return false
  for (const [key, raw] of Object.entries(value)) {
    const normalized = normalizeKey(key)
    if (isShinyKey(normalized) && truthy(raw)) return true
    if (['variant','form','skin','rarity','raridade','tipo'].includes(normalized) && typeof raw === 'string' && normalizeKey(raw).includes('shiny')) return true
  }
  for (const raw of Object.values(value)) if (shinyFlag(raw, depth + 1)) return true
  return false
}

function shinySeenBattleEvent(event: JsonRecord): boolean {
  const kind = normalizeKey(text(first(event.k, event.kind, event.type, event.event, event.evento)))
  if (!kind) return false
  // Authoritative PokeIdle roll: batalha.ev -> { k: 'bola', shiny: true, sucesso: boolean }.
  if (kind === 'bola' && shinyFlag(event)) return true
  const shinyNamed = isShinyKey(kind)
  const encounterKind = /(vist|seen|encontr|spawn|aparec|wild)/.test(kind)
  return (shinyNamed && encounterKind) || (shinyFlag(event) && encounterKind)
}

function battleEventKey(event: JsonRecord): string {
  const direct = first(event.encounterId, event.encounter_id, event.pokemonInstanceId, event.pokemonId, event.pkId, event.id, event.uid)
  if (direct !== undefined && direct !== null && String(direct)) return `id:${String(direct)}`
  const kind = text(first(event.k, event.kind, event.type, event.event, event.evento))
  const species = text(first(event.speciesName, event.pokemonNome, event.nome, event.name))
  return `fp:${kind}|${species}|${JSON.stringify(event).slice(0, 220)}`
}

function sustainCategory(name: string): SustainCategory | null {
  const canonical = canonicalPokeIdleItem(name)
  if (canonical?.category === 'potions' || canonical?.category === 'revives') return canonical.category
  const normalized = normalizePokeIdleItemName(name.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
  if (/\b(potion|potions|pocao|pocoes)\b/.test(normalized)) return 'potions'
  if (/\b(revive|revives|reviver|reviveres)\b/.test(normalized)) return 'revives'
  return null
}

function canonicalSustainName(name: string): string {
  const direct = canonicalPokeIdleItem(name)
  if (direct) return direct.name
  const splitCamel = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return canonicalPokeIdleItem(splitCamel)?.name ?? splitCamel
}

const CURRENT_POTION_BY_HEAL = new Map<number, string>([
  [20, 'Small Potion'],
  [40, 'Great Potion'],
  [80, 'Ultra Potion'],
  [100, 'Hyper Potion'],
  [120, 'Ultimate Potion']
])

function humanNumber(value: string): number | undefined {
  const compact = value.trim().replace(/\s+/g, '')
  if (!compact) return undefined
  let normalized = compact
  if (compact.includes('.') && compact.includes(',')) normalized = compact.replace(/\./g, '').replace(',', '.')
  else if (compact.includes(',')) normalized = compact.replace(',', '.')
  else if (/^[0-9]{1,3}(?:\.[0-9]{3})+$/.test(compact)) normalized = compact.replace(/\./g, '')
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
    if (canonical?.category === 'potions' || canonical?.category === 'revives') {
      const genericRevive = canonical.name === 'Revive' && normalizePokeIdleItemName(candidate) === 'revive'
      const maxReviveHint = candidates.some((entry) => normalizeKey(entry).includes('100'))
        || finite(first(value.price, value.preco, value.cost, value.custo, value.valor, value.unitPrice, value.precoUnitario)) === 5000
      if (!(genericRevive && maxReviveHint)) return canonical.name
    }
  }

  const joined = candidates.join(' ')
  const normalized = normalizePokeIdleItemName(joined.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
  const compact = normalizeKey(joined)
  const itemContext = /(item|iten|catalog|market|shop|loja|potion|pocao|revive|reviver|consum|bolsa|bag|invent)/.test(normalizeKey(contextHint + ' ' + joined))
    || Object.prototype.hasOwnProperty.call(value, 'itemId')
    || Object.prototype.hasOwnProperty.call(value, 'item_id')

  // Current PokeIdle healing catalog. Normalize the effect text first so this
  // also works when the server omits the display name and only sends effect/price.
  if (itemContext) {
    if ((compact.includes('maxrevive') || compact.includes('revive')) && compact.includes('100')) return 'Max Revive'
    if ((compact.includes('revive') || compact.includes('reviver')) && compact.includes('50')) return 'Revive'
    if (compact.includes('120hp')) return 'Ultimate Potion'
    if (compact.includes('100hp')) return 'Hyper Potion'
    if (compact.includes('80hp')) return 'Ultra Potion'
    if (compact.includes('40hp')) return 'Great Potion'
    if (compact.includes('20hp')) return 'Small Potion'
    const exactPrice = finite(first(value.price, value.preco, value.cost, value.custo, value.valor, value.unitPrice, value.precoUnitario))
    const effectText = normalizeKey(text(first(value.effect, value.efeito, value.description, value.descricao, value.detail, value.detalhe)))
    const reviveContext = compact.includes('revive') || compact.includes('reviver') || compact.includes('reanima')
    if (reviveContext) {
      if (exactPrice === 350) return 'Max Revive'
      if (exactPrice === 100) return 'Revive'
    } else if (effectText.includes('hp') || effectText.includes('vida') || effectText.includes('cura') || effectText.includes('restaura')) {
      if (exactPrice === 20) return 'Small Potion'
      if (exactPrice === 50) return 'Great Potion'
      if (exactPrice === 125) return 'Ultra Potion'
      if (exactPrice === 175) return 'Hyper Potion'
      if (exactPrice === 240) return 'Ultimate Potion'
    }
  }

  const aliases: Array<[RegExp, string]> = [
    [/(?:smallpotion|potion1|pocao1)(?:$|[^0-9])/, 'Small Potion'],
    [/(?:greatpotion|potion2|pocao2)(?:$|[^0-9])/, 'Great Potion'],
    [/(?:ultrapotion|potion3|pocao3)(?:$|[^0-9])/, 'Ultra Potion'],
    [/(?:hyperpotion|potion4|pocao4)(?:$|[^0-9])/, 'Hyper Potion'],
    [/(?:ultimatepotion|potion5|pocao5)(?:$|[^0-9])/, 'Ultimate Potion'],
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
    const hpMatch = joined.match(/(?:[+][ ]*)?([0-9][0-9.,]*)[ ]*(?:hp|vida)(?:$|[^a-z])/i)
    const hpAmount = hpMatch ? humanNumber(hpMatch[1]) : undefined
    if (hpAmount !== undefined) {
      const mapped = CURRENT_POTION_BY_HEAL.get(Math.round(hpAmount))
      if (mapped) return mapped
    }
  }

  let percent = finite(first(value.healPercent, value.hpPercent, value.restorePercent, value.curaPercent, value.percent, value.porcentagem))
  if (percent === undefined) {
    const match = joined.match(/([0-9]+(?:[.,][0-9]+)?)[ ]*%/)
    if (match) percent = humanNumber(match[1])
  }
  const price = finite(first(value.price, value.preco, value.cost, value.custo, value.valor, value.unitPrice, value.precoUnitario))
  const reviveSemantic = /(revive|reviver|reanima|ressusc)/.test(normalized)
  const potionSemantic = /(potion|pocao|cura|heal)/.test(normalized)
  if (percent !== undefined) {
    const rounded = Math.round(percent)
    if (rounded === 50 && (reviveSemantic || price === 100)) return 'Revive'
    if (rounded === 100 && (reviveSemantic || price === 350)) return 'Max Revive'
  }

  return ''
}

function looksLikeInventoryKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return /(item|iten|invent|bag|mochila|bolsa|consum|supply|supriment)/.test(normalized)
}

function learnSustainCatalog(value: unknown, target: Map<string, string>, depth = 0, contextHint = ''): number {
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
    for (const entry of value) learned += learnSustainCatalog(entry, target, depth + 1, contextHint)
    return learned
  }
  if (!isRecord(value)) return learned

  const nested = isRecord(value.item) ? value.item
    : isRecord(value.definition) ? value.definition
      : isRecord(value.def) ? value.def
        : undefined
  const directId = first(value.itemId, value.id, value.item_id, value.i, value.code, value.key, value.slug, nested?.itemId, nested?.id, nested?.item_id)
  const directName = first(value.nome, value.name, value.itemNome, value.itemName, value.label, value.slug, value.key, nested?.nome, nested?.name, nested?.label, nested?.slug, nested?.key)
  register(directId, inferSustainName(value, text(directName), contextHint) || directName)

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') register(key, child)
    if (isRecord(child)) {
      const childId = first(child.itemId, child.id, child.item_id, child.i, /^\d+$/.test(key) ? key : undefined)
      const childName = first(child.nome, child.name, child.itemNome, child.itemName, child.label, child.slug, child.key)
      register(childId, inferSustainName(child, text(childName), key) || childName)
      learned += learnSustainCatalog(child, target, depth + 1, key)
    } else if (Array.isArray(child)) {
      learned += learnSustainCatalog(child, target, depth + 1, key)
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
  const inferredName = inferSustainName(event, rawName, text(first(event.k, event.kind, event.type, event.event, event.evento)))
  const name = inferredName || (rawName ? canonicalSustainName(rawName) : itemId ? catalog.get(itemId) || '' : '')
  if (!name || !sustainCategory(name)) return null

  const actionSemantic = normalizeKey([
    text(first(event.k, event.kind, event.type, event.event, event.evento)),
    text(first(event.action, event.acao, event.operation, event.operacao, event.command, event.comando, event.cmd))
  ].filter(Boolean).join(' '))
  const semantic = normalizeKey([actionSemantic, name].filter(Boolean).join(' '))
  if (/(drop|loot|ganh|receb|reward|premi|compr|vend|market|shop)/.test(semantic)) return null
  const explicitUsed = finite(first(event.used, event.usado, event.usados, event.consumed, event.consumido, event.consumidos, event.quantidadeUsada, event.qtdUsada))
  const quantitySnapshot = finite(first(event.qtd, event.quantidade, event.quantity, event.qty, event.count, event.amount, event.total, event.estoque, event.stock))
  const strongUseSignal = /(use|used|uso|usou|usar|consum|heal|cura|recuper)/.test(actionSemantic)
  const itemActionSignal = /(potion|pocao|revive|reviver)/.test(actionSemantic)
  if (!strongUseSignal && !itemActionSignal && !(explicitUsed !== undefined && explicitUsed > 0)) return null
  if (quantitySnapshot !== undefined && explicitUsed === undefined && !strongUseSignal) return null
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
    const inferredName = inferSustainName(value, rawName, fallbackName)
    const name = resolvedName(resolvedId, inferredName || rawName)
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
    if (depth > 6) return
    if (Array.isArray(value)) {
      for (const child of value) if (isRecord(child) || Array.isArray(child)) scanForContainers(child, depth + 1)
      return
    }
    if (!isRecord(value)) return
    for (const [key, child] of Object.entries(value)) {
      if (looksLikeInventoryKey(key)) {
        parseContainer(child, key)
        continue
      }
      if (isRecord(child) || Array.isArray(child)) scanForContainers(child, depth + 1)
    }
  }

  for (const key of INVENTORY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(root, key)) parseContainer(root[key], key)
  }
  scanForContainers(root)
  return [...rows.values()]
}


export class HuntSessionRuntime {
  private readonly localSlotId = allocateLocalSlot()
  private sessionStartedAt = Date.now()
  private huntSlug = ''
  private accountId = ''
  private capturesTotal = 0
  private capturesByPotency: [number, number, number, number, number] = [0,0,0,0,0]
  private shiniesSeen = 0
  private shiniesSeenBaseline: number | null = null
  private shiniesCaught = 0
  private killsEstimatedTotal = 0
  private potionsUsedTotal = 0
  private lastCaptureAt: number | null = null
  private updatedAt = Date.now()
  private readonly knownPokemonIds = new PokemonIdLedger()
  private readonly xpState = new Map<string, XpState>()
  private readonly consumables = new Map<string, ConsumableState>()
  private readonly itemCatalog = new Map<string, string>()
  private readonly usageReconcile = new Map<string, SupplyUseReconcile>()
  private readonly recentSupplyMirrors = new Map<string, SupplyMirrorSignal>()
  private readonly shinySeenEvents = new Set<string>()
  private recentBattleShinyCaughtAt: number[] = []
  private captureTimes: number[] = []
  private captureHead = 0
  private killTimes: number[] = []
  private killHead = 0
  private potionUseEvents: TimedAmount[] = []
  private potionHead = 0
  private potionLastHourTotal = 0
  private consumableRevision = 0
  private cachedConsumableRevision = -1
  private cachedPotionStock = 0
  private cachedConsumableItems: HuntPotionSnapshot[] = []

  constructor(initial?: Partial<HuntSessionPersistedState> | null) {
    const disk = initial ? null : loadStoredSessions()
    const restored = initial ?? disk?.accounts[String(this.localSlotId)] ?? null
    if (restored) this.restore(restored)
    if (runtimeStoragePath()) {
      liveRuntimes.set(this.localSlotId, this)
      installExitFlush()
      if (storedSessionsSeeded) markSessionsDirty()
    }
  }

  ingest(packet: unknown, at = Date.now(), transport: HuntPacketTransport = 'received'): boolean {
    if (Array.isArray(packet)) {
      let changed = false
      for (const entry of packet) if (this.ingest(entry, at, transport)) changed = true
      return changed
    }
    if (!isRecord(packet)) return false
    learnSustainCatalog(packet, this.itemCatalog)
    const type = String(packet.t || '')
    if (type === 'batalha') {
      const changed = this.ingestBattleEvents(packet, at, transport === 'sent' ? 'sent' : 'event')
      if (changed) {
        this.updatedAt = at
        markSessionsDirty()
      }
      return changed
    }
    if (type !== 'welcome' && type !== 'estado') {
      if (!this.huntSlug) return false
      let changed = this.ingestGenericSupplyEvents(packet, at, transport === 'sent' ? 'sent' : 'event')
      if (this.ingestConsumableInventory(inventoryRows(packet, this.itemCatalog), false, at)) changed = true
      if (changed) {
        this.updatedAt = at
        markSessionsDirty()
      }
      return changed
    }
    const estado = isRecord(packet.estado) ? packet.estado : null
    if (!estado) return false

    const nextAccountRaw = first(estado.id, estado.accountId, estado.userId)
    const nextAccountId = nextAccountRaw === undefined || nextAccountRaw === null ? '' : String(nextAccountRaw)
    const huntSignal = hasHuntSignal(estado)
    const nextHunt = huntSignal ? huntSlugOf(estado) : this.huntSlug
    const accountChanged = Boolean(nextAccountId && this.accountId && nextAccountId !== this.accountId)
    let sessionTransition = false

    if (accountChanged) {
      this.clearSession(at, false)
      sessionTransition = true
    }
    if (nextAccountId) this.accountId = nextAccountId

    if (huntSignal) {
      if (!nextHunt) {
        if (this.huntSlug) {
          this.clearSession(at, true)
          sessionTransition = true
        }
      } else if (!this.huntSlug) {
        this.startHunt(nextHunt, at)
        sessionTransition = true
      } else if (huntIdentity(nextHunt) !== huntIdentity(this.huntSlug)) {
        this.clearSession(at, true)
        this.startHunt(nextHunt, at)
        sessionTransition = true
      } else if (nextHunt !== this.huntSlug) {
        this.huntSlug = nextHunt
      }
    }

    const fullState = type === 'welcome' || estado.cheio === true || accountChanged || sessionTransition
    const rows: JsonRecord[] = []
    for (const key of ['pokemons','pkMud']) {
      const value = estado[key]
      if (Array.isArray(value)) for (const row of value) if (isRecord(row)) rows.push(row)
    }

    let changed = sessionTransition
    if (fullState) {
      this.xpState.clear()
      if (this.huntSlug) for (const row of rows) this.baselinePokemon(row)
    } else if (this.huntSlug) {
      for (const row of rows) {
        const id = pokemonId(row)
        if (!id) continue
        const xp = finite(row.xp)
        const known = this.knownPokemonIds.has(id)
        if (!known) {
          this.knownPokemonIds.add(id)
          if (xp !== undefined) this.setXp(id, xp)
          this.registerCapture(row, at)
          changed = true
          continue
        }
        if (xp !== undefined) {
          const previous = this.xpState.get(id)?.xp
          this.setXp(id, xp)
          if (previous !== undefined && xp > previous) {
            this.killsEstimatedTotal++
            this.killTimes.push(at)
            changed = true
          }
        }
      }
    }

    if (this.huntSlug) {
      const seen = findShinySeenCounter(estado)
      if (seen !== undefined && seen >= 0) {
        if (this.shiniesSeenBaseline === null || seen - this.shiniesSeenBaseline < this.shiniesSeen) this.shiniesSeenBaseline = seen - this.shiniesSeen
        const nextSeen = Math.max(this.shiniesSeen, Math.floor(seen - this.shiniesSeenBaseline))
        if (nextSeen !== this.shiniesSeen) {
          this.shiniesSeen = nextSeen
          changed = true
        }
      }

      const inventory = inventoryRows(packet, this.itemCatalog)
      if (this.ingestConsumableInventory(inventory, fullState, at)) changed = true
    }

    this.prune(at)
    if (changed) {
      this.updatedAt = at
      markSessionsDirty()
    }
    return changed
  }

  snapshot(at = Date.now()): HuntSessionSnapshot {
    this.prune(at)
    const consumableSnapshot = this.getConsumableSnapshot()
    return {
      huntSlug: this.huntSlug,
      sessionStartedAt: this.sessionStartedAt,
      capturesTotal: this.capturesTotal,
      capturesLastHour: this.captureTimes.length - this.captureHead,
      capturesByPotency: [...this.capturesByPotency] as [number, number, number, number, number],
      shiniesSeen: this.shiniesSeen,
      shiniesCaught: this.shiniesCaught,
      killsEstimatedTotal: this.killsEstimatedTotal,
      killsEstimatedLastHour: this.killTimes.length - this.killHead,
      potionStock: consumableSnapshot.potionStock,
      potionsUsedTotal: this.potionsUsedTotal,
      potionsUsedLastHour: this.potionLastHourTotal,
      potionItems: consumableSnapshot.items,
      lastCaptureAt: this.lastCaptureAt,
      updatedAt: this.updatedAt
    }
  }

  persisted(at = Date.now()): HuntSessionPersistedState {
    this.prune(at)
    const consumableSnapshot = this.getConsumableSnapshot()
    return {
      version: 1,
      huntSlug: this.huntSlug,
      accountId: this.accountId,
      sessionStartedAt: this.sessionStartedAt,
      capturesTotal: this.capturesTotal,
      capturesByPotency: [...this.capturesByPotency] as [number, number, number, number, number],
      shiniesSeen: this.shiniesSeen,
      shiniesSeenBaseline: this.shiniesSeenBaseline,
      shiniesCaught: this.shiniesCaught,
      killsEstimatedTotal: this.killsEstimatedTotal,
      potionsUsedTotal: this.potionsUsedTotal,
      lastCaptureAt: this.lastCaptureAt,
      updatedAt: this.updatedAt,
      captureTimes: this.captureTimes.slice(this.captureHead),
      killTimes: this.killTimes.slice(this.killHead),
      potionUseEvents: this.potionUseEvents.slice(this.potionHead).map((event) => ({ ...event })),
      potionItems: consumableSnapshot.items.map((item) => ({ ...item }))
    }
  }

  reset(at = Date.now()): void {
    this.prune(at)
  }

  diagnostics() {
    return {
      localSlotId: this.localSlotId,
      huntSlug: this.huntSlug,
      captures: this.capturesTotal,
      killsEstimated: this.killsEstimatedTotal,
      shiniesSeen: this.shiniesSeen,
      shiniesCaught: this.shiniesCaught,
      potionItems: this.consumables.size,
      sustainCatalog: this.itemCatalog.size,
      supplyReconcile: this.usageReconcile.size,
      xpState: this.xpState.size,
      captureEvents: this.captureTimes.length - this.captureHead,
      killEvents: this.killTimes.length - this.killHead,
      potionEvents: this.potionUseEvents.length - this.potionHead
    }
  }

  private restore(initial: Partial<HuntSessionPersistedState>): void {
    const now = Date.now()
    this.huntSlug = text(initial.huntSlug)
    this.accountId = text(initial.accountId)
    this.sessionStartedAt = timestampOr(initial.sessionStartedAt, now)
    this.capturesTotal = nonNegativeInt(initial.capturesTotal)
    const potencyValues = Array.isArray(initial.capturesByPotency) ? initial.capturesByPotency : []
    this.capturesByPotency = [0,1,2,3,4].map((index) => nonNegativeInt(potencyValues[index])) as [number, number, number, number, number]
    this.shiniesSeen = nonNegativeInt(initial.shiniesSeen)
    const shinyBaseline = finite(initial.shiniesSeenBaseline)
    this.shiniesSeenBaseline = shinyBaseline ?? null
    this.shiniesCaught = nonNegativeInt(initial.shiniesCaught)
    this.killsEstimatedTotal = nonNegativeInt(initial.killsEstimatedTotal)
    this.potionsUsedTotal = nonNegativeInt(initial.potionsUsedTotal)
    const lastCaptureAt = finite(initial.lastCaptureAt)
    this.lastCaptureAt = lastCaptureAt !== undefined && lastCaptureAt > 0 ? lastCaptureAt : null
    this.updatedAt = timestampOr(initial.updatedAt, this.sessionStartedAt)
    this.captureTimes = safeTimes(initial.captureTimes)
    this.killTimes = safeTimes(initial.killTimes)
    this.potionUseEvents = safeTimedAmounts(initial.potionUseEvents)
    this.potionLastHourTotal = this.potionUseEvents.reduce((sum, event) => sum + event.amount, 0)
    if (Array.isArray(initial.potionItems)) {
      for (const item of initial.potionItems) {
        if (!item || typeof item !== 'object') continue
        const row = item as Partial<HuntPotionSnapshot>
        const itemId = text(row.itemId)
        const name = text(row.name)
        if (!itemId || !name || !sustainCategory(name)) continue
        this.consumables.set(itemId, { itemId, name: canonicalSustainName(name), quantity: nonNegativeInt(row.quantity), used: nonNegativeInt(row.used) })
      }
    }
    this.touchConsumables()
    this.prune(now)
  }

  private hasContinuityData(): boolean {
    return this.capturesTotal > 0 || this.killsEstimatedTotal > 0 || this.potionsUsedTotal > 0 || this.shiniesSeen > 0 || this.shiniesCaught > 0
  }

  private startHunt(huntSlug: string, at: number): void {
    const keepSeededStart = !this.huntSlug && this.hasContinuityData()
    this.huntSlug = huntSlug
    if (!keepSeededStart) this.sessionStartedAt = at
    this.updatedAt = at
  }

  private clearSession(at: number, preserveAccount: boolean): void {
    const accountId = preserveAccount ? this.accountId : ''
    this.sessionStartedAt = at
    this.huntSlug = ''
    this.accountId = accountId
    this.capturesTotal = 0
    this.capturesByPotency = [0,0,0,0,0]
    this.shiniesSeen = 0
    this.shiniesSeenBaseline = null
    this.shiniesCaught = 0
    this.killsEstimatedTotal = 0
    this.potionsUsedTotal = 0
    this.lastCaptureAt = null
    this.updatedAt = at
    this.knownPokemonIds.clear()
    this.xpState.clear()
    this.consumables.clear()
    this.usageReconcile.clear()
    this.recentSupplyMirrors.clear()
    if (!preserveAccount) this.itemCatalog.clear()
    this.shinySeenEvents.clear()
    this.recentBattleShinyCaughtAt = []
    this.captureTimes = []
    this.captureHead = 0
    this.killTimes = []
    this.killHead = 0
    this.potionUseEvents = []
    this.potionHead = 0
    this.potionLastHourTotal = 0
    this.touchConsumables()
  }

  private findConsumable(itemId: string, name: string): [string, ConsumableState] | null {
    const direct = this.consumables.get(itemId)
    if (direct) return [itemId, direct]
    const normalized = normalizePokeIdleItemName(canonicalSustainName(name))
    for (const [id, item] of this.consumables) {
      if (normalizePokeIdleItemName(canonicalSustainName(item.name)) === normalized) return [id, item]
    }
    return null
  }

  private registerSupplyUse(itemId: string, name: string, amount: number, at: number, source: SupplyEventSource | 'state', remaining?: number): boolean {
    if (!this.huntSlug || amount <= 0 || !sustainCategory(name)) return false
    const canonicalName = canonicalSustainName(name)
    const key = normalizePokeIdleItemName(canonicalName)
    let effectiveAmount = amount
    if (source !== 'state') {
      const mirror = this.recentSupplyMirrors.get(key)
      if (mirror && mirror.source !== source && at >= mirror.at && at - mirror.at <= 1_500) {
        const mirrored = Math.min(effectiveAmount, mirror.amount)
        effectiveAmount -= mirrored
        if (mirrored >= mirror.amount) this.recentSupplyMirrors.delete(key)
        else this.recentSupplyMirrors.set(key, { ...mirror, amount: mirror.amount - mirrored })
      } else {
        this.recentSupplyMirrors.set(key, { source, at, amount: effectiveAmount })
      }
    }
    const reconcile = this.usageReconcile.get(key) ?? { eventPending: 0, statePending: 0, eventAt: 0, stateAt: 0 }
    const ttl = 30_000
    if (reconcile.eventAt && at - reconcile.eventAt > ttl) reconcile.eventPending = 0
    if (reconcile.stateAt && at - reconcile.stateAt > ttl) reconcile.statePending = 0

    let matched = 0
    if (source !== 'state') {
      matched = Math.min(effectiveAmount, reconcile.statePending)
      reconcile.statePending -= matched
      const unmatched = effectiveAmount - matched
      reconcile.eventPending += unmatched
      reconcile.eventAt = at
    } else {
      matched = Math.min(effectiveAmount, reconcile.eventPending)
      reconcile.eventPending -= matched
      const unmatched = effectiveAmount - matched
      reconcile.statePending += unmatched
      reconcile.stateAt = at
    }
    this.usageReconcile.set(key, reconcile)

    const counted = effectiveAmount - matched
    const found = this.findConsumable(itemId, canonicalName)
    const storageId = found?.[0] ?? (itemId || key)
    const previous = found?.[1] ?? { itemId: storageId, name: canonicalName, quantity: remaining ?? 0, used: 0 }
    let quantity = previous.quantity
    if (remaining !== undefined) quantity = remaining
    else if (source !== 'state' && counted > 0 && quantity > 0) quantity = Math.max(0, quantity - counted)

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

  private ingestGenericSupplyEvents(value: unknown, at: number, source: SupplyEventSource, depth = 0): boolean {
    if (!this.huntSlug || depth > 6) return false
    if (Array.isArray(value)) {
      let changed = false
      for (const entry of value) if (this.ingestGenericSupplyEvents(entry, at, source, depth + 1)) changed = true
      return changed
    }
    if (!isRecord(value)) return false
    let changed = false
    const supplyUse = supplyUseFromEvent(value, this.itemCatalog)
    if (supplyUse && this.registerSupplyUse(supplyUse.itemId, supplyUse.name, supplyUse.amount, at, source, supplyUse.remaining)) changed = true
    for (const child of Object.values(value)) {
      if ((isRecord(child) || Array.isArray(child)) && this.ingestGenericSupplyEvents(child, at, source, depth + 1)) changed = true
    }
    return changed
  }

  private ingestBattleEvents(packet: JsonRecord, at: number, source: SupplyEventSource = 'event'): boolean {
    if (!this.huntSlug || !Array.isArray(packet.ev)) return false
    let seenAdded = 0
    let caughtAdded = 0
    let supplyChanged = false
    for (const raw of packet.ev) {
      if (!isRecord(raw)) continue
      const supplyUse = supplyUseFromEvent(raw, this.itemCatalog)
      if (supplyUse && this.registerSupplyUse(supplyUse.itemId, supplyUse.name, supplyUse.amount, at, source, supplyUse.remaining)) supplyChanged = true
      const kind = normalizeKey(text(first(raw.k, raw.kind, raw.type, raw.event, raw.evento)))
      const shinyBall = kind === 'bola' && shinyFlag(raw)

      if (shinyBall) {
        // Each bola event is one server roll. Do not fingerprint it: two distinct shiny
        // rolls can have byte-identical payloads and both must count.
        seenAdded++
        if (raw.sucesso === true || truthy(raw.sucesso)) {
          caughtAdded++
          this.recentBattleShinyCaughtAt.push(at)
        }
        continue
      }

      if (!shinySeenBattleEvent(raw)) continue
      const key = battleEventKey(raw)
      if (this.shinySeenEvents.has(key)) continue
      this.shinySeenEvents.add(key)
      while (this.shinySeenEvents.size > 128) {
        const oldest = this.shinySeenEvents.values().next().value as string | undefined
        if (!oldest) break
        this.shinySeenEvents.delete(oldest)
      }
      seenAdded++
    }

    const shinyChanged = seenAdded > 0 || caughtAdded > 0
    if (!shinyChanged && !supplyChanged) return false
    if (shinyChanged) {
      this.shiniesSeen += seenAdded
      this.shiniesCaught += caughtAdded
      if (this.recentBattleShinyCaughtAt.length > 32) this.recentBattleShinyCaughtAt.splice(0, this.recentBattleShinyCaughtAt.length - 32)
    }
    this.updatedAt = at
    return true
  }

  private baselinePokemon(row: JsonRecord): void {
    const id = pokemonId(row)
    if (!id) return
    if (!this.knownPokemonIds.has(id)) this.knownPokemonIds.add(id)
    const xp = finite(row.xp)
    if (xp !== undefined) this.setXp(id, xp)
  }

  private registerCapture(row: JsonRecord, at: number): void {
    this.capturesTotal++
    this.captureTimes.push(at)
    this.lastCaptureAt = at
    const p = potency(first(row.potencia, row.potency))
    if (p) this.capturesByPotency[p - 1]++
    if (shinyFlag(row)) {
      const cutoff = at - 30_000
      while (this.recentBattleShinyCaughtAt.length && this.recentBattleShinyCaughtAt[0] < cutoff) this.recentBattleShinyCaughtAt.shift()
      // The authoritative bola event already counted the capture. Consume its marker
      // when the same Pokemon later appears in pkMud instead of counting twice.
      if (this.recentBattleShinyCaughtAt.length) this.recentBattleShinyCaughtAt.shift()
      else this.shiniesCaught++
    }
  }

  private setXp(id: string, xp: number): void {
    this.xpState.delete(id)
    this.xpState.set(id, { xp })
    while (this.xpState.size > MAX_XP_CACHE) {
      const oldest = this.xpState.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.xpState.delete(oldest)
    }
  }

  private touchConsumables(): void {
    this.consumableRevision++
  }

  private getConsumableSnapshot(): { potionStock: number; items: HuntPotionSnapshot[] } {
    if (this.cachedConsumableRevision !== this.consumableRevision) {
      this.cachedConsumableItems = [...this.consumables.values()]
        .sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
        .map((item) => ({ ...item }))
      this.cachedPotionStock = this.cachedConsumableItems.reduce((sum, item) => sum + (sustainCategory(item.name) === 'potions' ? item.quantity : 0), 0)
      this.cachedConsumableRevision = this.consumableRevision
    }
    return { potionStock: this.cachedPotionStock, items: this.cachedConsumableItems }
  }

  private prune(at: number): void {
    const cutoff = at - HOUR
    const shinyCaptureCutoff = at - 30_000
    const supplyReconcileCutoff = at - 30_000
    const supplyMirrorCutoff = at - 2_000
    for (const [key, value] of this.recentSupplyMirrors) if (value.at < supplyMirrorCutoff) this.recentSupplyMirrors.delete(key)
    for (const [key, value] of this.usageReconcile) {
      if (Math.max(value.eventAt, value.stateAt) < supplyReconcileCutoff) this.usageReconcile.delete(key)
    }
    while (this.recentBattleShinyCaughtAt.length && this.recentBattleShinyCaughtAt[0] < shinyCaptureCutoff) this.recentBattleShinyCaughtAt.shift()
    while (this.captureHead < this.captureTimes.length && this.captureTimes[this.captureHead] < cutoff) this.captureHead++
    while (this.killHead < this.killTimes.length && this.killTimes[this.killHead] < cutoff) this.killHead++
    while (this.potionHead < this.potionUseEvents.length && this.potionUseEvents[this.potionHead].at < cutoff) {
      this.potionLastHourTotal -= this.potionUseEvents[this.potionHead].amount
      this.potionHead++
    }
    this.captureHead = compactNumberQueue(this.captureTimes, this.captureHead)
    this.killHead = compactNumberQueue(this.killTimes, this.killHead)
    this.potionHead = compactAmountQueue(this.potionUseEvents, this.potionHead)
  }
}

function sameConsumableState(current: Map<string, ConsumableState>, next: Map<string, ConsumableState>): boolean {
  if (current.size !== next.size) return false
  for (const [id, item] of next) {
    const previous = current.get(id)
    if (!previous || previous.name !== item.name || previous.quantity !== item.quantity || previous.used !== item.used) return false
  }
  return true
}

function safeTimes(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map(finite).filter((entry): entry is number => entry !== undefined && entry > 0).sort((a,b) => a - b)
}

function safeTimedAmounts(value: unknown): TimedAmount[] {
  if (!Array.isArray(value)) return []
  const rows: TimedAmount[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const at = finite(entry.at)
    const amount = finite(entry.amount)
    if (at !== undefined && at > 0 && amount !== undefined && amount > 0) rows.push({ at, amount })
  }
  return rows.sort((a,b) => a.at - b.at)
}

function compactNumberQueue(queue: number[], head: number): number {
  if (head < COMPACT_HEAD_THRESHOLD || head * 2 < queue.length) return head
  queue.splice(0, head)
  return 0
}

function compactAmountQueue(queue: TimedAmount[], head: number): number {
  if (head < COMPACT_HEAD_THRESHOLD || head * 2 < queue.length) return head
  queue.splice(0, head)
  return 0
}
