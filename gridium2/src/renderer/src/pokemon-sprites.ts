import { loadHuntSpecies } from './hunt-data'
import type { HuntSpecies } from './hunt-data'

export function normalizePokemonLookupName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[♀]/g, ' f ')
    .replace(/[♂]/g, ' m ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchSpeciesIdByDisplayName(displayName: string, species: ReadonlyArray<readonly [number, string, ...unknown[]]>): number | null {
  const target = normalizePokemonLookupName(displayName)
  if (!target) return null
  let best: { id: number; length: number } | null = null
  for (const row of species) {
    const id = Number(row[0])
    const name = normalizePokemonLookupName(String(row[1] || ''))
    if (!Number.isFinite(id) || id <= 0 || !name) continue
    if (target !== name && !target.endsWith(` ${name}`)) continue
    if (!best || name.length > best.length) best = { id: Math.floor(id), length: name.length }
  }
  return best?.id ?? null
}

let speciesPromise: Promise<HuntSpecies[]> | null = null

export async function resolvePokemonSpeciesId(speciesId: number | undefined, displayName: string): Promise<number | null> {
  if (Number.isFinite(speciesId) && Number(speciesId) > 0) return Math.floor(Number(speciesId))
  speciesPromise ??= loadHuntSpecies()
  try {
    return matchSpeciesIdByDisplayName(displayName, await speciesPromise)
  } catch {
    return null
  }
}

export function pokemonSpriteUrl(speciesId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesId}.png`
}

export function pokemonArtworkUrl(speciesId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${speciesId}.png`
}
