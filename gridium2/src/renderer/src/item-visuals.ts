import { canonicalPokeIdleItem, normalizePokeIdleItemName } from '../../shared/pokeidle-item-catalog'

const svgData = (body: string): string => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" shape-rendering="crispEdges"><rect width="48" height="48" fill="none"/>${body}</svg>`)}`

const ballSvg = (top: string, bottom: string, accent: string, marks = ''): string => svgData(`
  <ellipse cx="24" cy="38" rx="15" ry="4" fill="#180f17" opacity=".65"/>
  <circle cx="24" cy="22" r="13" fill="#1b1319" stroke="#0f0a0e" stroke-width="2"/>
  <path d="M12 21a12 12 0 0 1 24 0H12z" fill="${top}"/>
  <path d="M12 23h24a12 12 0 0 1-24 0z" fill="${bottom}"/>
  ${marks}
  <rect x="11" y="20" width="26" height="5" fill="#21151d"/>
  <circle cx="24" cy="22.5" r="5" fill="#f7f1df" stroke="#24151c" stroke-width="2"/>
  <circle cx="24" cy="22.5" r="2" fill="${accent}"/>
`)

const potionSvg = (body: string, cap: string, stripe: string): string => svgData(`
  <ellipse cx="24" cy="39" rx="13" ry="3.5" fill="#160e15" opacity=".6"/>
  <rect x="20" y="8" width="10" height="7" rx="1" fill="${cap}" stroke="#1c1318" stroke-width="2"/>
  <rect x="18" y="13" width="14" height="5" rx="1" fill="#e8e8de" stroke="#1c1318" stroke-width="2"/>
  <path d="M18 17h14l3 5v13c0 3-2 5-5 5H20c-3 0-5-2-5-5V22l3-5z" fill="${body}" stroke="#1c1318" stroke-width="2"/>
  <rect x="17" y="25" width="16" height="5" fill="${stripe}" opacity=".92"/>
  <rect x="20" y="19" width="3" height="16" fill="#fff" opacity=".35"/>
`)

const reviveSvg = (body: string, accent: string): string => svgData(`
  <ellipse cx="24" cy="39" rx="12" ry="3.5" fill="#160e15" opacity=".6"/>
  <rect x="18" y="8" width="12" height="5" rx="1" fill="#f4f1e7" stroke="#1c1318" stroke-width="2"/>
  <path d="M17 12h14l3 5v18c0 3-2 5-5 5H19c-3 0-5-2-5-5V17l3-5z" fill="${body}" stroke="#1c1318" stroke-width="2"/>
  <rect x="17" y="22" width="17" height="6" fill="${accent}"/>
  <rect x="22" y="16" width="4" height="18" fill="#f4f1e7" opacity=".7"/>
  <rect x="20" y="23" width="8" height="4" fill="#f4f1e7"/>
`)

const sprites: Record<string, string> = {
  'poke-ball': ballSvg('#f06a34', '#f3eee0', '#f06a34'),
  'great-ball': ballSvg('#287ed6', '#f3eee0', '#287ed6', '<path d="M14 15l7 4-4 3-5-3zm20 0-7 4 4 3 5-3z" fill="#e84b4b"/>'),
  'super-ball': ballSvg('#f0dd24', '#f3eee0', '#f0dd24', '<path d="M12 16l8 5 4-8 4 8 8-5v6H12z" fill="#2f82d4"/>'),
  'ultra-ball': ballSvg('#ece33a', '#f3eee0', '#ece33a', '<path d="M16 11h5v10h-5zm11 0h5v10h-5z" fill="#30323a"/>'),
  'small-potion': potionSvg('#ece8d8', '#e2bf28', '#f6d44c'),
  'great-potion': potionSvg('#63c980', '#dfe8df', '#43a963'),
  'ultra-potion': potionSvg('#73d7e6', '#e3ecec', '#55b6ce'),
  'hyper-potion': potionSvg('#efb8bd', '#e8ece9', '#e98998'),
  'ultimate-potion': potionSvg('#24352e', '#d7e5df', '#52bd6a'),
  'golden-potion': potionSvg('#f2d62e', '#f7ed8c', '#ffec50'),
  'revive': reviveSvg('#e7ece8', '#70c96f'),
  'max-revive': reviveSvg('#dedfdc', '#d54945')
}

export function itemSpriteUrl(name: string): string {
  const item = canonicalPokeIdleItem(name)
  return item ? sprites[item.key] || '' : ''
}

export function normalizeItemName(name: string): string {
  return normalizePokeIdleItemName(name)
}
