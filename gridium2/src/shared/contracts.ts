export type AccountId = 1 | 2 | 3 | 4
export type LayoutMode = 1 | 2 | 4
export type AccountCommand = 'home' | 'reload' | 'back' | 'forward'

export type AccountStatus = 'booting' | 'loading' | 'ready' | 'offline' | 'crashed'

export interface AccountSnapshot {
  id: AccountId
  name: string
  status: AccountStatus
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  attached: boolean
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
  accounts: AccountSnapshot[]
  telemetry: TelemetrySnapshot
}

export interface GridiumApi {
  getSnapshot: () => Promise<GridiumSnapshot>
  setLayout: (layout: LayoutMode) => Promise<void>
  selectAccount: (accountId: AccountId) => Promise<void>
  accountCommand: (accountId: AccountId, command: AccountCommand) => Promise<void>
  onSnapshot: (callback: (snapshot: GridiumSnapshot) => void) => () => void
}
