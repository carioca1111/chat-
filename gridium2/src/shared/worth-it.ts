import type { HuntStatBlock, PokemonWorthSnapshot } from './contracts'

export type WorthStatKey = 'hp' | 'atk' | 'def' | 'spAtk' | 'spDef' | 'speed'
export const WORTH_STAT_KEYS: WorthStatKey[] = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed']

export interface WorthProjection {
  level: number
  stats: HuntStatBlock
  total: number
  method: 'scaled-current' | 'formula' | 'unavailable'
}

export interface WorthComparison {
  targetLevel: number
  left: WorthProjection
  right: WorthProjection
  differencePercent: number | null
  leftWins: number
  rightWins: number
  ties: number
  verdict: 'left' | 'right' | 'tie' | 'insufficient'
}

const potencyMultiplier: Record<1|2|3|4|5, number> = { 1: 1, 2: 1.05, 3: 1.1, 4: 1.25, 5: 2 }
const qualityExponent: Record<WorthStatKey, number> = { hp: .95, atk: .8, def: .8, spAtk: .8, spDef: .8, speed: .95 }

const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

function parseWhole(value: string | undefined): number | undefined {
  if (!value) return undefined
  const token = value.match(/-?\d[\d.,]*/)?.[0]
  if (!token) return undefined
  const parsed = Number(token.replace(/[.,]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseDecimal(value: string | undefined): number | undefined {
  if (!value) return undefined
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.')
  const parsed = Number(cleaned.replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function yesNo(value: string | undefined): boolean | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (['sim', 'yes', 'true'].includes(normalized)) return true
  if (['nao', 'no', 'false'].includes(normalized)) return false
  return undefined
}

function lineValue(source: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`^\\s*[-*]?\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, 'im'))
  return match?.[1]?.trim()
}

function statKey(label: string): WorthStatKey | null {
  const normalized = label.toUpperCase().replace(/\s/g, '').replace(/\./g, '')
  if (normalized === 'HP') return 'hp'
  if (normalized === 'ATK') return 'atk'
  if (normalized === 'DEF') return 'def'
  if (normalized === 'SPATK') return 'spAtk'
  if (normalized === 'SPDEF') return 'spDef'
  if (normalized === 'SPD' || normalized === 'SPEED') return 'speed'
  return null
}

export function parsePokemonFicha(rawInput: string): PokemonWorthSnapshot | null {
  const source = rawInput
    .replace(/\\\r?\n/g, '\n')
    .replace(/^\\(?=[#|*-])/gm, '')
    .replace(/\r/g, '')
    .trim()
  if (!source) return null

  const speciesLine = lineValue(source, 'Espécie')
  const speciesMatch = speciesLine?.match(/^(.+?)\s*\(#\s*(\d+)\s*\)\s*(?:—|–|-)\s*(.+)$/)
    ?? speciesLine?.match(/^(.+?)\s*\(#\s*(\d+)\s*\)/)
  const headerMatch = source.match(/^#\s*([^—\n#]+?)\s*—\s*ficha/i)
  const speciesName = speciesMatch?.[1]?.trim() || headerMatch?.[1]?.trim()
  const speciesId = speciesMatch?.[2] ? Number(speciesMatch[2]) : undefined
  const types = speciesMatch?.[3]
    ? speciesMatch[3].split('/').map((item) => item.trim().toUpperCase()).filter(Boolean).slice(0, 3)
    : undefined

  const level = parseWhole(lineValue(source, 'Nível'))
  const potencyRaw = lineValue(source, 'Potência')
  const potencyMatch = potencyRaw?.match(/P\s*([1-5])/i)
  const potency = potencyMatch ? Number(potencyMatch[1]) as 1|2|3|4|5 : undefined
  const quality = parseDecimal(lineValue(source, 'Qualidade')?.match(/[0-9]+(?:[.,][0-9]+)?/)?.[0])
  const ivTotal = parseWhole(lineValue(source, 'IV somado')?.match(/\d+/)?.[0])
  const scoreLine = lineValue(source, 'Nota da Calculadora')
  const calculatorScore = parseDecimal(scoreLine?.match(/[0-9]+(?:[.,][0-9]+)?/)?.[0])
  const power = parseWhole(lineValue(source, 'Poder') ?? lineValue(source, 'Poder (⚔)'))
  const combatHp = parseWhole(lineValue(source, 'HP de combate'))
  const shiny = yesNo(lineValue(source, 'Shiny'))
  const legendary = yesNo(lineValue(source, 'Lendário')) ?? yesNo(lineValue(source, 'Lendário ou Mítico'))

  const baseStats: HuntStatBlock = {}
  const ivs: HuntStatBlock = {}
  const stats: HuntStatBlock = {}
  for (const line of source.split('\n')) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map((cell) => cell.trim()).filter((_, index, array) => index > 0 && index < array.length - 1)
    if (cells.length < 4) continue
    const key = statKey(cells[0])
    if (!key) continue
    const base = parseWhole(cells[1])
    const iv = parseWhole(cells[2])
    const current = parseWhole(cells[3])
    if (base !== undefined) baseStats[key] = base
    if (iv !== undefined) ivs[key] = iv
    if (current !== undefined) stats[key] = current
  }

  const hasBase = WORTH_STAT_KEYS.some((key) => finite(baseStats[key]) !== undefined)
  const hasIvs = WORTH_STAT_KEYS.some((key) => finite(ivs[key]) !== undefined)
  const hasStats = WORTH_STAT_KEYS.some((key) => finite(stats[key]) !== undefined)
  if (!speciesName && speciesId === undefined && !hasStats) return null

  return {
    instanceId: `external:${speciesId ?? speciesName ?? 'pokemon'}`,
    speciesId,
    speciesName,
    level,
    quality,
    potency,
    ivTotal,
    ivs: hasIvs ? ivs : undefined,
    baseStats: hasBase ? baseStats : undefined,
    stats: hasStats ? stats : undefined,
    shiny,
    legendary,
    types,
    calculatorScore,
    power,
    combatHp: combatHp ?? (finite(stats.hp) !== undefined ? Math.round(Number(stats.hp) * 12) : undefined),
    source: 'external'
  }
}

export function calculatePokeIdleStat(params: {
  stat: WorthStatKey
  base: number
  refinement?: number
  iv: number
  level: number
  quality: number
  potency: 1|2|3|4|5
  shiny?: boolean
  legendary?: boolean
}): number {
  const q = Math.max(.01, params.quality)
  const raw = (params.base + (params.refinement ?? 0) + 2 * params.iv)
    * (params.level / 100)
    * Math.pow(q, qualityExponent[params.stat])
    * potencyMultiplier[params.potency]
    * (params.shiny ? 3 : 1)
    * (params.legendary ? 4 : 1)
  return Math.max(0, raw)
}

export function projectPokemon(pokemon: PokemonWorthSnapshot | null | undefined, targetLevel: number): WorthProjection {
  const level = Math.max(1, Math.min(10_000, Math.floor(targetLevel || pokemon?.level || 1)))
  if (!pokemon) return { level, stats: {}, total: 0, method: 'unavailable' }

  const currentLevel = finite(pokemon.level)
  if (pokemon.stats && currentLevel && currentLevel > 0) {
    const stats: HuntStatBlock = {}
    for (const key of WORTH_STAT_KEYS) {
      const value = finite(pokemon.stats[key])
      if (value !== undefined) stats[key] = value * (level / currentLevel)
    }
    const total = WORTH_STAT_KEYS.reduce((sum, key) => sum + (finite(stats[key]) ?? 0), 0)
    if (total > 0) return { level, stats, total, method: 'scaled-current' }
  }

  if (pokemon.baseStats && pokemon.ivs && pokemon.quality !== undefined && pokemon.potency !== undefined) {
    const stats: HuntStatBlock = {}
    for (const key of WORTH_STAT_KEYS) {
      const base = finite(pokemon.baseStats[key])
      const iv = finite(pokemon.ivs[key])
      if (base === undefined || iv === undefined) continue
      stats[key] = calculatePokeIdleStat({
        stat: key,
        base,
        refinement: finite(pokemon.refinement?.[key]),
        iv,
        level,
        quality: pokemon.quality,
        potency: pokemon.potency,
        shiny: pokemon.shiny,
        legendary: pokemon.legendary
      })
    }
    const total = WORTH_STAT_KEYS.reduce((sum, key) => sum + (finite(stats[key]) ?? 0), 0)
    if (total > 0) return { level, stats, total, method: 'formula' }
  }

  return { level, stats: {}, total: 0, method: 'unavailable' }
}

export function comparePokemonWorth(leftPokemon: PokemonWorthSnapshot | null | undefined, rightPokemon: PokemonWorthSnapshot | null | undefined, targetLevel?: number): WorthComparison {
  const level = Math.max(1, Math.floor(targetLevel || Math.max(leftPokemon?.level ?? 1, rightPokemon?.level ?? 1)))
  const left = projectPokemon(leftPokemon, level)
  const right = projectPokemon(rightPokemon, level)
  let leftWins = 0, rightWins = 0, ties = 0
  for (const key of WORTH_STAT_KEYS) {
    const a = finite(left.stats[key])
    const b = finite(right.stats[key])
    if (a === undefined || b === undefined) continue
    const tolerance = Math.max(1, Math.max(a, b) * .001)
    if (Math.abs(a - b) <= tolerance) ties++
    else if (a > b) leftWins++
    else rightWins++
  }
  if (left.total <= 0 || right.total <= 0) {
    return { targetLevel: level, left, right, differencePercent: null, leftWins, rightWins, ties, verdict: 'insufficient' }
  }
  const differencePercent = ((right.total - left.total) / left.total) * 100
  const verdict = Math.abs(differencePercent) <= 2 ? 'tie' : differencePercent > 0 ? 'right' : 'left'
  return { targetLevel: level, left, right, differencePercent, leftWins, rightWins, ties, verdict }
}

export function pokemonWorthLabel(pokemon: PokemonWorthSnapshot): string {
  const species = text(pokemon.speciesName) || (pokemon.speciesId !== undefined ? `Espécie #${pokemon.speciesId}` : 'Pokémon')
  const level = pokemon.level !== undefined ? `Nv ${Math.round(pokemon.level)}` : 'Nv ?'
  const potency = pokemon.potency ? `P${pokemon.potency}` : 'P?'
  const shiny = pokemon.shiny ? ' ✦' : ''
  return `${species}${shiny} · ${level} · ${potency}`
}
