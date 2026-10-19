const POKEAPI_ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/'

const aliases: Record<string, string> = {
  'poke ball': 'poke-ball',
  'pokeball': 'poke-ball',
  'poké ball': 'poke-ball',
  'pokéball': 'poke-ball',
  'great ball': 'great-ball',
  'ultra ball': 'ultra-ball',
  'master ball': 'master-ball',
  'premier ball': 'premier-ball',
  'luxury ball': 'luxury-ball',
  'heal ball': 'heal-ball',
  'quick ball': 'quick-ball',
  'dusk ball': 'dusk-ball',
  'timer ball': 'timer-ball',
  'repeat ball': 'repeat-ball',
  'nest ball': 'nest-ball',
  'net ball': 'net-ball',
  'dive ball': 'dive-ball',
  'small potion': 'potion',
  'potion': 'potion',
  'super potion': 'super-potion',
  'hyper potion': 'hyper-potion',
  'max potion': 'max-potion',
  'full restore': 'full-restore',
  'revive': 'revive',
  'max revive': 'max-revive'
}

export function itemSpriteUrl(name: string): string {
  const normalized = normalizeItemName(name)
  const slug = aliases[normalized] || normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug ? `${POKEAPI_ITEM_SPRITES}${slug}.png` : ''
}

export function normalizeItemName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}
