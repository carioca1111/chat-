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
    { key: 'ultimate-potion', name: 'Ultimate Potion', category: 'potions' },
    { key: 'golden-potion', name: 'Golden Potion', category: 'potions' }
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
  'small-potion': ['potion1','potion 1','pocao1','pocao 1','potion60','potion 60','pocao60','pocao 60','heal60','heal 60','cura60','cura 60'],
  'great-potion': ['potion2','potion 2','pocao2','pocao 2','potion150','potion 150','pocao150','pocao 150','heal150','heal 150','cura150','cura 150'],
  'ultra-potion': ['potion3','potion 3','pocao3','pocao 3','potion400','potion 400','pocao400','pocao 400','heal400','heal 400','cura400','cura 400'],
  'hyper-potion': ['potion4','potion 4','pocao4','pocao 4','potion1000','potion 1000','pocao1000','pocao 1000','heal1000','heal 1000','cura1000','cura 1000'],
  'ultimate-potion': ['potion5','potion 5','pocao5','pocao 5','potion3000','potion 3000','pocao3000','pocao 3000','heal3000','heal 3000','cura3000','cura 3000'],
  'golden-potion': ['potion6','potion 6','pocao6','pocao 6','gold potion','pocao dourada','pocao de ouro'],
  'revive': ['revive1','revive 1','reviver1','reviver 1'],
  'max-revive': ['maxrevive','max revive','revive2','revive 2','reviver2','reviver 2']
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
