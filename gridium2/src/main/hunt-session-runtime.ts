import type { HuntPotionSnapshot, HuntSessionSnapshot } from '../shared/contracts'
import { canonicalPokeIdleItem, normalizePokeIdleItemName } from '../shared/pokeidle-item-catalog'
import { PokemonIdLedger } from './pokemon-id-ledger'

type JsonRecord = Record<string, unknown>
interface XpState { xp: number }
interface PotionState { itemId: string; name: string; quantity: number; used: number }
interface TimedAmount { at: number; amount: number }

const HOUR = 60 * 60 * 1000
const MAX_XP_CACHE = 20_000
const COMPACT_HEAD_THRESHOLD = 1_024
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
const huntIdentity = (slug: string): string => slug.trim().toLowerCase().replace(/[\s-]+/g, '_')
const hasHuntSignal = (estado: JsonRecord): boolean => Object.prototype.hasOwnProperty.call(estado, 'huntSlug') || Object.prototype.hasOwnProperty.call(estado, 'hunt')

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
    const quantity = finite(first(value.qtd, value.quantidade, value.quantity, value.qty, value.count, value.amount, value.total, value.estoque))
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
  private captureHead = 0
  private killTimes: number[] = []
  private killHead = 0
  private potionUseEvents: TimedAmount[] = []
  private potionHead = 0
  private potionLastHourTotal = 0
  private potionRevision = 0
  private cachedPotionRevision = -1
  private cachedPotionStock = 0
  private cachedPotionItems: HuntPotionSnapshot[] = []

  ingest(packet: unknown, at = Date.now()): boolean {
    if (!isRecord(packet)) return false
    const type = String(packet.t || '')
    if (type !== 'welcome' && type !== 'estado') return false
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
        // Formatting/case changed, but it is still the same Hunt.
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
      // A reconnect is not a new Hunt. Keep the exact identity ledger and counters,
      // only rebuild volatile XP baselines from the fresh full state.
      this.xpState.clear()
      for (const row of rows) this.baselinePokemon(row)
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
      const seen = finite(first(estado.shiniesSeen, estado.shinySeen, estado.shinysVistos, estado.shiniesVistos))
      if (seen !== undefined && seen >= 0) {
        if (this.shiniesSeenBaseline === null) this.shiniesSeenBaseline = seen
        const nextSeen = Math.max(0, Math.floor(seen - this.shiniesSeenBaseline))
        if (nextSeen !== this.shiniesSeen) { this.shiniesSeen = nextSeen; changed = true }
      }

      const inventory = inventoryRows(estado).filter((row) => isPotionName(row.name))
      if (inventory.length) {
        if (fullState) {
          const replacement = new Map<string, PotionState>()
          for (const row of inventory) {
            const previous = this.potions.get(row.itemId)
            replacement.set(row.itemId, { ...row, used: previous?.used ?? 0 })
          }
          if (!samePotionState(this.potions, replacement)) {
            this.potions.clear()
            for (const [id, item] of replacement) this.potions.set(id, item)
            this.touchPotions()
            changed = true
          }
        } else {
          for (const row of inventory) {
            const previous = this.potions.get(row.itemId)
            const usedBefore = previous?.used ?? 0
            if (previous && row.quantity < previous.quantity) {
              const used = previous.quantity - row.quantity
              this.potionsUsedTotal += used
              this.potionUseEvents.push({ at, amount: used })
              this.potionLastHourTotal += used
              this.potions.set(row.itemId, { ...row, used: usedBefore + used })
              this.touchPotions()
              changed = true
            } else if (!previous || previous.quantity !== row.quantity || previous.name !== row.name) {
              this.potions.set(row.itemId, { ...row, used: usedBefore })
              this.touchPotions()
              changed = true
            }
          }
        }
      }
    }

    this.prune(at)
    if (changed) this.updatedAt = at
    return changed
  }

  snapshot(at = Date.now()): HuntSessionSnapshot {
    this.prune(at)
    const potionSnapshot = this.getPotionSnapshot()
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
      potionStock: potionSnapshot.stock,
      potionsUsedTotal: this.potionsUsedTotal,
      potionsUsedLastHour: this.potionLastHourTotal,
      potionItems: potionSnapshot.items,
      lastCaptureAt: this.lastCaptureAt,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Transport/page resets are intentionally non-destructive. The Hunt session is
   * ended only by an explicit server Hunt exit, a direct Hunt switch, or account switch.
   */
  reset(at = Date.now()): void {
    this.prune(at)
  }

  diagnostics() {
    return {
      huntSlug: this.huntSlug,
      captures: this.capturesTotal,
      killsEstimated: this.killsEstimatedTotal,
      potionItems: this.potions.size,
      xpState: this.xpState.size,
      captureEvents: this.captureTimes.length - this.captureHead,
      killEvents: this.killTimes.length - this.killHead,
      potionEvents: this.potionUseEvents.length - this.potionHead
    }
  }

  private startHunt(huntSlug: string, at: number): void {
    this.huntSlug = huntSlug
    this.sessionStartedAt = at
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
    this.potions.clear()
    this.captureTimes = []
    this.captureHead = 0
    this.killTimes = []
    this.killHead = 0
    this.potionUseEvents = []
    this.potionHead = 0
    this.potionLastHourTotal = 0
    this.touchPotions()
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

  private touchPotions(): void {
    this.potionRevision++
  }

  private getPotionSnapshot(): { stock: number; items: HuntPotionSnapshot[] } {
    if (this.cachedPotionRevision !== this.potionRevision) {
      this.cachedPotionItems = [...this.potions.values()]
        .sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
        .map((item) => ({ ...item }))
      this.cachedPotionStock = this.cachedPotionItems.reduce((sum, item) => sum + item.quantity, 0)
      this.cachedPotionRevision = this.potionRevision
    }
    return { stock: this.cachedPotionStock, items: this.cachedPotionItems }
  }

  private prune(at: number): void {
    const cutoff = at - HOUR
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

function samePotionState(current: Map<string, PotionState>, next: Map<string, PotionState>): boolean {
  if (current.size !== next.size) return false
  for (const [id, item] of next) {
    const previous = current.get(id)
    if (!previous || previous.name !== item.name || previous.quantity !== item.quantity || previous.used !== item.used) return false
  }
  return true
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
