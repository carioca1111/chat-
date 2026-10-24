import type { HuntSessionSnapshot } from '../shared/contracts'
import { canonicalPokeIdleItem, normalizePokeIdleItemName } from '../shared/pokeidle-item-catalog'
import { PokemonIdLedger } from './pokemon-id-ledger'

type JsonRecord = Record<string, unknown>
interface XpState { xp: number }
interface PotionState { itemId: string; name: string; quantity: number; used: number }
interface TimedAmount { at: number; amount: number }

const HOUR = 60 * 60 * 1000
const MAX_XP_CACHE = 20_000
const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bag', 'consumables', 'consumiveis']

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const first = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null)
const finite = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}
const text = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 100) : ''
const truthy = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true'
const pokemonId = (row: JsonRecord): string => {
  const id = first(row.id, row.pokemonInstanceId, row.uid)
  return id === undefined || id === null ? '' : String(id)
}
const potency = (value: unknown): 1|2|3|4|5|undefined => {
  const parsed = finite(typeof value === 'string' ? value.replace(/^P/i, '') : value)
  return parsed && [1,2,3,4,5].includes(parsed) ? parsed as 1|2|3|4|5 : undefined
}
const huntSlugOf = (estado: JsonRecord): string => text(first(estado.huntSlug, estado.hunt))

function isPotionName(name: string): boolean {
  const canonical = canonicalPokeIdleItem(name)
  if (canonical?.category === 'potions') return true
  const normalized = normalizePokeIdleItemName(name)
  return /\b(potion|pocao|pocoes|potions)\b/.test(normalized)
}

function inventoryRows(estado: JsonRecord): Array<{ itemId: string; name: string; quantity: number }> {
  const rows = new Map<string, { itemId: string; name: string; quantity: number }>()
  const add = (idRaw: unknown, value: unknown, fallbackName = ''): void => {
    const itemId = idRaw === undefined || idRaw === null ? '' : String(idRaw)
    if (!itemId) return
    if (typeof value === 'number' || typeof value === 'string') {
      const quantity = finite(value)
      if (quantity !== undefined && quantity >= 0) rows.set(itemId, { itemId, name: fallbackName || `Item #${itemId}`, quantity: Math.floor(quantity) })
      return
    }
    if (!isRecord(value)) return
    const quantity = finite(first(value.qtd, value.quantidade, value.qty, value.count, value.amount, value.total, value.estoque))
    if (quantity === undefined || quantity < 0) return
    const name = text(first(value.nome, value.name, value.itemNome, value.label)) || fallbackName || `Item #${itemId}`
    rows.set(itemId, { itemId, name, quantity: Math.floor(quantity) })
  }
  for (const key of INVENTORY_KEYS) {
    const container = estado[key]
    if (Array.isArray(container)) {
      for (const row of container) if (isRecord(row)) add(first(row.itemId, row.id, row.item_id), row)
    } else if (isRecord(container)) {
      for (const [mapKey, value] of Object.entries(container)) {
        if (isRecord(value)) add(first(value.itemId, value.id, value.item_id, mapKey), value, /^\d+$/.test(mapKey) ? '' : mapKey)
        else add(mapKey, value, /^\d+$/.test(mapKey) ? '' : mapKey)
      }
    }
  }
  return [...rows.values()]
}

export class HuntSessionRuntime {
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
  private readonly potions = new Map<string, PotionState>()
  private captureTimes: number[] = []
  private killTimes: number[] = []
  private potionUseEvents: TimedAmount[] = []

  ingest(packet: unknown, at = Date.now()): boolean {
    if (!isRecord(packet)) return false
    const type = String(packet.t || '')
    if (type !== 'welcome' && type !== 'estado') return false
    const estado = isRecord(packet.estado) ? packet.estado : null
    if (!estado) return false

    const nextAccountRaw = first(estado.id, estado.accountId, estado.userId)
    const nextAccountId = nextAccountRaw === undefined || nextAccountRaw === null ? '' : String(nextAccountRaw)
    const nextHunt = huntSlugOf(estado)
    const accountChanged = Boolean(nextAccountId && this.accountId && nextAccountId !== this.accountId)
    const huntChanged = Boolean(nextHunt && this.huntSlug && nextHunt !== this.huntSlug)
    if (accountChanged || huntChanged) this.reset(at)
    if (nextAccountId) this.accountId = nextAccountId
    if (nextHunt) this.huntSlug = nextHunt

    const fullState = type === 'welcome' || estado.cheio === true || accountChanged || huntChanged
    const rows: JsonRecord[] = []
    for (const key of ['pokemons','pkMud']) {
      const value = estado[key]
      if (Array.isArray(value)) for (const row of value) if (isRecord(row)) rows.push(row)
    }

    let changed = false
    if (fullState) {
      this.knownPokemonIds.clear()
      this.xpState.clear()
      for (const row of rows) this.baselinePokemon(row)
    } else {
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

    const seen = finite(first(estado.shiniesSeen, estado.shinySeen, estado.shinysVistos, estado.shiniesVistos))
    if (seen !== undefined && seen >= 0) {
      if (this.shiniesSeenBaseline === null) this.shiniesSeenBaseline = seen
      const nextSeen = Math.max(0, Math.floor(seen - this.shiniesSeenBaseline))
      if (nextSeen !== this.shiniesSeen) { this.shiniesSeen = nextSeen; changed = true }
    }

    const inventory = inventoryRows(estado).filter((row) => isPotionName(row.name))
    if (fullState && inventory.length) this.potions.clear()
    for (const row of inventory) {
      const previous = this.potions.get(row.itemId)
      const usedBefore = previous?.used ?? 0
      if (!fullState && previous && row.quantity < previous.quantity) {
        const used = previous.quantity - row.quantity
        this.potionsUsedTotal += used
        this.potionUseEvents.push({ at, amount: used })
        changed = true
        this.potions.set(row.itemId, { ...row, used: usedBefore + used })
      } else this.potions.set(row.itemId, { ...row, used: usedBefore })
    }

    this.prune(at)
    if (changed || fullState) this.updatedAt = at
    return changed
  }

  snapshot(at = Date.now()): HuntSessionSnapshot {
    this.prune(at)
    return {
      huntSlug: this.huntSlug,
      sessionStartedAt: this.sessionStartedAt,
      capturesTotal: this.capturesTotal,
      capturesLastHour: this.captureTimes.length,
      capturesByPotency: [...this.capturesByPotency] as [number, number, number, number, number],
      shiniesSeen: this.shiniesSeen,
      shiniesCaught: this.shiniesCaught,
      killsEstimatedTotal: this.killsEstimatedTotal,
      killsEstimatedLastHour: this.killTimes.length,
      potionStock: [...this.potions.values()].reduce((sum, item) => sum + item.quantity, 0),
      potionsUsedTotal: this.potionsUsedTotal,
      potionsUsedLastHour: this.potionUseEvents.reduce((sum, event) => sum + event.amount, 0),
      potionItems: [...this.potions.values()].sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).map((item) => ({ ...item })),
      lastCaptureAt: this.lastCaptureAt,
      updatedAt: this.updatedAt
    }
  }

  reset(at = Date.now()): void {
    this.sessionStartedAt = at
    this.huntSlug = ''
    this.accountId = ''
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
    this.potions.clear()
    this.captureTimes = []
    this.killTimes = []
    this.potionUseEvents = []
  }

  diagnostics() {
    return { huntSlug: this.huntSlug, captures: this.capturesTotal, killsEstimated: this.killsEstimatedTotal, potionItems: this.potions.size, xpState: this.xpState.size }
  }

  private baselinePokemon(row: JsonRecord): void {
    const id = pokemonId(row)
    if (!id) return
    this.knownPokemonIds.add(id)
    const xp = finite(row.xp)
    if (xp !== undefined) this.setXp(id, xp)
  }

  private registerCapture(row: JsonRecord, at: number): void {
    this.capturesTotal++
    this.captureTimes.push(at)
    this.lastCaptureAt = at
    const p = potency(first(row.potencia, row.potency))
    if (p) this.capturesByPotency[p - 1]++
    if (truthy(first(row.shiny, row.isShiny))) this.shiniesCaught++
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

  private prune(at: number): void {
    const cutoff = at - HOUR
    if (this.captureTimes.length) this.captureTimes = this.captureTimes.filter((value) => value >= cutoff && value <= at)
    if (this.killTimes.length) this.killTimes = this.killTimes.filter((value) => value >= cutoff && value <= at)
    if (this.potionUseEvents.length) this.potionUseEvents = this.potionUseEvents.filter((value) => value.at >= cutoff && value.at <= at)
  }
}
