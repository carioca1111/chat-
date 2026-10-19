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
  coins: number | null
  gems: number | null
  lastServerAt: number
  inventory: Map<string, InventoryRow>
  rules: AutoMarketRule[]
  statuses: Map<AutoMarketCategory, AutoMarketRuleStatus>
  pending: boolean
  lastAction: string
  orderTimes: number[]
}

const CATEGORIES: AutoMarketCategory[] = ['balls', 'potions', 'revives']
const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bag', 'consumables', 'consumiveis']
const LIST_ARRAY_KEYS = ['linhas', 'anuncios', 'lista', 'ofertas']
const INVENTORY_STALE_MS = 90_000
const TICK_OPEN_MS = 3_000
const TICK_BACKGROUND_MS = 4_500

const CANONICAL_ITEMS: Record<AutoMarketCategory, string[]> = {
  balls: ['Poké Ball', 'Great Ball', 'Super Ball', 'Ultra Ball'],
  potions: ['Small Potion', 'Great Potion', 'Ultra Potion', 'Hyper Potion', 'Ultimate Potion', 'Golden Potion'],
  revives: ['Revive', 'Max Revive']
}

const DEFAULT_ITEM: Record<AutoMarketCategory, string> = {
  balls: 'Ultra Ball',
  potions: 'Ultra Potion',
  revives: 'Revive'
}

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
const normalizeName = (value: string): string => String(value || '')
  .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')

function canonicalName(category: AutoMarketCategory, value: string): string {
  const normalized = normalizeName(value)
  return CANONICAL_ITEMS[category].find((name) => normalizeName(name) === normalized) ?? ''
}

export function defaultAutoMarketRules(): AutoMarketRule[] {
  return [
    { category: 'balls', enabled: false, itemId: '', itemName: DEFAULT_ITEM.balls, minStock: 500, targetStock: 5000, maxUnitPrice: 130, currency: 'coins' },
    { category: 'potions', enabled: false, itemId: '', itemName: DEFAULT_ITEM.potions, minStock: 100, targetStock: 1000, maxUnitPrice: 400, currency: 'coins' },
    { category: 'revives', enabled: false, itemId: '', itemName: DEFAULT_ITEM.revives, minStock: 20, targetStock: 200, maxUnitPrice: 600, currency: 'coins' }
  ]
}

function cleanRule(input: AutoMarketRule, category?: AutoMarketCategory): AutoMarketRule {
  const fallbackCategory = category && CATEGORIES.includes(category) ? category : CATEGORIES.includes(input.category) ? input.category : 'balls'
  const minStock = Math.max(0, Math.min(1_000_000, Math.floor(finite(input.minStock) ?? 0)))
  const targetStock = Math.max(minStock, Math.min(1_000_000, Math.floor(finite(input.targetStock) ?? minStock)))
  const validName = canonicalName(fallbackCategory, safeText(input.itemName, 80))
  const valid = Boolean(validName)
  return {
    category: fallbackCategory,
    enabled: input.enabled === true && valid,
    itemId: valid ? String(input.itemId || '').replace(/[^0-9]/g, '').slice(0, 20) : '',
    itemName: valid ? validName : '',
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
    if (!row) return base
    const cleaned = cleanRule({ ...base, ...row }, base.category)
    if (!cleaned.itemName) return { ...base, enabled: false }
    return cleaned
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

export function normalizeMarketListing(row: unknown, at = Date.now()): { listingId: string; itemId: string; name: string; price: number; currency: MarketCurrency; quantity: number; observedAt: number } | null {
  if (!isRecord(row)) return null
  const listingId = String(positiveInt(row.id) ?? '')
  const itemId = String(positiveInt(first(row.itemId, row.item_id)) ?? '')
  const price = finite(first(row.preco, row.price))
  const rawCurrency = String(first(row.moeda, row.currency, '') || '').toLowerCase()
  const currency: MarketCurrency | null = ['gold','coin','coins'].includes(rawCurrency) ? 'coins' : ['orb','orbs','gem','gems'].includes(rawCurrency) ? 'gems' : null
  if (!listingId || !itemId || price === null || price <= 0 || !currency) return null
  return {
    listingId,
    itemId,
    name: safeText(first(row.nome, row.itemNome, row.name)) || `Item #${itemId}`,
    price,
    currency,
    quantity: Math.max(1, Math.floor(finite(first(row.qtd, row.quantidade, row.qty, row.amount)) ?? 1)),
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
        id, connected: false, socketReady: false, serverNick: '', coins: null, gems: null, lastServerAt: 0,
        inventory: new Map(), rules, statuses: new Map(rules.map((rule) => [rule.category, waitingStatus(rule.category)])),
        pending: false, lastAction: 'Aguardando servidor', orderTimes: []
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
      pending: account.pending,
      lastAction: account.lastAction
    }))
    return {
      mode: this.mode,
      uiActive: this.uiActive,
      accounts,
      catalog: [...this.catalog.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(0,100),
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
    for (const account of this.accounts.values()) account.pending = false
    this.schedule()
    this.options.onChanged()
  }

  updateRule(accountId: AccountId, input: AutoMarketRule): void {
    const account = this.accounts.get(accountId)
    if (!account || !CATEGORIES.includes(input.category)) return
    const cleaned = cleanRule(input, input.category)
    account.rules = account.rules.map((rule) => rule.category === cleaned.category ? cleaned : rule)
    account.statuses.set(cleaned.category, waitingStatus(cleaned.category, cleaned.enabled ? 'Regra atualizada · macro aguardando verificação' : 'Regra pausada'))
    this.options.onPersist?.(this.persisted())
    this.options.onChanged()
  }

  setSocketReady(accountId: AccountId, ready: boolean): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    const changed = account.socketReady !== ready || account.connected !== ready
    account.socketReady = ready
    account.connected = ready
    if (!ready) account.pending = false
    if (changed) this.options.onChanged()
  }

  resetConnection(accountId: AccountId): void {
    const account = this.accounts.get(accountId)
    if (!account) return
    account.connected = false
    account.socketReady = false
    account.pending = false
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
      const coins = finite(first(estado.gold, estado.ouro, estado.coins))
      const gems = finite(first(estado.orbs, estado.gems))
      if (coins !== null && coins !== account.coins) { account.coins = coins; changed = true }
      if (gems !== null && gems !== account.gems) { account.gems = gems; changed = true }
      const rows = extractServerInventory(estado, at)
      for (const row of rows) {
        const previous = account.inventory.get(row.itemId)
        account.inventory.set(row.itemId, row)
        this.learnCatalog(row.itemId, row.name, at)
        if (!previous || previous.quantity !== row.quantity || previous.name !== row.name) changed = true
      }
    }

    if (type === 'market') {
      const resumo = isRecord(packet.resumo) ? packet.resumo : null
      if (resumo) {
        for (const [itemIdRaw, value] of Object.entries(resumo)) {
          if (!isRecord(value)) continue
          const itemId = String(positiveInt(itemIdRaw) ?? '')
          const name = safeText(first(value.nome, value.name))
          if (itemId && name) this.learnCatalog(itemId, name, at, finite(first(value.minGold, value.minCoins)), finite(first(value.minOrb, value.minGems)))
        }
      }
      for (const key of LIST_ARRAY_KEYS) {
        const rows = packet[key]
        if (!Array.isArray(rows)) continue
        for (const row of rows) {
          const listing = normalizeMarketListing(row, at)
          if (listing) this.learnCatalog(listing.itemId, listing.name, at, listing.currency === 'coins' ? listing.price : null, listing.currency === 'gems' ? listing.price : null)
        }
      }
    }

    if (changed) this.options.onChanged()
  }

  private learnCatalog(itemId: string, name: string, at: number, coins?: number | null, gems?: number | null): void {
    const category = CATEGORIES.find((cat) => canonicalName(cat, name))
    if (!category) return
    const canonical = canonicalName(category, name)
    const previous = this.catalog.get(itemId)
    this.catalog.set(itemId, {
      itemId,
      name: canonical,
      bestCoins: coins && coins > 0 ? Math.min(previous?.bestCoins ?? Infinity, coins) : previous?.bestCoins ?? null,
      bestGems: gems && gems > 0 ? Math.min(previous?.bestGems ?? Infinity, gems) : previous?.bestGems ?? null,
      observedAt: at
    })
  }

  private inventoryFor(account: AccountState, rule: AutoMarketRule): InventoryRow | null {
    if (rule.itemId && account.inventory.has(rule.itemId)) return account.inventory.get(rule.itemId) ?? null
    const target = normalizeName(rule.itemName)
    return [...account.inventory.values()].find((row) => normalizeName(row.name) === target) ?? null
  }

  private evaluateRule(account: AccountState, rule: AutoMarketRule, now: number): AutoMarketRuleStatus {
    const base = { category: rule.category, stock: null as number | null, bestUnitPrice: rule.maxUnitPrice > 0 ? rule.maxUnitPrice : null, suggestedQuantity: 0, updatedAt: now }
    if (!rule.enabled) return { ...base, state: 'disabled', message: 'Pausado' }
    if (!canonicalName(rule.category, rule.itemName)) return { ...base, state: 'blocked', message: 'Selecione um item válido do PokeIdle' }
    if (!account.connected || !account.socketReady) return { ...base, state: 'waiting', message: 'Aguardando sessão do PokeIdle' }
    if (rule.currency !== 'coins') return { ...base, state: 'blocked', message: 'Macro da loja suporta ouro nesta versão' }
    if (rule.maxUnitPrice <= 0) return { ...base, state: 'blocked', message: 'Defina o teto máximo por unidade' }
    if (account.pending) return { ...base, state: 'buying', message: 'Macro em execução' }

    const inventory = this.inventoryFor(account, rule)
    if (inventory && now - inventory.observedAt <= INVENTORY_STALE_MS) {
      base.stock = inventory.quantity
      if (inventory.quantity > rule.minStock) return { ...base, state: 'ok', message: `Estoque OK · ${inventory.quantity} > mínimo ${rule.minStock}` }
      if (rule.targetStock <= inventory.quantity) return { ...base, state: 'blocked', message: 'Comprar até precisa ser maior que o estoque atual' }
      base.suggestedQuantity = Math.max(0, rule.targetStock - inventory.quantity)
    } else {
      base.suggestedQuantity = Math.max(1, rule.targetStock)
    }

    const message = base.stock === null
      ? `Macro conferirá estoque/preço no card de ${rule.itemName}`
      : `${base.suggestedQuantity} un. para chegar a ${rule.targetStock}`
    return { ...base, state: 'would-buy', message: this.mode === 'observe' ? `OBSERVAR · ${message}` : message }
  }

  private rateAllowed(account: AccountState, now: number): boolean {
    account.orderTimes = account.orderTimes.filter((at) => now - at < 60_000)
    if (account.orderTimes.length >= 4) return false
    const last = account.orderTimes.at(-1) ?? 0
    return now - last >= 3_000
  }

  private macroToken(rule: AutoMarketRule): string {
    return ['__gridium_macro__', rule.category, encodeURIComponent(rule.itemName), rule.minStock, rule.targetStock, rule.maxUnitPrice, rule.currency].join('|')
  }

  private parseMacroReason(reason: string): { kind: string; values: number[] } {
    const parts = String(reason || '').split(':')
    return { kind: parts[0] || '', values: parts.slice(1).map((value) => Number(value)).filter(Number.isFinite) }
  }

  async evaluateAccount(accountId: AccountId, now = Date.now()): Promise<void> {
    const account = this.accounts.get(accountId)
    if (!account) return

    for (const rule of account.rules) {
      const status = this.evaluateRule(account, rule, now)
      account.statuses.set(rule.category, status)
      if (status.state !== 'would-buy' || this.mode !== 'auto') continue
      if (!this.rateAllowed(account, now)) {
        account.statuses.set(rule.category, { ...status, state: 'blocked', message: 'Limite de segurança: aguarde antes da próxima compra', updatedAt: now })
        continue
      }

      account.pending = true
      account.statuses.set(rule.category, { ...status, state: 'buying', message: `Macro abrindo Market · ${rule.itemName}`, updatedAt: now })
      this.options.onChanged()

      try {
        const prep = await this.options.sendCommand(account.id, { t: 'market.itens', elemento: '', categoria: this.macroToken(rule) })
        if (!prep.ok) {
          account.statuses.set(rule.category, { ...status, state: 'error', message: `Macro não preparado: ${prep.reason || 'erro'}`, updatedAt: Date.now() })
          account.lastAction = `Macro falhou ao preparar ${rule.itemName}`
          break
        }

        const result = await this.options.sendCommand(account.id, {
          t: 'market.comprar',
          id: 1,
          qtd: Math.max(1, Math.min(9999, status.suggestedQuantity || 1)),
          preco: rule.maxUnitPrice,
          moeda: 'gold'
        })

        if (result.ok) {
          account.orderTimes.push(Date.now())
          account.lastAction = `Macro confirmou compra de ${rule.itemName} pela interface do PokeIdle`
          account.statuses.set(rule.category, { ...status, state: 'bought', message: account.lastAction, updatedAt: Date.now() })
        } else {
          const parsed = this.parseMacroReason(result.reason || '')
          if (parsed.kind === 'macro-stock-ok') {
            const stock = parsed.values[0] ?? status.stock
            account.statuses.set(rule.category, { ...status, state: 'ok', stock: stock ?? null, message: `Estoque OK no Market · ${stock ?? 'confirmado'}`, updatedAt: Date.now() })
            account.lastAction = `${rule.itemName}: estoque suficiente`
          } else if (parsed.kind === 'macro-price-above') {
            const price = parsed.values[0] ?? 0
            account.statuses.set(rule.category, { ...status, state: 'blocked', bestUnitPrice: price || null, message: `Preço ${price} acima do teto ${rule.maxUnitPrice}`, updatedAt: Date.now() })
            account.lastAction = `${rule.itemName}: preço acima do teto`
          } else if (parsed.kind === 'macro-no-funds') {
            account.statuses.set(rule.category, { ...status, state: 'blocked', message: 'Saldo insuficiente para completar o reabastecimento', updatedAt: Date.now() })
            account.lastAction = `${rule.itemName}: saldo insuficiente`
          } else {
            account.statuses.set(rule.category, { ...status, state: 'error', message: `Macro: ${result.reason || 'falha sem detalhe'}`, updatedAt: Date.now() })
            account.lastAction = `Macro falhou em ${rule.itemName}: ${result.reason || 'erro'}`
          }
        }
      } finally {
        account.pending = false
        this.options.onChanged()
      }
      break
    }
  }

  async tick(): Promise<void> {
    if (this.disposed) return
    const ids = [1,2,3,4] as AccountId[]
    const id = ids[this.cursor++ % ids.length]
    this.lastTickAt = Date.now()
    await this.evaluateAccount(id)
    this.options.onChanged()
  }

  private schedule(): void {
    if (!this.scheduler || this.disposed) return
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (!this.uiActive && this.mode !== 'auto') return
    const delay = this.uiActive ? TICK_OPEN_MS : TICK_BACKGROUND_MS
    this.timer = setTimeout(async () => {
      this.timer = null
      try { await this.tick() } finally { this.schedule() }
    }, delay)
  }

  destroy(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const account of this.accounts.values()) account.pending = false
  }
}
