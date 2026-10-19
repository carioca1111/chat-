import type { AutoMarketCategory } from '../../shared/contracts'
import { POKEIDLE_AUTO_MARKET_CATALOG } from '../../shared/pokeidle-item-catalog'

export interface AutoMarketVisualPreset {
  key: string
  name: string
  category: AutoMarketCategory
}

export const AUTO_MARKET_VISUAL_PRESETS: Record<AutoMarketCategory, AutoMarketVisualPreset[]> = POKEIDLE_AUTO_MARKET_CATALOG
