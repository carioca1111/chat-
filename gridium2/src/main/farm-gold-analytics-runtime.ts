import type { PanelAnalyticsSnapshot, PanelHistoryBucket, PanelRmtSaleInput } from '../shared/contracts'
import { PanelAnalyticsTracker } from './panel-analytics-runtime'
import type { PanelAnalyticsPersistedState, PanelAnalyticsTrackerOptions } from './panel-analytics-runtime'

type JsonRecord = Record<string, unknown>
type GoldHistory = { at: number; goldEarned: number }

type PersistedWithFarmGold = PanelAnalyticsPersistedState & {
  farmGoldVersion?: 1
  farmGoldTotal?: number
  battleShiniesSeen?: number
  battleShiniesCaught?: number
  farmGoldMinute?: GoldHistory[]
  farmGoldHour?: GoldHistory[]
  farmGoldDay?: GoldHistory[]
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MINUTE_RETENTION = 48 * HOUR
const HOUR_RETENTION = 90 * DAY
const DAY_RETENTION = 730 * DAY
const MARKET_CREDIT_TTL = 2 * MINUTE

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const first = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null)
const finite = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}
const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : ''
const truthy = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true' || value === 'sim' || value === 'yes' || value === 'shiny'
const isGoldCurrency = (value: unknown): boolean => ['gold', 'coin', 'coins', 'ouro'].includes(text(value))

/**
 * Analytics facade where `goldEarned` means farm/gameplay Gold only.
 * Market and RMT stay in their own revenue counters and never inflate Gold gained.
 */
export class FarmGoldAnalyticsTracker {
  private readonly inner: PanelAnalyticsTracker
  private observedGold: number | null = null
  private observedAccountId: string | null = null
  private pendingMarketGold = 0
  private pendingMarketGoldAt = 0
  private farmGoldTotal = 0
  private battleShiniesSeen = 0
  private battleShiniesCaught = 0
  private readonly farmMinute = new Map<number, number>()
  private readonly farmHour = new Map<number, number>()
  private readonly farmDay = new Map<number, number>()

  private lastPruneAt = -Infinity
  private readonly onPersist?: () => void

  constructor(options: PanelAnalyticsTrackerOptions = {}) {
    this.onPersist = options.onPersist
    this.inner = new PanelAnalyticsTracker({
      initial: options.initial,
      onPersist: options.onPersist
    })
    this.restoreFarmGold(options.initial)
    this.restoreShinyCounters(options.initial)
  }

  reset(at = Date.now()): void {
    this.observedGold = null
    this.observedAccountId = null
    this.pendingMarketGold = 0
    this.pendingMarketGoldAt = 0
    this.farmGoldTotal = 0
    this.battleShiniesSeen = 0
    this.battleShiniesCaught = 0
    this.farmMinute.clear()
    this.farmHour.clear()
    this.farmDay.clear()
    this.inner.reset(at)
  }

  ingestState(estado: JsonRecord, fullState: boolean, at = Date.now()): boolean {
    const farmChanged = this.ingestFarmGoldState(estado, fullState, at) > 0
    this.prune(at)
    const innerChanged = this.inner.ingestState(estado, fullState, at)
    if (farmChanged && !innerChanged) this.onPersist?.()
    return innerChanged || farmChanged
  }

  ingestPacket(packet: unknown, at = Date.now()): boolean {
    const shinyChanged = this.observeShinyPacket(packet)
    this.observeMarketPacket(packet, at)
    const innerChanged = this.inner.ingestPacket(packet, at)
    if (shinyChanged && !innerChanged) this.onPersist?.()
    return innerChanged || shinyChanged
  }

  registerRmtSale(sale: PanelRmtSaleInput, at?: number): boolean
  registerRmtSale(amountBrl: number, description?: string, at?: number): boolean
  registerRmtSale(value: PanelRmtSaleInput | number, descriptionOrAt: string | number = '', maybeAt = Date.now()): boolean {
    if (typeof value === 'number') {
      const description = typeof descriptionOrAt === 'string' ? descriptionOrAt : ''
      const at = typeof descriptionOrAt === 'number' ? descriptionOrAt : maybeAt
      return this.inner.registerRmtSale(value, description, at)
    }
    const at = typeof descriptionOrAt === 'number' ? descriptionOrAt : maybeAt
    return this.inner.registerRmtSale(Number(value.amountBrl), String(value.description || ''), at)
  }

  snapshot(at = Date.now()): PanelAnalyticsSnapshot {
    this.prune(at)
    const snapshot = this.inner.snapshot(at)
    const minute = replaceGold(snapshot.historyMinute, this.farmMinute)
    return {
      ...snapshot,
      shiniesSeen: Math.max(snapshot.shiniesSeen ?? 0, this.battleShiniesSeen),
      shiniesCaught: Math.max(snapshot.shiniesCaught, this.battleShiniesCaught),
      goldEarnedTotal: this.farmGoldTotal,
      goldEarnedLastHour: minute
        .filter((bucket) => bucket.at + MINUTE > at - HOUR && bucket.at <= at)
        .reduce((sum, bucket) => sum + bucket.goldEarned, 0),
      historyMinute: minute,
      historyHour: replaceGold(snapshot.historyHour, this.farmHour),
      historyDay: replaceGold(snapshot.historyDay, this.farmDay)
    }
  }

  persisted(at = Date.now()): PanelAnalyticsPersistedState {
    this.prune(at)
    const persisted = this.inner.persisted(at) as PersistedWithFarmGold
    persisted.goldEarnedTotal = this.farmGoldTotal
    persisted.historyMinute = replaceGold(persisted.historyMinute, this.farmMinute)
    persisted.historyHour = replaceGold(persisted.historyHour, this.farmHour)
    persisted.historyDay = replaceGold(persisted.historyDay, this.farmDay)
    persisted.farmGoldVersion = 1
    persisted.farmGoldTotal = this.farmGoldTotal
    persisted.battleShiniesSeen = this.battleShiniesSeen
    persisted.battleShiniesCaught = this.battleShiniesCaught
    persisted.farmGoldMinute = mapHistory(this.farmMinute)
    persisted.farmGoldHour = mapHistory(this.farmHour)
    persisted.farmGoldDay = mapHistory(this.farmDay)
    return persisted
  }

  private observeShinyPacket(packet: unknown): boolean {
    if (!isRecord(packet) || String(packet.t || '') !== 'batalha' || !Array.isArray(packet.ev)) return false
    let seen = 0
    let caught = 0
    for (const rawEvent of packet.ev) {
      if (!isRecord(rawEvent) || String(rawEvent.k || '') !== 'bola' || !truthy(rawEvent.shiny)) continue
      seen++
      if (rawEvent.sucesso === true || truthy(rawEvent.sucesso)) caught++
    }
    if (seen <= 0) return false
    this.battleShiniesSeen += seen
    this.battleShiniesCaught += caught
    return true
  }

  private observeMarketPacket(packet: unknown, at: number): void {
    if (!isRecord(packet) || String(packet.t || '') !== 'batalha' || !Array.isArray(packet.ev)) return
    for (const rawEvent of packet.ev) {
      if (!isRecord(rawEvent)) continue
      const kind = String(rawEvent.k || '')
      if (kind === 'marketComprado') {
        const remaining = finite(first(rawEvent.sobra, rawEvent.remaining))
        if (remaining !== undefined && remaining >= 0 && isGoldCurrency(first(rawEvent.moeda, rawEvent.currency))) {
          this.observedGold = remaining
          this.pendingMarketGold = 0
          this.pendingMarketGoldAt = 0
        }
        continue
      }
      if (kind !== 'marketVendido' || !isGoldCurrency(first(rawEvent.moeda, rawEvent.currency))) continue
      const amount = finite(first(rawEvent.valor, rawEvent.liquido, rawEvent.total, rawEvent.bruto))
      if (amount === undefined || amount <= 0) continue
      // Applies to both Pokémon and item sales. The next positive balance delta
      // consumes this credit before anything is classified as farm Gold.
      this.pendingMarketGold += amount
      this.pendingMarketGoldAt = at
    }
  }

  private ingestFarmGoldState(estado: JsonRecord, fullState: boolean, at: number): number {
    const accountRaw = first(estado.id, estado.accountId, estado.trainerId, estado.userId)
    const accountId = accountRaw === undefined || accountRaw === null ? '' : String(accountRaw)
    const gold = finite(first(estado.gold, estado.coins, estado.ouro))

    if (accountId && this.observedAccountId && accountId !== this.observedAccountId) {
      this.observedAccountId = accountId
      this.observedGold = gold ?? null
      this.pendingMarketGold = 0
      this.pendingMarketGoldAt = 0
      return 0
    }
    if (accountId) this.observedAccountId = accountId
    if (gold === undefined) return 0
    if (fullState || this.observedGold === null) {
      this.observedGold = gold
      this.pendingMarketGold = 0
      this.pendingMarketGoldAt = 0
      return 0
    }

    if (this.pendingMarketGold > 0 && at - this.pendingMarketGoldAt > MARKET_CREDIT_TTL) {
      this.pendingMarketGold = 0
      this.pendingMarketGoldAt = 0
    }

    const grossIncrease = gold - this.observedGold
    this.observedGold = gold
    if (!Number.isFinite(grossIncrease) || grossIncrease <= 0 || grossIncrease > 1e15) {
      if (grossIncrease <= 0) {
        this.pendingMarketGold = 0
        this.pendingMarketGoldAt = 0
      }
      return 0
    }

    const excludedMarket = Math.min(grossIncrease, this.pendingMarketGold)
    if (excludedMarket > 0) {
      this.pendingMarketGold -= excludedMarket
      if (this.pendingMarketGold <= 0) {
        this.pendingMarketGold = 0
        this.pendingMarketGoldAt = 0
      }
    }
    const farmGain = grossIncrease - excludedMarket
    if (farmGain <= 0) return 0

    this.farmGoldTotal += farmGain
    addGold(this.farmMinute, Math.floor(at / MINUTE) * MINUTE, farmGain)
    addGold(this.farmHour, Math.floor(at / HOUR) * HOUR, farmGain)
    const date = new Date(at)
    addGold(this.farmDay, new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(), farmGain)
    return farmGain
  }

  private restoreShinyCounters(initial?: Partial<PanelAnalyticsPersistedState> | null): void {
    if (!initial || typeof initial !== 'object') return
    const stored = initial as Partial<PersistedWithFarmGold>
    this.battleShiniesSeen = Math.max(0, Math.floor(finite(stored.battleShiniesSeen) ?? 0))
    this.battleShiniesCaught = Math.max(0, Math.floor(finite(stored.battleShiniesCaught) ?? 0))
  }

  private restoreFarmGold(initial?: Partial<PanelAnalyticsPersistedState> | null): void {
    if (!initial || typeof initial !== 'object') return
    const stored = initial as Partial<PersistedWithFarmGold>
    if (stored.farmGoldVersion === 1) {
      this.farmGoldTotal = Math.max(0, finite(stored.farmGoldTotal) ?? 0)
      restoreGoldMap(this.farmMinute, stored.farmGoldMinute)
      restoreGoldMap(this.farmHour, stored.farmGoldHour)
      restoreGoldMap(this.farmDay, stored.farmGoldDay)
      return
    }

    // One-time migration from the old metric, where Market Gold could be mixed
    // into `goldEarned`. Market revenue is already stored separately, so remove it.
    const oldTotal = Math.max(0, finite(initial.goldEarnedTotal) ?? 0)
    const marketTotal = Math.max(0, finite(initial.marketCoinsRevenue) ?? 0)
    this.farmGoldTotal = Math.max(0, oldTotal - marketTotal)
    migrateHistory(this.farmMinute, initial.historyMinute)
    migrateHistory(this.farmHour, initial.historyHour)
    migrateHistory(this.farmDay, initial.historyDay)
  }

  diagnostics() { return this.inner.diagnostics() }

  private prune(at: number): void {
    if (at >= this.lastPruneAt && at - this.lastPruneAt < MINUTE) return
    this.lastPruneAt = at
    pruneMap(this.farmMinute, at - MINUTE_RETENTION)
    pruneMap(this.farmHour, at - HOUR_RETENTION)
    pruneMap(this.farmDay, at - DAY_RETENTION)
  }
}

function addGold(target: Map<number, number>, at: number, amount: number): void {
  target.set(at, (target.get(at) ?? 0) + Math.max(0, amount))
}

function replaceGold(history: PanelHistoryBucket[], source: Map<number, number>): PanelHistoryBucket[] {
  return history.map((bucket) => ({ ...bucket, goldEarned: Math.max(0, source.get(bucket.at) ?? 0) }))
}

function mapHistory(source: Map<number, number>): GoldHistory[] {
  return [...source.entries()].sort((a, b) => a[0] - b[0]).map(([at, goldEarned]) => ({ at, goldEarned }))
}

function restoreGoldMap(target: Map<number, number>, raw: unknown): void {
  if (!Array.isArray(raw)) return
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const at = finite(entry.at)
    const gold = finite(entry.goldEarned)
    if (at !== undefined && at >= 0 && gold !== undefined && gold > 0) target.set(Math.floor(at), gold)
  }
}

function migrateHistory(target: Map<number, number>, raw: unknown): void {
  if (!Array.isArray(raw)) return
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const at = finite(entry.at)
    const oldGold = Math.max(0, finite(entry.goldEarned) ?? 0)
    const marketGold = Math.max(0, finite(entry.marketCoins) ?? 0)
    const farmGold = Math.max(0, oldGold - marketGold)
    if (at !== undefined && at >= 0 && farmGold > 0) target.set(Math.floor(at), farmGold)
  }
}

function pruneMap(target: Map<number, number>, cutoff: number): void {
  for (const at of target.keys()) if (at < cutoff) target.delete(at)
}
