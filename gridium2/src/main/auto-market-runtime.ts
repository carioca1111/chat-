import type {
  AccountId,
  AutoMarketAccountSnapshot,
  AutoMarketCatalogItem,
  AutoMarketCategory,
  AutoMarketMode,
  AutoMarketRule,
  AutoMarketRuleStatus,
  AutoMarketSnapshot,
  MarketCurrency
} from '../shared/contracts'

type JsonRecord = Record<string, unknown>
type MarketWireCurrency = 'gold' | 'orb'

export interface AutoMarketPersistedSettings {
  rules?: Partial<Record<AccountId, AutoMarketRule[]>>
}

export interface AutoMarketSendResult {
  ok: boolean
  reason?: string
}

export interface AutoMarketRuntimeOptions {
  sendCommand: (accountId: AccountId, command: JsonRecord) => Promise<AutoMarketSendResult>
  onChanged: () => void
  onPersist?: (settings: AutoMarketPersistedSettings) => void
  initial?: AutoMarketPersistedSettings
  scheduler?: boolean
}

interface MarketListing {
  listingId: string
  itemId: string
  name: string
  price: number
  currency: MarketCurrency
  quantity: number
  sellerId: string
  availableAt: number
  observedAt: number
}

interface PendingPurchase {
  listingId: string
  itemId: string
  quantity: number
  unitPrice: number
  currency: MarketCurrency
  sentAt: number
}

interface InventoryRow {
  itemId: string
  name: string
  quantity: number
  observedAt: number
}

interface AccountState {
  id: AccountId
  connected: boolean
  socketReady: boolean
  serverNick: string
  serverAccountId: string
  coins: number | null
  gems: number | null
  serverOffsetMs: number
  lastServerAt: number
  inventory: Map<string, InventoryRow>
  listings: Map<string, MarketListing>
  summaryPrices: Map<string, { coins: number | null; gems: number | null; observedAt: number }>
  rules: AutoMarketRule[]
  statuses: Map<AutoMarketCategory, AutoMarketRuleStatus>
  pending: PendingPurchase | null
  lastAction: string
  orderTimes: number[]
  blockedListings: Map<string, number>
}

const CATEGORIES: AutoMarketCategory[] = ['balls', 'potions', 'revives']
const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bag', 'consumables', 'consumiveis']
const LIST_ARRAY_KEYS = ['linhas', 'anuncios', 'lista', 'ofertas']
const INVENTORY_STALE_MS = 90_000
const LISTING_STALE_MS = 20_000
const PENDING_TIMEOUT_MS = 7_000
const PROBE_INTERVAL_OPEN_MS = 2_500
const PROBE_INTERVAL_BACKGROUND_MS = 5_000

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const finite = (value: unknown): number | null => {
  const number = typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : Number(value)
  return Number.isFinite(number) ? number : null
}
const positiveInt = (value: unknown): number | null => {
  const number = finite(value)
  return number !== null && Number.isInteger(number) && number > 0 ? number : null
}
const safeText = (value: unknown, max = 80): string => typeof value === 'string' ? value.trim().slice(0, max) : ''
const first = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null)
const currencyFromWire = (value: unknown): MarketCurrency | null => {
  const text = String(value || '').toLowerCase()
  if (text === 'gold' || text === 'coin' || text === 'coins') return 'coins'
  if (text === 'orb' || text === 'orbs' || text === 'gem' || text === 'gems') return 'gems'
  return null
}
const currencyToWire = (value: MarketCurrency): MarketWireCurrency => value === 'gems' ? 'orb' : 'gold'

export function defaultAutoMarketRules(): AutoMarketRule[] {
  return [
    { category: 'balls', enabled: false, itemId: '', itemName: '', minStock: 500, targetStock: 5000, maxUnitPrice: 0, currency: 'coins' },
    { category: 'potions', enabled: false, itemId: '', itemName: '', minStock: 100, targetStock: 1000, maxUnitPrice: 0, currency: 'coins' },
    { category: 'revives', enabled: false, itemId: '', itemName: '', minStock: 20, targetStock: 200, maxUnitPrice: 0, currency: 'coins' }
  ]
}

function cleanRule(input: AutoMarketRule, category?: AutoMarketCategory): AutoMarketRule {
  const fallbackCategory = category && CATEGORIES.includes(category) ? category : CATEGORIES.includes(input.category) ? input.category : 'balls'
  const minStock = Math.max(0, Math.min(1_000_000, Math.floor(finite(input.minStock) ?? 0)))
  const targetStock = Math.max(minStock, Math.min(1_000_000, Math.floor(finite(input.targetStock) ?? minStock)))
  return {
    category: fallbackCategory,
    enabled: input.enabled === true,
    itemId: String(input.itemId || '').replace(/[^0-9]/g, '').slice(0, 20),
    itemName: safeText(input.itemName, 80),
    minStock,
    targetStock,
    maxUnitPrice: Math.max(0, Math.min(1e15, finite(input.maxUnitPrice) ?? 0)),
    currency: input.currency === 'gems' ? 'gems' : 'coins'
  }
}

function mergeRules(saved?: AutoMarketRule[]): AutoMarketRule[] {
  const defaults = defaultAutoMarketRules()
  return defaults.map((base) => {
    const row = saved?.find((item) => item?.category === base.category)
    return row ? cleanRule({ ...base, ...row }, base.category) : base
  })
}

function waitingStatus(category: AutoMarketCategory, message = 'Aguardando dados do servidor'): AutoMarketRuleStatus {
  return { category, state: 'waiting', message, stock: null, bestUnitPrice: null, suggestedQuantity: 0, updatedAt: Date.now() }
}

export function extractServerInventory(estado: JsonRecord, at = Date.now()): InventoryRow[] {
  const out = new Map<string, InventoryRow>()
  const add = (idRaw: unknown, value: unknown, keyName = ''): void => {
    const itemId = String(positiveInt(idRaw) ?? '')
    if (!itemId) return
    if (typeof value === 'number' || typeof value === 'string') {
      const quantity = finite(value)
      if (quantity !== null && quantity >= 0) out.set(itemId, { itemId, name: keyName && !/^\d+$/.test(keyName) ? keyName : `Item #${itemId}`, quantity: Math.floor(quantity), observedAt: at })
      return
    }
    if (!isRecord(value)) return
    const quantity = finite(first(value.qtd, value.quantidade, value.qty, value.count, value.amount, value.total, value.estoque))
    if (quantity === null || quantity < 0) return
    const name = safeText(first(value.nome, value.name, value.itemNome, value.label)) || (keyName && !/^\d+$/.test(keyName) ? keyName : `Item #${itemId}`)
    out.set(itemId, { itemId, name, quantity: Math.floor(quantity), observedAt: at })
  }

  for (const key of INVENTORY_KEYS) {
    const container = estado[key]
    if (Array.isArray(container)) {
      for (const row of container) {
        if (!isRecord(row)) continue
        add(first(row.itemId, row.id, row.item_id), row)
      }
    } else if (isRecord(container)) {
      for (const [mapKey, value] of Object.entries(container)) {
        if (isRecord(value)) add(first(value.itemId, value.id, value.item_id, mapKey), value, mapKey)
        else add(mapKey, value, mapKey)
      }
    }
  }
  return [...out.values()]
}

export function normalizeMarketListing(row: unknown, at = Date.now()): MarketListing | null {
  if (!isRecord(row)) return null
  const listingId = String(positiveInt(row.id) ?? '')
  const itemId = String(positiveInt(first(row.itemId, row.item_id)) ?? '')
  const price = finite(first(row.preco, row.price))
  const currency = currencyFromWire(first(row.moeda, row.currency))
  if (!listingId || !itemId || price === null || price <= 0 || !currency) return null
  const quantity = Math.max(1, Math.floor(finite(first(row.qtd, row.quantidade, row.qty, row.amount)) ?? 1))
  return {
    listingId,
    itemId,
    name: safeText(first(row.nome, row.itemNome, row.name, isRecord(row.ficha) ? first(row.ficha.nome, row.ficha.name) : undefined)) || `Item #${itemId}`,
    price,
    currency,
    quantity,
    sellerId: String(first(row.vendedorId, row.sellerId, '') || ''),
    availableAt: Math.max(0, finite(first(row.compravelEm, row.availableAt)) ?? 0),
    observedAt: at
  }
}

export class AutoMarketRuntime {
  private readonly accounts = new Map<AccountId, AccountState>()
  private readonly catalog = new Map<string, AutoMarketCatalogItem>()
  private mode: AutoMarketMode = 'observe'
  private uiActive = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private cursor = 0
  private lastTickAt = 0
  private readonly scheduler: boolean

  constructor(private readonly options: AutoMarketRuntimeOptions) {
    this.scheduler = options.scheduler !== false
    for (const id of [1,2,3,4] as AccountId[]) {
      const rules = mergeRules(options.initial?.rules?.[id])
      this.accounts.set(id, {
        id, connected: false, socketReady: false, serverNick: '', serverAccountId: '', coins: null, gems: null,
        serverOffsetMs: 0, lastServerAt: 0, inventory: new Map(), listings: new Map(), summaryPrices: new Map(), rules,
        statuses: new Map(rules.map((rule) => [rule.category, waitingStatus(rule.category)])), pending: null,
        lastAction: 'Aguardando servidor', orderTimes: [], blockedListings: new Map()
      })
    }
  }

  snapshot(): AutoMarketSnapshot {
    const accounts: AutoMarketAccountSnapshot[] = [...this.accounts.values()].map((account) => ({
      accountId: account.id,
      connected: account.connected,
      socketReady: account.socketReady,
      serverNick: account.serverNick,
      coins: account.coins,
      gems: account.gems,
      lastServerAt: account.lastServerAt,
      inventory: [...account.inventory.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(0,250),
      rules: account.rules.map((rule) => ({ ...rule })),
      statuses: CATEGORIES.map((category) => ({ ...(account.statuses.get(category) ?? waitingStatus(category)) })),
      pending: account.pending !== null,
      lastAction: account.lastAction
    }))
    return {
      mode: this.mode,
      uiActive: this.uiActive,
      accounts,
      catalog: [...this.catalog.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(0,300),
      lastTickAt: this.lastTickAt
    }
  }

  persisted(): AutoMarketPersistedSettings {
    return { rules: Object.fromEntries([...this.accounts.values()].map((account) => [account.id, account.rules.map((rule) => ({ ...rule }))])) as Partial<Record<AccountId, AutoMarketRule[]>> }
  }

  setUiActive(active: boolean): void {
    if (this.uiActive === active) return
    this.uiActive = active
    this.schedule()
    this.options.onChanged()
  }

  setMode(mode: AutoMarketMode): void {
    if (!['observe','auto'].includes(mode) || this.mode === mode) return
    this.mode = mode
    if (mode === 'observe') {
      for (const account of this.accounts.values()) account.pending = null
    }
    this.schedule()
    this.options.onChanged()
  }

  updateRule(accountId: AccountId, input: AutoMarketRule): void {
    const account = this.accounts.get(accountId)
    if (!account || !CATEGORIES.includes(input.category)) return
    const cleaned = cleanRule(input, input.category)
    account.rules = account.rules.map((rule) => rule.category === cleaned.category ? cleaned : rule)
    account.statuses.set(cleaned.category, waitingStatus(cleaned.category, cleaned.enabled ? 'Regra atualizada; aguardando servidor' : 'Regra pausada'))
    this.options.onPersist?.(this.persisted())
    this.options.onChanged()
    if (this.mode === 'auto') void this.evaluateAccount(accountId)
  }

  setSocketReady(accountId: AccountId, ready: boolean): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    const changed = account.socketReady !== ready || account.connected !== ready
    account.socketReady = ready
    if (!ready) {
      account.connected = false
      account.pending = null
    }
    if (changed) this.options.onChanged()
  }

  resetConnection(accountId: AccountId): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    account.connected = false
    account.socketReady = false
    account.pending = null
    account.listings.clear()
    account.lastAction = 'Aguardando reconexão do servidor'
    for (const rule of account.rules) account.statuses.set(rule.category, waitingStatus(rule.category, 'Aguardando reconexão do servidor'))
    this.options.onChanged()
  }

  ingest(accountId: AccountId, packet: unknown, at = Date.now()): void {
    const account = this.accounts.get(accountId)
    if (!account || !isRecord(packet)) return
    const type = String(packet.t || '')
    let changed = false

    if ((type === 'welcome' || type === 'estado') && isRecord(packet.estado)) {
      const estado = packet.estado
      account.connected = true
      account.socketReady = true
      account.lastServerAt = at
      const nick = safeText(first(estado.nick, estado.nickname, estado.usuario))
      if (nick && nick !== account.serverNick) { account.serverNick = nick; changed = true }
      const serverId = String(first(estado.id, estado.accountId, estado.userId, '') || '')
      if (serverId && serverId !== account.serverAccountId) { account.serverAccountId = serverId; changed = true }
      const coins = finite(first(estado.gold, estado.ouro, estado.coins))
      const gems = finite(first(estado.orbs, estado.gems))
      if (coins !== null && coins !== account.coins) { account.coins = coins; changed = true }
      if (gems !== null && gems !== account.gems) { account.gems = gems; changed = true }
      const serverNow = finite(estado.servidorAgora)
      if (serverNow !== null) account.serverOffsetMs = serverNow - at
      const rows = extractServerInventory(estado, at)
      if (rows.length) {
        for (const row of rows) {
          const previous = account.inventory.get(row.itemId)
          account.inventory.set(row.itemId, row)
          this.learnCatalog(row.itemId, row.name, at)
          if (!previous || previous.quantity !== row.quantity || previous.name !== row.name) changed = true
        }
      }
    }

    if (type === 'market') {
      changed = this.ingestMarketPacket(account, packet, at) || changed
    }

    if (type === 'batalha' && Array.isArray(packet.ev)) {
      for (const event of packet.ev) {
        if (!isRecord(event) || event.k !== 'marketComprado' || !account.pending) continue
        const eventListingId = String(first(event.anuncioId, event.marketId, '') || '')
        if (eventListingId && eventListingId !== account.pending.listingId) continue
        const pending = account.pending
        account.pending = null
        account.lastAction = `Compra confirmada pelo servidor: ${pending.quantity}× ${this.catalog.get(pending.itemId)?.name || `Item #${pending.itemId}`}`
        const rule = account.rules.find((row) => row.itemId === pending.itemId)
        if (rule) account.statuses.set(rule.category, {
          category: rule.category, state: 'bought', message: account.lastAction,
          stock: account.inventory.get(pending.itemId)?.quantity ?? null,
          bestUnitPrice: pending.unitPrice, suggestedQuantity: 0, updatedAt: at
        })
        changed = true
      }
    }

    if (changed) this.options.onChanged()
    if (this.mode === 'auto' && (type === 'market' || type === 'estado' || type === 'welcome')) queueMicrotask(() => void this.evaluateAccount(accountId))
  }

  private ingestMarketPacket(account: AccountState, packet: JsonRecord, at: number): boolean {
    let changed = false
    const resumo = isRecord(packet.resumo) ? packet.resumo : null
    if (resumo) {
      for (const [itemIdRaw, value] of Object.entries(resumo)) {
        const itemId = String(positiveInt(itemIdRaw) ?? '')
        if (!itemId || !isRecord(value)) continue
        const coins = finite(first(value.minGold, value.minCoins))
        const gems = finite(first(value.minOrb, value.minGems))
        account.summaryPrices.set(itemId, { coins: coins && coins > 0 ? coins : null, gems: gems && gems > 0 ? gems : null, observedAt: at })
        this.learnCatalog(itemId, safeText(first(value.nome, value.name)) || `Item #${itemId}`, at, coins, gems)
        changed = true
      }
    }

    for (const key of LIST_ARRAY_KEYS) {
      const rows = packet[key]
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const listing = normalizeMarketListing(row, at)
        if (!listing) continue
        account.listings.set(listing.listingId, listing)
        this.learnCatalog(listing.itemId, listing.name, at, listing.currency === 'coins' ? listing.price : null, listing.currency === 'gems' ? listing.price : null)
        changed = true
      }
    }

    this.pruneAccount(account, at)
    return changed
  }

  private learnCatalog(itemId: string, name: string, at: number, coins?: number | null, gems?: number | null): void {
    const previous = this.catalog.get(itemId)
    const usefulName = name && !/^Item #/.test(name) ? name : previous?.name || name || `Item #${itemId}`
    this.catalog.set(itemId, {
      itemId,
      name: usefulName,
      bestCoins: coins && coins > 0 ? Math.min(previous?.bestCoins ?? Infinity, coins) : previous?.bestCoins ?? null,
      bestGems: gems && gems > 0 ? Math.min(previous?.bestGems ?? Infinity, gems) : previous?.bestGems ?? null,
      observedAt: at
    })
    if (this.catalog.size > 350) {
      const oldest = [...this.catalog.values()].sort((a,b) => a.observedAt - b.observedAt).slice(0, this.catalog.size - 300)
      for (const row of oldest) this.catalog.delete(row.itemId)
    }
  }

  async evaluateAccount(accountId: AccountId, now = Date.now()): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account) return
    this.pruneAccount(account, now)

    if (account.pending && now - account.pending.sentAt > PENDING_TIMEOUT_MS) {
      const pending = account.pending
      account.blockedListings.set(pending.listingId, now + 15_000)
      account.pending = null
      account.lastAction = 'Compra sem confirmação do servidor; anúncio bloqueado temporariamente'
    }

    for (const rule of account.rules) {
      const status = this.evaluateRule(account, rule, now)
      account.statuses.set(rule.category, status)
      if (status.state !== 'would-buy' || this.mode !== 'auto' || account.pending) continue

      const listing = this.bestListing(account, rule, now)
      if (!listing) continue
      const quantity = Math.min(status.suggestedQuantity, listing.quantity, 9999)
      if (quantity <= 0) continue
      if (!this.rateAllowed(account, now)) {
        account.statuses.set(rule.category, { ...status, state: 'blocked', message: 'Limite de segurança: aguarde antes da próxima compra', updatedAt: now })
        continue
      }

      const total = listing.price * quantity
      const balance = rule.currency === 'gems' ? account.gems : account.coins
      if (balance === null || balance < total) {
        account.statuses.set(rule.category, { ...status, state: 'blocked', message: `Saldo insuficiente para ${quantity} un.`, updatedAt: now })
        continue
      }

      account.pending = { listingId: listing.listingId, itemId: listing.itemId, quantity, unitPrice: listing.price, currency: listing.currency, sentAt: now }
      account.statuses.set(rule.category, { ...status, state: 'buying', message: `Enviando compra de ${quantity} un. · aguardando servidor`, updatedAt: now })
      account.lastAction = `Compra enviada: ${quantity}× ${listing.name} a ${listing.price}`
      this.options.onChanged()

      const result = await this.options.sendCommand(account.id, {
        t: 'market.comprar',
        id: Number(listing.listingId),
        qtd: quantity,
        preco: listing.price,
        moeda: currencyToWire(listing.currency)
      })
      if (!result.ok) {
        account.pending = null
        account.blockedListings.set(listing.listingId, Date.now() + 10_000)
        account.lastAction = `Compra não enviada: ${result.reason || 'socket indisponível'}`
        account.statuses.set(rule.category, { ...status, state: 'error', message: account.lastAction, updatedAt: Date.now() })
      } else {
        account.orderTimes.push(Date.now())
      }
      this.options.onChanged()
      break
    }
  }

  private evaluateRule(account: AccountState, rule: AutoMarketRule, now: number): AutoMarketRuleStatus {
    const base = { category: rule.category, stock: null as number | null, bestUnitPrice: null as number | null, suggestedQuantity: 0, updatedAt: now }
    if (!rule.enabled) return { ...base, state: 'disabled', message: 'Pausado' }
    if (!rule.itemId) return { ...base, state: 'waiting', message: 'Selecione um item do servidor' }
    if (!account.connected || !account.socketReady) return { ...base, state: 'waiting', message: 'Aguardando WebSocket do PokeIdle' }

    const inventory = account.inventory.get(rule.itemId)
    if (!inventory || now - inventory.observedAt > INVENTORY_STALE_MS) return { ...base, state: 'waiting', message: 'Aguardando estoque real do servidor' }
    base.stock = inventory.quantity
    if (inventory.quantity > rule.minStock) return { ...base, state: 'ok', message: `Estoque OK · mínimo ${rule.minStock}` }
    if (rule.targetStock <= inventory.quantity) return { ...base, state: 'blocked', message: 'Comprar até precisa ser maior que o estoque atual' }
    if (rule.maxUnitPrice <= 0) return { ...base, state: 'blocked', message: 'Defina o preço máximo por unidade' }

    const listing = this.bestListing(account, rule, now)
    if (!listing) return { ...base, state: 'waiting', message: 'Sem anúncio real e recente dentro do teto' }
    base.bestUnitPrice = listing.price
    base.suggestedQuantity = Math.max(0, rule.targetStock - inventory.quantity)
    if (!base.suggestedQuantity) return { ...base, state: 'ok', message: 'Estoque no alvo' }
    if (account.pending) return { ...base, state: 'buying', message: 'Aguardando confirmação da compra anterior' }
    const message = `${base.suggestedQuantity} un. necessárias · melhor ${listing.price}/${rule.currency === 'gems' ? '💎' : '🪙'}`
    return { ...base, state: 'would-buy', message: this.mode === 'observe' ? `OBSERVAR · compraria ${message}` : message }
  }

  private bestListing(account: AccountState, rule: AutoMarketRule, now: number): MarketListing | null {
    const serverNow = now + account.serverOffsetMs
    return [...account.listings.values()]
      .filter((listing) => listing.itemId === rule.itemId && listing.currency === rule.currency)
      .filter((listing) => now - listing.observedAt <= LISTING_STALE_MS)
      .filter((listing) => listing.price <= rule.maxUnitPrice)
      .filter((listing) => !listing.availableAt || listing.availableAt <= serverNow)
      .filter((listing) => !account.serverAccountId || !listing.sellerId || listing.sellerId !== account.serverAccountId)
      .filter((listing) => (account.blockedListings.get(listing.listingId) ?? 0) <= now)
      .sort((a,b) => a.price - b.price || a.observedAt - b.observedAt)[0] ?? null
  }

  private rateAllowed(account: AccountState, now: number): boolean {
    account.orderTimes = account.orderTimes.filter((at) => now - at < 60_000)
    if (account.orderTimes.length >= 4) return false
    const last = account.orderTimes.at(-1) ?? 0
    return now - last >= 3_000
  }

  private pruneAccount(account: AccountState, now: number): void {
    for (const [id, listing] of account.listings) if (now - listing.observedAt > 60_000) account.listings.delete(id)
    if (account.listings.size > 250) {
      const rows = [...account.listings.values()].sort((a,b) => b.observedAt - a.observedAt).slice(0,200)
      account.listings = new Map(rows.map((row) => [row.listingId, row]))
    }
    for (const [id, until] of account.blockedListings) if (until <= now) account.blockedListings.delete(id)
  }

  private async probe(account: AccountState): Promise<void> {
    if (!account.socketReady || account.pending) return
    const configured = account.rules.filter((rule) => rule.enabled && rule.itemId)
    let command: JsonRecord
    if (configured.length) {
      const rule = configured[this.cursor % configured.length]
      command = { t: 'market.item', tipo: 'item', itemId: Number(rule.itemId), pagina: 1 }
    } else {
      command = { t: 'market.itens', elemento: '', categoria: '' }
    }
    await this.options.sendCommand(account.id, command)
  }

  async tick(): Promise<void> {
    if (this.disposed) return
    const ids = [1,2,3,4] as AccountId[]
    const id = ids[this.cursor++ % ids.length]
    const account = this.accounts.get(id)
    this.lastTickAt = Date.now()
    if (account) {
      await this.probe(account)
      await this.evaluateAccount(id)
    }
    this.options.onChanged()
  }

  private schedule(): void {
    if (!this.scheduler || this.disposed) return
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (!this.uiActive && this.mode !== 'auto') return
    const delay = this.uiActive ? PROBE_INTERVAL_OPEN_MS : PROBE_INTERVAL_BACKGROUND_MS
    this.timer = setTimeout(async () => {
      this.timer = null
      try { await this.tick() } finally { this.schedule() }
    }, delay)
  }

  destroy(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const account of this.accounts.values()) account.pending = null
  }
}
