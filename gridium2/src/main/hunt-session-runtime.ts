import { app } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HuntPotionSnapshot, HuntSessionSnapshot } from '../shared/contracts'
import { canonicalPokeIdleItem, normalizePokeIdleItemName } from '../shared/pokeidle-item-catalog'
import { PokemonIdLedger } from './pokemon-id-ledger'

type JsonRecord = Record<string, unknown>
interface XpState { xp: number }
interface PotionState { itemId: string; name: string; quantity: number; used: number }
interface TimedAmount { at: number; amount: number }

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
const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bag', 'consumables', 'consumiveis']
const HUNT_SESSION_FILE = 'gridium2-hunt-sessions-v1.json'
const PERSIST_DELAY_MS = 15_000
const CONTINUITY_SESSION_MS = (34 * 60 + 37) * 60 * 1000

type LocalSlotId = 1 | 2 | 3 | 4
let nextLocalSlot = 0
let storedSessions: StoredHuntSessions | null = null
let storedSessionsSeeded = false
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
const normalizeKey = (value: string): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

function allocateLocalSlot(): LocalSlotId {
  const id = (nextLocalSlot % 4) + 1
  nextLocalSlot++
  return id as LocalSlotId
}

function runtimeStoragePath(): string | null {
  try {
    if (!app || typeof app.getPath !== 'function' || !app.isReady()) return null
    return join(app.getPath('userData'), HUNT_SESSION_FILE)
  } catch { return null }
}

function recentTimes(count: number, at: number): number[] {
  if (count <= 0) return []
  const start = at - HOUR + 5_000
  const span = HOUR - 10_000
  return Array.from({ length: count }, (_, index) => start + Math.floor(span * (index + 1) / (count + 1)))
}

function continuitySeed(at: number): StoredHuntSessions {
  const base = (slot: 2|3|4, capturesTotal: number, capturesByPotency: [number,number,number,number,number], kills: number, capturesHour: number, killsHour: number): HuntSessionPersistedState => ({
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
  })
  return {
    version: 1,
    savedAt: at,
    accounts: {
      '2': base(2, 710, [529,141,36,4,0], 48_351, 26, 1_469),
      '3': base(3, 723, [537,143,37,5,1], 49_236, 27, 1_496),
      '4': base(4, 668, [497,133,34,4,0], 45_490, 24, 1_382)
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
  } catch { /* first run: seed the current live group below */ }
  storedSessions = continuitySeed(Date.now())
  storedSessionsSeeded = true
  return storedSessions
}

function installExitFlush(): void {
  if (exitFlushInstalled) return
  exitFlushInstalled = true
  process.once('exit', () => flushSessionsSync())
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
  } catch { /* best effort; dirty flag remains for the next coalesced attempt */ }
}

function findShinySeenCounter(value: unknown, depth = 0): number | undefined {
  if (!isRecord(value) || depth > 3) return undefined
  for (const [key, raw] of Object.entries(value)) {
    const normalized = normalizeKey(key)
    if (normalized.includes('shiny') && (normalized.includes('seen') || normalized.includes('vist'))) {
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
    if (normalized.includes('shiny') && truthy(raw)) return true
    if (['variant','form','skin','rarity','raridade','tipo'].includes(normalized) && typeof raw === 'string' && normalizeKey(raw).includes('shiny')) return true
  }
  for (const raw of Object.values(value)) if (shinyFlag(raw, depth + 1)) return true
  return false
}

function shinySeenBattleEvent(event: JsonRecord): boolean {
  const kind = normalizeKey(text(first(event.k, event.kind, event.type, event.event, event.evento)))
  if (!kind) return false
  const shinyNamed = kind.includes('shiny')
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
  private readonly potions = new Map<string, PotionState>()
  private readonly shinySeenEvents = new Set<string>()
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

  ingest(packet: unknown, at = Date.now()): boolean {
    if (!isRecord(packet)) return false
    const type = String(packet.t || '')
    if (type === 'batalha') {
      const changed = this.ingestBattleEvents(packet, at)
      if (changed) { this.updatedAt = at; markSessionsDirty() }
      return changed
    }
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
      // only rebuild volatile XP baselines from the fresh full state. Outside a Hunt,
      // skip ledger work entirely so idle/reload packets remain cheap.
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
    if (changed) {
      this.updatedAt = at
      markSessionsDirty()
    }
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

  persisted(at = Date.now()): HuntSessionPersistedState {
    this.prune(at)
    const potionSnapshot = this.getPotionSnapshot()
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
      potionItems: potionSnapshot.items.map((item) => ({ ...item }))
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
      localSlotId: this.localSlotId,
      huntSlug: this.huntSlug,
      captures: this.capturesTotal,
      killsEstimated: this.killsEstimatedTotal,
      shiniesSeen: this.shiniesSeen,
      shiniesCaught: this.shiniesCaught,
      potionItems: this.potions.size,
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
        if (!itemId || !name) continue
        this.potions.set(itemId, { itemId, name, quantity: nonNegativeInt(row.quantity), used: nonNegativeInt(row.used) })
      }
    }
    this.touchPotions()
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
    this.potions.clear()
    this.shinySeenEvents.clear()
    this.captureTimes = []
    this.captureHead = 0
    this.killTimes = []
    this.killHead = 0
    this.potionUseEvents = []
    this.potionHead = 0
    this.potionLastHourTotal = 0
    this.touchPotions()
  }

  private ingestBattleEvents(packet: JsonRecord, at: number): boolean {
    if (!this.huntSlug || !Array.isArray(packet.ev)) return false
    let changed = false
    for (const raw of packet.ev) {
      if (!isRecord(raw) || !shinySeenBattleEvent(raw)) continue
      const key = battleEventKey(raw)
      if (this.shinySeenEvents.has(key)) continue
      this.shinySeenEvents.add(key)
      while (this.shinySeenEvents.size > 128) {
        const oldest = this.shinySeenEvents.values().next().value as string | undefined
        if (!oldest) break
        this.shinySeenEvents.delete(oldest)
      }
      this.shiniesSeen++
      changed = true
    }
    if (changed && this.shiniesSeenBaseline !== null) this.shiniesSeenBaseline -= 1
    return changed
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
    if (shinyFlag(row)) this.shiniesCaught++
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