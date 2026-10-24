import { PokemonIdLedger } from './pokemon-id-ledger'
import type { PanelAnalyticsSnapshot, PanelEventSnapshot, PanelHistoryBucket, PanelRareItemSnapshot } from '../shared/contracts'

type JsonRecord = Record<string, unknown>

const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bag', 'consumables', 'consumiveis']
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MAX_EVENTS = 60
export const MAX_POKEMON_CACHE = 20_000
// Six hours supports Sentinel baseline; 31 days includes complete Brasília days.
const SNAPSHOT_MINUTES = 6 * HOUR
const SNAPSHOT_HOURS = 31 * DAY
const MINUTE_RETENTION = 48 * HOUR
const HOUR_RETENTION = 90 * DAY
const DAY_RETENTION = 730 * DAY

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
const potency = (value: unknown): 1|2|3|4|5|undefined => {
  const parsed = finite(typeof value === 'string' ? value.replace(/^P/i, '') : value)
  return parsed && [1,2,3,4,5].includes(parsed) ? parsed as 1|2|3|4|5 : undefined
}
const officialNote = (row: JsonRecord): number | undefined => finite(first(row.nota, row.note, row.rating, row.score))
const speciesId = (row: JsonRecord): number | undefined => {
  const species = isRecord(row.species) ? row.species : isRecord(row.especie) ? row.especie : undefined
  const value = finite(first(row.speciesId, row.especieId, row.pokemonId, row.pokeId, row.dexId, row.pokedexId, species?.id))
  return value !== undefined && value > 0 ? Math.floor(value) : undefined
}

interface InventoryRow { id: string; name: string; quantity: number }
interface PokemonXpState { xp: number; level?: number; xpLevelStart?: number; xpNext?: number }
type HistoryDelta = Partial<Omit<PanelHistoryBucket, 'at'>>

export interface PanelAnalyticsPersistedState {
  version: 2
  sessionStartedAt: number
  capturesTotal: number
  capturesByPotency: [number, number, number, number, number]
  noteBands: [number, number, number, number, number, number, number, number]
  shiniesSeen: number | null
  shiniesCaught: number
  rareItems: PanelRareItemSnapshot[]
  lastCaptureAt: number | null
  captureTimes: number[]
  pokemonXpTotal: number
  goldEarnedTotal: number
  marketCoinsRevenue: number
  marketGemsRevenue: number
  rmtBrlRevenue: number
  historyMinute: PanelHistoryBucket[]
  historyHour: PanelHistoryBucket[]
  historyDay: PanelHistoryBucket[]
  events: PanelEventSnapshot[]
}

export interface PanelAnalyticsTrackerOptions {
  initial?: Partial<PanelAnalyticsPersistedState> | null
  onPersist?: () => void
}

function pokemonId(row: JsonRecord): string {
  const id = first(row.id, row.pokemonInstanceId, row.uid)
  return id === undefined || id === null ? '' : String(id)
}

function pokemonName(row: JsonRecord): string {
  const species = isRecord(row.species) ? row.species : isRecord(row.especie) ? row.especie : undefined
  return text(first(row.speciesName, row.nomeEspecie, row.especieNome, species?.name, species?.nome, row.nome, row.name)) || `Pokémon #${pokemonId(row) || '?'}`
}

function noteBand(note: number): number | undefined {
  if (note < 0) return undefined
  if (note >= 5) return 7
  if (note >= 4.5) return 6
  if (note >= 4) return 5
  if (note >= 3.5) return 4
  if (note >= 3) return 3
  if (note >= 2) return 2
  if (note >= 1) return 1
  return 0
}

function inventoryRows(estado: JsonRecord): InventoryRow[] {
  const rows = new Map<string, InventoryRow>()
  const add = (idRaw: unknown, value: unknown, fallbackName = ''): void => {
    const id = idRaw === undefined || idRaw === null ? '' : String(idRaw)
    if (!id) return
    if (typeof value === 'number' || typeof value === 'string') {
      const quantity = finite(value)
      if (quantity !== undefined && quantity >= 0) rows.set(id, { id, name: fallbackName || `Item #${id}`, quantity: Math.floor(quantity) })
      return
    }
    if (!isRecord(value)) return
    const quantity = finite(first(value.qtd, value.quantidade, value.qty, value.count, value.amount, value.total, value.estoque))
    if (quantity === undefined || quantity < 0) return
    const name = text(first(value.nome, value.name, value.itemNome, value.label)) || fallbackName || `Item #${id}`
    rows.set(id, { id, name, quantity: Math.floor(quantity) })
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

function emptyBucket(at: number): PanelHistoryBucket {
  return { at, pokemonXp: 0, captures: 0, goldEarned: 0, marketCoins: 0, marketGems: 0, rmtBrl: 0 }
}

function sanitizeBucket(value: unknown): PanelHistoryBucket | null {
  if (!isRecord(value)) return null
  const at = finite(value.at)
  if (at === undefined || at < 0) return null
  return {
    at: Math.floor(at),
    pokemonXp: Math.max(0, finite(value.pokemonXp) ?? 0),
    captures: Math.max(0, Math.floor(finite(value.captures) ?? 0)),
    goldEarned: Math.max(0, finite(value.goldEarned) ?? finite(value.marketCoins) ?? 0),
    marketCoins: Math.max(0, finite(value.marketCoins) ?? 0),
    marketGems: Math.max(0, finite(value.marketGems) ?? 0),
    rmtBrl: Math.max(0, finite(value.rmtBrl) ?? 0)
  }
}

function safeTuple(value: unknown, size: 5|8): number[] {
  const rows = Array.isArray(value) ? value.slice(0, size) : []
  while (rows.length < size) rows.push(0)
  return rows.map((entry) => Math.max(0, Math.floor(finite(entry) ?? 0)))
}

export function isRareItemName(name: string): boolean {
  const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return /(boss\s*token|\btm\b|rare|raro|stone|pedra|fossil|ticket|shard|fragment|caixa|box|especial|special|egg|ovo)/i.test(normalized)
}

export class PanelAnalyticsTracker {
  private sessionStartedAt = Date.now()
  private readonly knownPokemonIds = new PokemonIdLedger()
  private readonly pokemonXpState = new Map<string, PokemonXpState>()
  private readonly inventory = new Map<string, InventoryRow>()
  private readonly rareItems = new Map<string, PanelRareItemSnapshot>()
  private readonly historyMinute = new Map<number, PanelHistoryBucket>()
  private readonly historyHour = new Map<number, PanelHistoryBucket>()
  private readonly historyDay = new Map<number, PanelHistoryBucket>()
  private capturesByPotency = [0,0,0,0,0]
  private noteBands = [0,0,0,0,0,0,0,0]
  private capturesTotal = 0
  private shiniesCaught = 0
  private shiniesSeen: number | null = null
  private lastCaptureAt: number | null = null
  private captureTimes: number[] = []
  private pokemonXpTotal = 0
  private goldEarnedTotal = 0
  private observedGold: number | null = null
  private observedAccountId: string | null = null
  private marketCoinsRevenue = 0
  private marketGemsRevenue = 0
  private rmtBrlRevenue = 0
  private events: PanelEventSnapshot[] = []
  private revision = 0
  private lastPruneAt = -Infinity
  private activePokemonId = ''
  private readonly onPersist?: () => void

  constructor(options: PanelAnalyticsTrackerOptions = {}) {
    this.onPersist = options.onPersist
    this.restore(options.initial)
  }

  reset(at = Date.now()): void {
    this.sessionStartedAt = at
    this.knownPokemonIds.clear()
    this.pokemonXpState.clear()
    this.inventory.clear()
    this.rareItems.clear()
    this.historyMinute.clear()
    this.historyHour.clear()
    this.historyDay.clear()
    this.capturesByPotency = [0,0,0,0,0]
    this.noteBands = [0,0,0,0,0,0,0,0]
    this.capturesTotal = 0
    this.shiniesCaught = 0
    this.shiniesSeen = null
    this.lastCaptureAt = null
    this.captureTimes = []
    this.pokemonXpTotal = 0
    this.goldEarnedTotal = 0
    this.observedGold = null
    this.observedAccountId = null
    this.marketCoinsRevenue = 0
    this.marketGemsRevenue = 0
    this.rmtBrlRevenue = 0
    this.events = []
    this.touch(true)
  }

  ingestState(estado: JsonRecord, fullState: boolean, at = Date.now()): boolean {
    this.pruneHistory(at)
    if (estado.activeId !== undefined) this.activePokemonId = String(estado.activeId)
    let changed = false
    if (this.ingestGoldState(estado, fullState, at) > 0) changed = true

    const seenValue = finite(first(estado.shiniesSeen, estado.shinySeen, estado.shinysVistos, estado.shiniesVistos))
    if (seenValue !== undefined && seenValue >= 0 && seenValue !== this.shiniesSeen) {
      this.shiniesSeen = Math.floor(seenValue)
      changed = true
    }

    const rows: JsonRecord[] = []
    for (const key of ['pokemons','pkMud']) {
      const value = estado[key]
      if (Array.isArray(value)) for (const row of value) if (isRecord(row)) rows.push(row)
    }

    if (fullState) {
      this.knownPokemonIds.clear()
      this.pokemonXpState.clear()
      for (const row of rows) this.baselinePokemon(row)
      this.prunePokemonCaches()
      this.inventory.clear()
      for (const row of inventoryRows(estado)) this.inventory.set(row.id, row)
      if (changed) this.touch(true)
      return changed
    }

    for (const row of rows) {
      const id = pokemonId(row)
      if (!id) continue
      const isNew = !this.knownPokemonIds.has(id)
      if (isNew) {
        this.knownPokemonIds.add(id)
        this.baselinePokemonXp(row)
        this.registerCapture(row, at)
        changed = true
        continue
      }
      const xpGained = this.registerPokemonXp(row, at)
      if (xpGained > 0) changed = true
    }

    this.prunePokemonCaches()
    for (const row of inventoryRows(estado)) {
      const previous = this.inventory.get(row.id)
      this.inventory.set(row.id, row)
      const previousQuantity = previous?.quantity ?? 0
      if (row.quantity <= previousQuantity) continue
      const gained = row.quantity - previousQuantity
      if (!isRareItemName(row.name)) continue
      const current = this.rareItems.get(row.id)
      this.rareItems.set(row.id, { itemId: row.id, name: row.name, quantity: (current?.quantity ?? 0) + gained })
      this.pushEvent({ at, accountEvent: 'rare-item', label: `${row.name} +${gained}`, detail: 'Aumento confirmado no inventário do servidor' })
      changed = true
    }

    if (changed) this.touch(true)
    return changed
  }

  ingestPacket(packet: unknown, at = Date.now()): boolean {
    if (!isRecord(packet) || String(packet.t || '') !== 'batalha' || !Array.isArray(packet.ev)) return false
    let changed = false
    for (const rawEvent of packet.ev) {
      if (!isRecord(rawEvent)) continue
      const eventKind = String(rawEvent.k || '')

      if (eventKind === 'marketComprado') {
        const currency = text(first(rawEvent.moeda, rawEvent.currency)).toLowerCase()
        const remaining = finite(first(rawEvent.sobra, rawEvent.remaining))
        if (remaining !== undefined && remaining >= 0 && ['gold','coin','coins','ouro'].includes(currency)) this.observedGold = remaining
        continue
      }

      if (eventKind !== 'marketVendido') continue
      const type = text(first(rawEvent.tipo, rawEvent.assetType)).toLowerCase()
      const pokemonIdValue = first(rawEvent.pokemonId, rawEvent.pkId)
      if (!pokemonIdValue && type && !type.includes('pokemon')) continue
      if (!pokemonIdValue && !type) continue
      const amount = finite(first(rawEvent.valor, rawEvent.liquido, rawEvent.total, rawEvent.bruto))
      if (amount === undefined || amount <= 0) continue
      const currency = text(first(rawEvent.moeda, rawEvent.currency)).toLowerCase()
      const name = text(first(rawEvent.nome, rawEvent.descricao, rawEvent.pokemonNome)) || 'Pokémon vendido'
      const sid = finite(first(rawEvent.speciesId, rawEvent.especieId))
      if (['gold','coin','coins','ouro'].includes(currency)) {
        this.marketCoinsRevenue += amount
        this.addHistory(at, { marketCoins: amount })
      } else if (['orb','orbs','gem','gems'].includes(currency)) {
        this.marketGemsRevenue += amount
        this.addHistory(at, { marketGems: amount })
      } else continue
      this.pushEvent({
        at,
        accountEvent: 'market-sale',
        label: name,
        detail: `Venda Market · ${formatCompactAmount(amount)} ${['orb','orbs','gem','gems'].includes(currency) ? 'Orbs' : 'Gold'}`,
        speciesId: sid !== undefined && sid > 0 ? Math.floor(sid) : undefined
      })
      changed = true
    }
    if (changed) this.touch(true)
    return changed
  }

  registerRmtSale(amountBrl: number, description = '', at = Date.now()): boolean {
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) return false
    const amount = Math.round(amountBrl * 100) / 100
    this.rmtBrlRevenue += amount
    this.addHistory(at, { rmtBrl: amount })
    this.pushEvent({
      at,
      accountEvent: 'rmt-sale',
      label: description.trim().slice(0, 80) || 'Venda RMT',
      detail: `RMT registrado · R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    })
    this.touch(true)
    return true
  }

  snapshot(at = Date.now()): PanelAnalyticsSnapshot {
    this.pruneHistory(at)
    const minute = this.sortedHistory(this.historyMinute, at - SNAPSHOT_MINUTES)
    const capturesLastHour = this.captureTimes.filter((captureAt) => captureAt >= at - HOUR && captureAt <= at).length
    const rollingMinute = minute.filter((bucket) => bucket.at + MINUTE > at - HOUR && bucket.at <= at)
    const pokemonXpLastHour = rollingMinute.reduce((sum, bucket) => sum + bucket.pokemonXp, 0)
    const goldEarnedLastHour = rollingMinute.reduce((sum, bucket) => sum + bucket.goldEarned, 0)
    return {
      revision: this.revision,
      sessionStartedAt: this.sessionStartedAt,
      capturesTotal: this.capturesTotal,
      capturesLastHour,
      capturesByPotency: [...this.capturesByPotency] as [number,number,number,number,number],
      noteBands: [...this.noteBands] as [number,number,number,number,number,number,number,number],
      note35Plus: this.noteBands.slice(4).reduce((sum, value) => sum + value, 0),
      shiniesSeen: this.shiniesSeen,
      shiniesCaught: this.shiniesCaught,
      rareItems: [...this.rareItems.values()].sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).slice(0, 12),
      rareItemsTotal: [...this.rareItems.values()].reduce((sum, item) => sum + item.quantity, 0),
      lastCaptureAt: this.lastCaptureAt,
      pokemonXpTotal: this.pokemonXpTotal,
      pokemonXpLastHour,
      goldEarnedTotal: this.goldEarnedTotal,
      goldEarnedLastHour,
      marketCoinsRevenue: this.marketCoinsRevenue,
      marketGemsRevenue: this.marketGemsRevenue,
      rmtBrlRevenue: this.rmtBrlRevenue,
      historyMinute: minute,
      historyHour: this.sortedHistory(this.historyHour, at - SNAPSHOT_HOURS),
      historyDay: this.sortedHistory(this.historyDay, at - 31 * DAY),
      events: this.events.slice(0, 24)
    }
  }

  persisted(at = Date.now()): PanelAnalyticsPersistedState {
    this.pruneHistory(at)
    return {
      version: 2,
      sessionStartedAt: this.sessionStartedAt,
      capturesTotal: this.capturesTotal,
      capturesByPotency: [...this.capturesByPotency] as [number,number,number,number,number],
      noteBands: [...this.noteBands] as [number,number,number,number,number,number,number,number],
      shiniesSeen: this.shiniesSeen,
      shiniesCaught: this.shiniesCaught,
      rareItems: [...this.rareItems.values()],
      lastCaptureAt: this.lastCaptureAt,
      captureTimes: [...this.captureTimes],
      pokemonXpTotal: this.pokemonXpTotal,
      goldEarnedTotal: this.goldEarnedTotal,
      marketCoinsRevenue: this.marketCoinsRevenue,
      marketGemsRevenue: this.marketGemsRevenue,
      rmtBrlRevenue: this.rmtBrlRevenue,
      historyMinute: this.sortedHistory(this.historyMinute),
      historyHour: this.sortedHistory(this.historyHour),
      historyDay: this.sortedHistory(this.historyDay),
      events: this.events.slice(0, MAX_EVENTS)
    }
  }

  private restore(initial?: Partial<PanelAnalyticsPersistedState> | null): void {
    if (!initial || typeof initial !== 'object') return
    const startedAt = finite(initial.sessionStartedAt)
    if (startedAt !== undefined && startedAt > 0) this.sessionStartedAt = startedAt
    this.capturesTotal = Math.max(0, Math.floor(finite(initial.capturesTotal) ?? 0))
    this.capturesByPotency = safeTuple(initial.capturesByPotency, 5) as [number,number,number,number,number]
    this.noteBands = safeTuple(initial.noteBands, 8) as [number,number,number,number,number,number,number,number]
    const seen = finite(initial.shiniesSeen)
    this.shiniesSeen = initial.shiniesSeen === null ? null : seen !== undefined && seen >= 0 ? Math.floor(seen) : null
    this.shiniesCaught = Math.max(0, Math.floor(finite(initial.shiniesCaught) ?? 0))
    this.lastCaptureAt = finite(initial.lastCaptureAt) ?? null
    this.captureTimes = Array.isArray(initial.captureTimes) ? initial.captureTimes.map(finite).filter((value): value is number => value !== undefined && value >= 0).sort((a,b) => a-b) : []
    this.pokemonXpTotal = Math.max(0, finite(initial.pokemonXpTotal) ?? 0)
    this.marketCoinsRevenue = Math.max(0, finite(initial.marketCoinsRevenue) ?? 0)
    this.goldEarnedTotal = Math.max(0, finite(initial.goldEarnedTotal) ?? this.marketCoinsRevenue)
    this.marketGemsRevenue = Math.max(0, finite(initial.marketGemsRevenue) ?? 0)
    this.rmtBrlRevenue = Math.max(0, finite(initial.rmtBrlRevenue) ?? 0)

    if (Array.isArray(initial.rareItems)) {
      for (const raw of initial.rareItems) {
        if (!isRecord(raw)) continue
        const itemId = text(raw.itemId)
        const name = text(raw.name)
        const quantity = Math.max(0, Math.floor(finite(raw.quantity) ?? 0))
        if (itemId && name && quantity > 0) this.rareItems.set(itemId, { itemId, name, quantity })
      }
    }
    this.restoreHistory(this.historyMinute, initial.historyMinute)
    this.restoreHistory(this.historyHour, initial.historyHour)
    this.restoreHistory(this.historyDay, initial.historyDay)
    if (Array.isArray(initial.events)) {
      this.events = initial.events.filter((event): event is PanelEventSnapshot => Boolean(
        event && typeof event === 'object' && Number.isFinite(Number((event as PanelEventSnapshot).at))
      )).slice(0, MAX_EVENTS).map((event) => ({ ...event }))
    }
    this.pruneHistory(Date.now())
  }

  private restoreHistory(target: Map<number, PanelHistoryBucket>, raw: unknown): void {
    if (!Array.isArray(raw)) return
    for (const entry of raw) {
      const bucket = sanitizeBucket(entry)
      if (bucket) target.set(bucket.at, bucket)
    }
  }

  private baselinePokemon(row: JsonRecord): void {
    const id = pokemonId(row)
    if (!id) return
    this.knownPokemonIds.add(id)
    this.baselinePokemonXp(row)
  }

  private baselinePokemonXp(row: JsonRecord): void {
    const id = pokemonId(row)
    const xp = finite(row.xp)
    if (!id || xp === undefined) return
    this.pokemonXpState.delete(id)
    this.pokemonXpState.set(id, {
      xp,
      level: finite(first(row.level, row.nivel, row.lvl)),
      xpLevelStart: finite(first(row.xpNivel, row.xpLevelStart)),
      xpNext: finite(first(row.xpProximo, row.xpNext))
    })
  }

  private ingestGoldState(estado: JsonRecord, fullState: boolean, at: number): number {
    const accountRaw = first(estado.id, estado.accountId, estado.trainerId, estado.userId)
    const accountId = accountRaw === undefined || accountRaw === null ? '' : String(accountRaw)
    const gold = finite(first(estado.gold, estado.coins, estado.ouro))

    if (accountId && this.observedAccountId && accountId !== this.observedAccountId) {
      this.observedAccountId = accountId
      this.observedGold = gold ?? null
      return 0
    }
    if (accountId) this.observedAccountId = accountId
    if (gold === undefined) return 0
    if (fullState || this.observedGold === null) {
      this.observedGold = gold
      return 0
    }

    const gained = gold - this.observedGold
    this.observedGold = gold
    if (!Number.isFinite(gained) || gained <= 0 || gained > 1e15) return 0
    this.goldEarnedTotal += gained
    this.addHistory(at, { goldEarned: gained })
    return gained
  }

  private registerPokemonXp(row: JsonRecord, at: number): number {
    const id = pokemonId(row)
    const xp = finite(row.xp)
    if (!id || xp === undefined) return 0
    const next: PokemonXpState = {
      xp,
      level: finite(first(row.level, row.nivel, row.lvl)),
      xpLevelStart: finite(first(row.xpNivel, row.xpLevelStart)),
      xpNext: finite(first(row.xpProximo, row.xpNext))
    }
    const previous = this.pokemonXpState.get(id)
    this.pokemonXpState.delete(id)
    this.pokemonXpState.set(id, { ...previous, ...next })
    if (!previous) return 0

    let gained = xp - previous.xp
    if (gained < 0 && next.level !== undefined && previous.level !== undefined && next.level > previous.level) {
      const remaining = previous.xpNext !== undefined ? Math.max(0, previous.xpNext - previous.xp) : 0
      const progress = next.xpLevelStart !== undefined ? Math.max(0, xp - next.xpLevelStart) : Math.max(0, xp)
      gained = remaining + progress
    }
    if (!Number.isFinite(gained) || gained <= 0 || gained > 1e12) return 0
    this.pokemonXpTotal += gained
    this.addHistory(at, { pokemonXp: gained })
    return gained
  }

  private registerCapture(row: JsonRecord, at: number): void {
    this.capturesTotal++
    this.lastCaptureAt = at
    this.captureTimes.push(at)
    this.addHistory(at, { captures: 1 })
    const p = potency(first(row.potencia, row.potency))
    if (p) this.capturesByPotency[p - 1]++

    const note = officialNote(row)
    const band = note === undefined ? undefined : noteBand(note)
    if (band !== undefined) this.noteBands[band]++

    const shiny = truthy(first(row.shiny, row.isShiny))
    if (shiny) this.shiniesCaught++
    const details = [p ? `P${p}` : '', note !== undefined ? `nota ${note.toFixed(3).replace('.', ',')}` : 'nota indisponível', shiny ? 'SHINY' : ''].filter(Boolean).join(' · ')
    this.pushEvent({ at, accountEvent: shiny ? 'shiny-caught' : 'capture', label: pokemonName(row), detail: details, speciesId: speciesId(row) })
  }

  private addHistory(at: number, delta: HistoryDelta): void {
    this.addHistoryBucket(this.historyMinute, Math.floor(at / MINUTE) * MINUTE, delta)
    this.addHistoryBucket(this.historyHour, Math.floor(at / HOUR) * HOUR, delta)
    const date = new Date(at)
    const localDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    this.addHistoryBucket(this.historyDay, localDay, delta)
  }

  private addHistoryBucket(target: Map<number, PanelHistoryBucket>, at: number, delta: HistoryDelta): void {
    const bucket = target.get(at) ?? emptyBucket(at)
    bucket.pokemonXp += Math.max(0, delta.pokemonXp ?? 0)
    bucket.captures += Math.max(0, delta.captures ?? 0)
    bucket.goldEarned += Math.max(0, delta.goldEarned ?? 0)
    bucket.marketCoins += Math.max(0, delta.marketCoins ?? 0)
    bucket.marketGems += Math.max(0, delta.marketGems ?? 0)
    bucket.rmtBrl += Math.max(0, delta.rmtBrl ?? 0)
    target.set(at, bucket)
  }

  private pruneHistory(at: number): void {
    if (at >= this.lastPruneAt && at - this.lastPruneAt < MINUTE) return
    this.lastPruneAt = at
    const captureCutoff = at - HOUR - MINUTE
    if (this.captureTimes.length) this.captureTimes = this.captureTimes.filter((captureAt) => captureAt >= captureCutoff)
    this.pruneMap(this.historyMinute, at - MINUTE_RETENTION)
    this.pruneMap(this.historyHour, at - HOUR_RETENTION)
    this.pruneMap(this.historyDay, at - DAY_RETENTION)
  }

  private pruneMap(target: Map<number, PanelHistoryBucket>, cutoff: number): void {
    for (const key of target.keys()) if (key < cutoff) target.delete(key)
  }

  private sortedHistory(target: Map<number, PanelHistoryBucket>, cutoff = -Infinity): PanelHistoryBucket[] {
    return [...target.values()].filter((bucket) => bucket.at >= cutoff).sort((a,b) => a.at - b.at).map((bucket) => ({ ...bucket }))
  }

  diagnostics() {
    return { knownPokemonIds: this.knownPokemonIds.size, identityRanges: this.knownPokemonIds.storageEntries, pokemonXpState: this.pokemonXpState.size,
      captureTimes: this.captureTimes.length, historyMinute: this.historyMinute.size,
      historyHour: this.historyHour.size, historyDay: this.historyDay.size, events: this.events.length }
  }

  private prunePokemonCaches(): void {
    while (this.pokemonXpState.size > MAX_POKEMON_CACHE) {
      const id = this.pokemonXpState.keys().next().value!
      const value = this.pokemonXpState.get(id)!
      this.pokemonXpState.delete(id)
      if (id === this.activePokemonId) this.pokemonXpState.set(id, value)
    }
  }

  private pushEvent(event: PanelEventSnapshot): void {
    this.events.unshift(event)
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS
  }

  private touch(persist: boolean): void {
    this.revision++
    if (persist) this.onPersist?.()
  }
}

function formatCompactAmount(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}
