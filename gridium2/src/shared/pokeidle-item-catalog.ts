import type { AutoMarketCategory } from './contracts'

export interface PokeIdleAutoMarketItem {
  key: string
  name: string
  category: AutoMarketCategory
}

export const POKEIDLE_AUTO_MARKET_CATALOG: Record<AutoMarketCategory, PokeIdleAutoMarketItem[]> = {
  balls: [
    { key: 'poke-ball', name: 'Poké Ball', category: 'balls' },
    { key: 'great-ball', name: 'Great Ball', category: 'balls' },
    { key: 'super-ball', name: 'Super Ball', category: 'balls' },
    { key: 'ultra-ball', name: 'Ultra Ball', category: 'balls' }
  ],
  potions: [
    { key: 'small-potion', name: 'Small Potion', category: 'potions' },
    { key: 'great-potion', name: 'Great Potion', category: 'potions' },
    { key: 'ultra-potion', name: 'Ultra Potion', category: 'potions' },
    { key: 'hyper-potion', name: 'Hyper Potion', category: 'potions' },
    { key: 'ultimate-potion', name: 'Ultimate Potion', category: 'potions' },
    { key: 'golden-potion', name: 'Golden Potion', category: 'potions' }
  ],
  revives: [
    { key: 'revive', name: 'Revive', category: 'revives' },
    { key: 'max-revive', name: 'Max Revive', category: 'revives' }
  ]
}

export const POKEIDLE_AUTO_MARKET_DEFAULTS: Record<AutoMarketCategory, string> = {
  balls: 'Ultra Ball',
  potions: 'Ultra Potion',
  revives: 'Revive'
}

export function normalizePokeIdleItemName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

const canonicalByNormalized = new Map<string, PokeIdleAutoMarketItem>()
for (const items of Object.values(POKEIDLE_AUTO_MARKET_CATALOG)) {
  for (const item of items) canonicalByNormalized.set(normalizePokeIdleItemName(item.name), item)
}

export function canonicalPokeIdleItem(name: string): PokeIdleAutoMarketItem | null {
  return canonicalByNormalized.get(normalizePokeIdleItemName(name)) ?? null
}

export function categoryForPokeIdleItem(name: string): AutoMarketCategory | null {
  return canonicalPokeIdleItem(name)?.category ?? null
}

export function isCanonicalPokeIdleAutoMarketItem(name: string): boolean {
  return canonicalPokeIdleItem(name) !== null
}
