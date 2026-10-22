export type AccountId = 1 | 2 | 3 | 4
export type LayoutMode = 1 | 2 | 4
export type PerformanceMode = 'auto' | 'full'
export type VisualMode = 'full' | 'eco'
export type AppModule = 'accounts' | 'hunt' | 'automarket' | 'panel' | 'settings'
export type AccountCommand = 'home' | 'reload' | 'back' | 'forward'
export type AccountPowerMode = 'auto' | 'on' | 'black' | 'suspended'
export type EffectivePowerState = 'on' | 'black' | 'suspended'
export type PowerAutomationKey = 'blackUnfocused' | 'blackWhenMinimized' | 'wakeOnSelect'
export type AutoMarketMode = 'observe' | 'auto'
export type AutoMarketCategory = 'balls' | 'potions' | 'revives'
export type MarketCurrency = 'coins' | 'gems'
export type PanelGranularity = 'minute' | 'hour' | 'day'

export type AccountStatus = 'booting' | 'loading' | 'ready' | 'offline' | 'crashed'
export type HuntProtocolStatus = 'waiting' | 'live' | 'unavailable'

export type PanelEventKind = 'capture' | 'shiny-caught' | 'rare-item' | 'market-sale' | 'rmt-sale'

export interface PanelEventSnapshot {
  at: number
  accountEvent: PanelEventKind
  label: string
  detail: string
  speciesId?: number
}

export interface PanelRareItemSnapshot {
  itemId: string
  name: string
  quantity: number
}

export interface PanelHistoryBucket {
  at: number
  pokemonXp: number
  captures: number
  goldEarned: number
  marketCoins: number
  marketGems: number
  rmtBrl: number
}

export interface PanelAnalyticsSnapshot {
  revision: number
  sessionStartedAt: number
  capturesTotal: number
  capturesLastHour: number
  capturesByPotency: [number, number, number, number, number]
  noteBands: [number, number, number, number, number, number, number, number]
  note35Plus: number
  shiniesSeen: number | null
  shiniesCaught: number
  rareItems: PanelRareItemSnapshot[]
  rareItemsTotal: number
  lastCaptureAt: number | null
  pokemonXpTotal: number
  pokemonXpLastHour: number
  goldEarnedTotal: number
  goldEarnedLastHour: number
  marketCoinsRevenue: number
  marketGemsRevenue: number
  rmtBrlRevenue: number
  historyMinute: PanelHistoryBucket[]
  historyHour: PanelHistoryBucket[]
  historyDay: PanelHistoryBucket[]
  events: PanelEventSnapshot[]
}

export interface PanelRmtSaleInput {
  amountBrl: number
  description?: string
}

export interface PowerAutomationSettings {
  blackUnfocused: boolean
  blackWhenMinimized: boolean
  wakeOnSelect: boolean
}

export interface HuntStatBlock {
  hp?: number
  atk?: number
  def?: number
  spAtk?: number
  spDef?: number
  speed?: number
}

export interface HuntProfileScan {
  trainerLevel?: number
  trainerXp?: number
  trainerXpLevelStart?: number
  trainerXpNext?: number
  trainerXpMultiplier?: number
  activePokemonId?: string
  speciesId?: number
  speciesName?: string
  pokemonLevel?: number
  pokemonXp?: number
  pokemonXpLevelStart?: number
  pokemonXpNext?: number
  pokemonXpMultiplier?: number
  quality?: number
  potency?: 1 | 2 | 3 | 4 | 5
  ivTotal?: number
  ivAverage?: number
  ivs?: HuntStatBlock
  stats?: HuntStatBlock
  refinement?: HuntStatBlock
  maxHp?: number
  shiny?: boolean
  huntSlug?: string
  tmElemental?: string | number | null
  tmAoe?: boolean
  serverAccountId?: string
  serverNick?: string
  source: 'server'
  detectedAt: number
}

export interface AutoMarketRule {
  category: AutoMarketCategory
  enabled: boolean
  itemId: string
  itemName: string
  minStock: number
  targetStock: number
  maxUnitPrice: number
  currency: MarketCurrency
}

export interface AutoMarketInventoryItem {
  itemId: string
  name: string
  quantity: number
  observedAt: number
}

export interface AutoMarketCatalogItem {
  itemId: string
  name: string
  bestCoins: number | null
  bestGems: number | null
  observedAt: number
}

export interface AutoMarketRuleStatus {
  category: AutoMarketCategory
  state: 'disabled' | 'waiting' | 'ok' | 'would-buy' | 'buying' | 'bought' | 'blocked' | 'error'
  message: string
  stock: number | null
  bestUnitPrice: number | null
  suggestedQuantity: number
  updatedAt: number
}

export interface AutoMarketAccountSnapshot {
  accountId: AccountId
  connected: boolean
  socketReady: boolean
  serverNick: string
  coins: number | null
  gems: number | null
  lastServerAt: number
  inventory: AutoMarketInventoryItem[]
  rules: AutoMarketRule[]
  statuses: AutoMarketRuleStatus[]
  pending: boolean
  lastAction: string
}

export interface AutoMarketSnapshot {
  mode: AutoMarketMode
  uiActive: boolean
  accounts: AutoMarketAccountSnapshot[]
  catalog: AutoMarketCatalogItem[]
  lastTickAt: number
}

export interface AccountSnapshot {
  id: AccountId
  name: string
  status: AccountStatus
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  attached: boolean
  visualMode: VisualMode
  zoomPercent: number
  powerMode: AccountPowerMode
  effectivePowerState: EffectivePowerState
  suspendSupported: boolean
  panelAnalytics: PanelAnalyticsSnapshot
  huntProfile: HuntProfileScan | null
  huntProtocolStatus: HuntProtocolStatus
}

export interface TelemetrySnapshot {
  cpuPercent: number
  memoryMB: number
  mainEventLoopMeanMs: number
  mainEventLoopMaxMs: number
  processCount: number
  capturedAt: number
}

export interface GridiumSnapshot {
  layout: LayoutMode
  selectedAccount: AccountId
  performanceMode: PerformanceMode
  activeModule: AppModule
  keepDisplayAwake: boolean
  powerAutomation: PowerAutomationSettings
  accounts: AccountSnapshot[]
  autoMarket: AutoMarketSnapshot
  telemetry: TelemetrySnapshot
}

export interface GridiumApi {
  getSnapshot: () => Promise<GridiumSnapshot>
  setLayout: (layout: LayoutMode) => Promise<void>
  setPerformanceMode: (mode: PerformanceMode) => Promise<void>
  setModule: (module: AppModule) => Promise<void>
  setKeepDisplayAwake: (enabled: boolean) => Promise<void>
  setAccountZoom: (accountId: AccountId, zoomPercent: number) => Promise<void>
  setAccountPowerMode: (accountId: AccountId, mode: AccountPowerMode) => Promise<void>
  setAllAccountsPowerMode: (mode: AccountPowerMode) => Promise<void>
  setPowerAutomation: (key: PowerAutomationKey, enabled: boolean) => Promise<void>
  setAutoMarketMode: (mode: AutoMarketMode) => Promise<void>
  setAutoMarketRule: (accountId: AccountId, rule: AutoMarketRule) => Promise<void>
  addPanelRmtSale: (accountId: AccountId, sale: PanelRmtSaleInput) => Promise<boolean>
  scanHuntProfile: (accountId: AccountId) => Promise<HuntProfileScan | null>
  selectAccount: (accountId: AccountId) => Promise<void>
  accountCommand: (accountId: AccountId, command: AccountCommand) => Promise<void>
  onSnapshot: (callback: (snapshot: GridiumSnapshot) => void) => () => void
}
