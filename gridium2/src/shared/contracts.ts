export type AccountId = 1 | 2 | 3 | 4
export type LayoutMode = 1 | 2 | 4
export type PerformanceMode = 'auto' | 'full'
export type VisualMode = 'full' | 'eco'
export type AppModule = 'accounts' | 'hunt' | 'settings'
export type AccountCommand = 'home' | 'reload' | 'back' | 'forward'
export type AccountPowerMode = 'auto' | 'on' | 'black' | 'suspended'
export type EffectivePowerState = 'on' | 'black' | 'suspended'
export type PowerAutomationKey = 'blackUnfocused' | 'blackWhenMinimized' | 'wakeOnSelect'

export type AccountStatus = 'booting' | 'loading' | 'ready' | 'offline' | 'crashed'
export type HuntProtocolStatus = 'waiting' | 'live' | 'unavailable'

export interface PowerAutomationSettings {
  blackUnfocused: boolean
  blackWhenMinimized: boolean
  wakeOnSelect: boolean
}

export interface HuntProfileScan {
  trainerLevel?: number
  activePokemonId?: string
  speciesId?: number
  speciesName?: string
  pokemonLevel?: number
  quality?: number
  potency?: 1 | 2 | 3 | 4 | 5
  ivTotal?: number
  ivAverage?: number
  shiny?: boolean
  serverAccountId?: string
  serverNick?: string
  source: 'server'
  detectedAt: number
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
  powerAutomation: PowerAutomationSettings
  accounts: AccountSnapshot[]
  telemetry: TelemetrySnapshot
}

export interface GridiumApi {
  getSnapshot: () => Promise<GridiumSnapshot>
  setLayout: (layout: LayoutMode) => Promise<void>
  setPerformanceMode: (mode: PerformanceMode) => Promise<void>
  setModule: (module: AppModule) => Promise<void>
  setAccountZoom: (accountId: AccountId, zoomPercent: number) => Promise<void>
  setAccountPowerMode: (accountId: AccountId, mode: AccountPowerMode) => Promise<void>
  setAllAccountsPowerMode: (mode: AccountPowerMode) => Promise<void>
  setPowerAutomation: (key: PowerAutomationKey, enabled: boolean) => Promise<void>
  scanHuntProfile: (accountId: AccountId) => Promise<HuntProfileScan | null>
  selectAccount: (accountId: AccountId) => Promise<void>
  accountCommand: (accountId: AccountId, command: AccountCommand) => Promise<void>
  onSnapshot: (callback: (snapshot: GridiumSnapshot) => void) => () => void
}
