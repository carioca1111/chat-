export type PokeIdleItemCategory = 'balls' | 'potions' | 'revives'

export interface PokeIdleItem {
  key: string
  name: string
  category: PokeIdleItemCategory
}

export const POKEIDLE_ITEM_CATALOG: Record<PokeIdleItemCategory, PokeIdleItem[]> = {
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
    { key: 'ultimate-potion', name: 'Ultimate Potion', category: 'potions' }
  ],
  revives: [
    { key: 'revive', name: 'Revive', category: 'revives' },
    { key: 'max-revive', name: 'Max Revive', category: 'revives' }
  ]
}

export function normalizePokeIdleItemName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

const canonicalByNormalized = new Map<string, PokeIdleItem>()
const byKey = new Map<string, PokeIdleItem>()
for (const items of Object.values(POKEIDLE_ITEM_CATALOG)) {
  for (const item of items) {
    canonicalByNormalized.set(normalizePokeIdleItemName(item.name), item)
    canonicalByNormalized.set(normalizePokeIdleItemName(item.key), item)
    byKey.set(item.key, item)
  }
}

const aliases: Record<string, string[]> = {
  'small-potion': ['smallpotion', 'potion1', 'potion 1', 'pocao1', 'pocao 1'],
  'great-potion': ['greatpotion', 'potion2', 'potion 2', 'pocao2', 'pocao 2'],
  'ultra-potion': ['ultrapotion', 'potion3', 'potion 3', 'pocao3', 'pocao 3'],
  'hyper-potion': ['hyperpotion', 'potion4', 'potion 4', 'pocao4', 'pocao 4'],
  'ultimate-potion': ['ultimatepotion', 'potion5', 'potion 5', 'pocao5', 'pocao 5'],
  'revive': ['revive1', 'revive 1', 'reviver1', 'reviver 1'],
  'max-revive': ['maxrevive', 'max revive', 'revive2', 'revive 2', 'reviver2', 'reviver 2']
}
for (const [key, values] of Object.entries(aliases)) {
  const item = byKey.get(key)
  if (!item) continue
  for (const alias of values) canonicalByNormalized.set(normalizePokeIdleItemName(alias), item)
}

export function canonicalPokeIdleItem(name: string): PokeIdleItem | null {
  return canonicalByNormalized.get(normalizePokeIdleItemName(name)) ?? null
}

export function categoryForPokeIdleItem(name: string): PokeIdleItemCategory | null {
  return canonicalPokeIdleItem(name)?.category ?? null
}
