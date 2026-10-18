import type { GridiumApi } from '../../shared/contracts'

declare global {
  interface Window {
    gridium2: GridiumApi
  }
}

export {}
