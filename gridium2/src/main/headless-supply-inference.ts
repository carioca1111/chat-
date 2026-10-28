import { canonicalPokeIdleItem, normalizePokeIdleItemName } from '../shared/pokeidle-item-catalog'

type JsonRecord = Record<string, unknown>
export type SupplyInferenceTransport = 'received' | 'sent'
export type SupplyInferenceSource = 'event' | 'sent'

export interface LearnedSupplyCatalogEntry {
  itemId: string
  name: string
}

export interface InferredSupplyUse {
  itemId: string
  name: string
  amount: number
  remaining?: number
  source: SupplyInferenceSource
}

export interface InferredSupplyStock {
  itemId: string
  name: string
  quantity: number
}

export interface HeadlessSupplyInferenceResult {
  learned: LearnedSupplyCatalogEntry[]
  uses: InferredSupplyUse[]
  stock: InferredSupplyStock[]
}

interface PendingAction {
  itemId: string
  at: number
  source: SupplyInferenceSource
  categoryHint: 'potions' | 'revives' | null
  remaining?: number
}

interface HpState {
  current: number
  max?: number
  at: number
}

const PENDING_TTL_MS = 5_000
const HP_TTL_MS = 30_000
const POTION_BY_HEAL = new Map<number, string>([
  [60, 'Small Potion'],
  [150, 'Great Potion'],
  [400, 'Ultra Potion'],
  [1000, 'Hyper Potion'],
  [3000, 'Ultimate Potion']
])

const finite = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim().replace(/\s+/g, '')
  if (!cleaned) return undefined
  const normalized = cleaned.includes('.') && cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : /^[0-9]{1,3}(?:[.,][0-9]{3})+$/.test(cleaned)
      ? cleaned.replace(/[.,]/g, '')
      : cleaned.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const first = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null)
const text = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 160) : ''
const normalizeKey = (value: string): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

function directCanonicalName(value: JsonRecord): string {
  const nested = isRecord(value.item) ? value.item
    : isRecord(value.definition) ? value.definition
      : isRecord(value.def) ? value.def
        : undefined
  const candidates = [
    first(value.itemName, value.itemNome, value.nameItem, value.nomeItem, value.name, value.nome, value.label, value.slug, value.key),
    nested ? first(nested.name, nested.nome, nested.label, nested.slug, nested.key) : undefined
  ]
  for (const candidate of candidates) {
    const raw = text(candidate)
    if (!raw) continue
    const canonical = canonicalPokeIdleItem(raw)
    if (canonical?.category === 'potions' || canonical?.category === 'revives') return canonical.name
  }
  return ''
}

function categoryOf(name: string): 'potions' | 'revives' | null {
  const canonical = canonicalPokeIdleItem(name)
  return canonical?.category === 'potions' || canonical?.category === 'revives' ? canonical.category : null
}

function actionSemantic(value: JsonRecord): string {
  return normalizeKey([
    text(first(value.k, value.kind, value.type, value.event, value.evento, value.t)),
    text(first(value.action, value.acao, value.operation, value.operacao, value.command, value.comando, value.cmd))
  ].filter(Boolean).join(' '))
}

function itemIdOf(value: JsonRecord): string {
  const nested = isRecord(value.item) ? value.item
    : isRecord(value.definition) ? value.definition
      : isRecord(value.def) ? value.def
        : undefined
  const id = first(value.itemId, value.item_id, value.i, value.itemKey, value.itemSlug, nested?.itemId, nested?.item_id, nested?.id, nested?.key, nested?.slug)
  return id === undefined || id === null ? '' : String(id)
}

function remainingOf(value: JsonRecord): number | undefined {
  const raw = finite(first(value.remaining, value.restante, value.sobra, value.quantityLeft, value.qtdRestante, value.stock, value.estoque))
  return raw !== undefined && raw >= 0 ? Math.floor(raw) : undefined
}

function inferFromDirectEffect(value: JsonRecord, categoryHint: 'potions' | 'revives' | null): string {
  const heal = finite(first(value.heal, value.healing, value.healAmount, value.healHp, value.hpRestore, value.restoreHp, value.cura, value.curaHp, value.hpCura, value.restoreAmount))
  if (categoryHint !== 'revives' && heal !== undefined) {
    const potion = POTION_BY_HEAL.get(Math.round(heal))
    if (potion) return potion
  }
  const percent = finite(first(value.healPercent, value.hpPercent, value.restorePercent, value.curaPercent, value.percent, value.porcentagem))
  if (percent !== undefined) {
    const rounded = Math.round(percent)
    if (categoryHint === 'revives') {
      if (rounded === 10) return 'Revive'
      if (rounded === 100) return 'Max Revive'
    }
    if (categoryHint !== 'revives' && rounded === 50) return 'Golden Potion'
  }
  return ''
}

function hpKey(value: JsonRecord, fallback: string): string {
  const id = first(value.pokemonInstanceId, value.pokemonId, value.pkId, value.activeId, value.id, value.uid, value.slot, value.side, value.owner)
  return id === undefined || id === null || String(id) === '' ? fallback : String(id)
}

function hpCurrent(value: JsonRecord): number | undefined {
  return finite(first(value.currentHp, value.hpCurrent, value.hpAtual, value.vidaAtual, value.currentHealth, value.health, value.hp, value.vida))
}

function hpMax(value: JsonRecord): number | undefined {
  return finite(first(value.maxHp, value.hpMax, value.maxHealth, value.healthMax, value.vidaMax, value.vidaMaxima, value.hpTotal))
}

function hpBefore(value: JsonRecord): number | undefined {
  return finite(first(value.hpBefore, value.beforeHp, value.hpAntes, value.hpAnterior, value.vidaAntes, value.vidaAnterior, value.previousHp, value.prevHp))
}

function hpAfter(value: JsonRecord): number | undefined {
  return finite(first(value.hpAfter, value.afterHp, value.hpDepois, value.hpAtual, value.currentHp, value.vidaDepois, value.vidaAtual, value.currentHealth, value.health))
}

function inferFromHp(before: number, after: number, max: number | undefined): string {
  if (!(after > before)) return ''
  if (before <= 0 && max && max > 0) {
    const ratio = after / max
    if (ratio >= 0.92) return 'Max Revive'
    if (ratio >= 0.06 && ratio <= 0.2) return 'Revive'
  }
  const delta = after - before
  if (max && max > 0 && after < max - 0.5) {
    const goldenTarget = max * 0.5
    if (Math.abs(delta - goldenTarget) <= Math.max(1, max * 0.015)) return 'Golden Potion'
    for (const [amount, name] of POTION_BY_HEAL) if (Math.abs(delta - amount) <= 1) return name
  }
  if (!max) {
    for (const [amount, name] of POTION_BY_HEAL) if (Math.abs(delta - amount) <= 1) return name
  }
  return ''
}

function looksInventoryLike(path: string): boolean {
  return /(item|iten|invent|bag|mochila|bolsa|consum|supply|supriment|potion|pocao|revive)/.test(normalizeKey(path))
}

export class HeadlessSupplyInference {
  private readonly catalog = new Map<string, string>()
  private readonly rawStock = new Map<string, number>()
  private readonly hp = new Map<string, HpState>()
  private pending: PendingAction[] = []

  reset(preserveCatalog = true): void {
    this.pending = []
    this.hp.clear()
    this.rawStock.clear()
    if (!preserveCatalog) this.catalog.clear()
  }

  ingest(packet: unknown, at = Date.now(), transport: SupplyInferenceTransport = 'received'): HeadlessSupplyInferenceResult {
    const result: HeadlessSupplyInferenceResult = { learned: [], uses: [], stock: [] }
    this.prune(at)
    this.scan(packet, at, transport, result, '', 0)
    this.emitMappedStock(result)
    return result
  }

  private scan(value: unknown, at: number, transport: SupplyInferenceTransport, result: HeadlessSupplyInferenceResult, path: string, depth: number): void {
    if (depth > 8) return
    if (Array.isArray(value)) {
      if (looksInventoryLike(path) && value.length >= 2 && (typeof value[0] === 'string' || typeof value[0] === 'number')) {
        const quantity = finite(value[1])
        if (quantity !== undefined && quantity >= 0) this.rawStock.set(String(value[0]), Math.floor(quantity))
      }
      for (let index = 0; index < value.length; index++) this.scan(value[index], at, transport, result, `${path}[${index}]`, depth + 1)
      return
    }
    if (!isRecord(value)) return

    const directName = directCanonicalName(value)
    const itemId = itemIdOf(value)
    if (directName && itemId) this.learn(itemId, directName, result)

    const semantic = actionSemantic(value)
    const excluded = /(buy|sell|compr|vend|market|shop|loot|drop|reward|premi)/.test(semantic)
    const strongAction = /(use|used|usar|usou|consum|heal|cura|potion|pocao|revive|reviver)/.test(semantic)
    if (!excluded && strongAction && itemId) {
      const known = directName || this.catalog.get(itemId) || ''
      const semanticCategory: 'potions' | 'revives' | null = /(revive|reviver)/.test(semantic) ? 'revives' : /(potion|pocao|heal|cura)/.test(semantic) ? 'potions' : null
      const categoryHint = categoryOf(known) ?? semanticCategory
      const effectName = inferFromDirectEffect(value, categoryHint)
      if (effectName) {
        this.learn(itemId, effectName, result)
        if (!known) result.uses.push({ itemId, name: effectName, amount: 1, remaining: remainingOf(value), source: transport === 'sent' ? 'sent' : 'event' })
      } else if (!known) {
        this.pending.push({ itemId, at, source: transport === 'sent' ? 'sent' : 'event', categoryHint, remaining: remainingOf(value) })
      }
    }

    if (looksInventoryLike(path)) this.scanStockRecord(value, result)
    this.scanHpRecord(value, at, result, path || 'active')

    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key
      if (looksInventoryLike(childPath) && (typeof child === 'number' || typeof child === 'string')) {
        const quantity = finite(child)
        if (quantity !== undefined && quantity >= 0) this.rawStock.set(key, Math.floor(quantity))
      }
      if (isRecord(child) || Array.isArray(child)) this.scan(child, at, transport, result, childPath, depth + 1)
    }
  }

  private scanStockRecord(value: JsonRecord, result: HeadlessSupplyInferenceResult): void {
    const itemId = itemIdOf(value)
    const quantity = finite(first(value.qtd, value.quantidade, value.quantity, value.qty, value.count, value.total, value.estoque, value.stock, value.q, value.qt, value.quant))
    if (itemId && quantity !== undefined && quantity >= 0) this.rawStock.set(itemId, Math.floor(quantity))

    for (const [key, child] of Object.entries(value)) {
      if (typeof child !== 'number' && typeof child !== 'string') continue
      const numeric = finite(child)
      if (numeric === undefined || numeric < 0) continue
      if (this.catalog.has(key) || /^\d+$/.test(key) || /potion|pocao|revive/i.test(key)) this.rawStock.set(key, Math.floor(numeric))
    }

    const name = directCanonicalName(value)
    if (itemId && name && quantity !== undefined && quantity >= 0) {
      this.learn(itemId, name, result)
      result.stock.push({ itemId, name, quantity: Math.floor(quantity) })
    }
  }

  private scanHpRecord(value: JsonRecord, at: number, result: HeadlessSupplyInferenceResult, fallbackKey: string): void {
    const before = hpBefore(value)
    const after = hpAfter(value)
    const max = hpMax(value)
    const key = hpKey(value, fallbackKey)
    if (before !== undefined && after !== undefined) this.resolveHpTransition(key, before, after, max, at, result)

    const current = hpCurrent(value)
    if (current === undefined) return
    const previous = this.hp.get(key)
    if (previous && at >= previous.at && at - previous.at <= HP_TTL_MS && current > previous.current) {
      this.resolveHpTransition(key, previous.current, current, max ?? previous.max, at, result)
    }
    this.hp.set(key, { current, max: max ?? previous?.max, at })
  }

  private resolveHpTransition(_key: string, before: number, after: number, max: number | undefined, at: number, result: HeadlessSupplyInferenceResult): void {
    const name = inferFromHp(before, after, max)
    if (!name) return
    const category = categoryOf(name)
    const candidates = this.pending
      .filter((pending) => at >= pending.at && at - pending.at <= PENDING_TTL_MS && (!pending.categoryHint || pending.categoryHint === category))
      .sort((a, b) => b.at - a.at)
    const pending = candidates[0]
    if (!pending) return
    this.learn(pending.itemId, name, result)
    result.uses.push({ itemId: pending.itemId, name, amount: 1, remaining: pending.remaining, source: pending.source })
    const index = this.pending.indexOf(pending)
    if (index >= 0) this.pending.splice(index, 1)
  }

  private learn(itemId: string, name: string, result: HeadlessSupplyInferenceResult): void {
    const canonical = canonicalPokeIdleItem(name)
    if (!canonical || (canonical.category !== 'potions' && canonical.category !== 'revives')) return
    const normalizedId = String(itemId)
    if (this.catalog.get(normalizedId) === canonical.name) return
    this.catalog.set(normalizedId, canonical.name)
    result.learned.push({ itemId: normalizedId, name: canonical.name })
  }

  private emitMappedStock(result: HeadlessSupplyInferenceResult): void {
    const emitted = new Set(result.stock.map((row) => `${row.itemId}|${row.name}`))
    for (const [itemId, quantity] of this.rawStock) {
      const name = this.catalog.get(itemId)
      if (!name) continue
      const key = `${itemId}|${name}`
      if (emitted.has(key)) continue
      emitted.add(key)
      result.stock.push({ itemId, name, quantity })
    }
  }

  private prune(at: number): void {
    this.pending = this.pending.filter((pending) => at >= pending.at && at - pending.at <= PENDING_TTL_MS)
    for (const [key, state] of this.hp) if (at < state.at || at - state.at > HP_TTL_MS) this.hp.delete(key)
  }
}

export function normalizeInferredSupplyName(name: string): string {
  return normalizePokeIdleItemName(name)
}
