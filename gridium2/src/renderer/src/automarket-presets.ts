import type { AutoMarketCategory } from '../../shared/contracts'

export interface AutoMarketVisualPreset {
  key: string
  name: string
  category: AutoMarketCategory
}

export const AUTO_MARKET_VISUAL_PRESETS: Record<AutoMarketCategory, AutoMarketVisualPreset[]> = {
  balls: [
    { key: 'poke-ball', name: 'Poké Ball', category: 'balls' },
    { key: 'great-ball', name: 'Great Ball', category: 'balls' },
    { key: 'ultra-ball', name: 'Ultra Ball', category: 'balls' },
    { key: 'beast-ball', name: 'Beast Ball', category: 'balls' },
    { key: 'master-ball', name: 'Master Ball', category: 'balls' }
  ],
  potions: [
    { key: 'small-potion', name: 'Small Potion', category: 'potions' },
    { key: 'potion', name: 'Potion', category: 'potions' },
    { key: 'super-potion', name: 'Super Potion', category: 'potions' },
    { key: 'hyper-potion', name: 'Hyper Potion', category: 'potions' },
    { key: 'ultra-potion', name: 'Ultra Potion', category: 'potions' },
    { key: 'max-potion', name: 'Max Potion', category: 'potions' }
  ],
  revives: [
    { key: 'revive', name: 'Revive', category: 'revives' },
    { key: 'max-revive', name: 'Max Revive', category: 'revives' }
  ]
}
