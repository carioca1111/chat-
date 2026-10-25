import type { PokemonWorthSnapshot } from '../../shared/contracts'
import { projectPokemon, WORTH_STAT_KEYS } from '../../shared/worth-it'
import type { HuntSpecies } from './hunt-data'
import { rankHunts, xpTotalForLevel, type HuntProfile, type HuntRecommendation } from './hunt-engine'

export interface WorthDecisionContext {
  trainerLevel: number
  estimatedTrainerLevel?: boolean
}

export interface WorthDecisionRouteStage {
  key: string
  speciesId: number
  huntName: string
  area: string
  region: string
  huntLevel: number
  fromLevel: number
  toLevel: number
  startXpPerHour: number
  endXpPerHour: number
  hours: number
  confidence: 'ESTIMADO' | 'CALIBRADO'
}

export interface WorthDecisionResult {
  available: boolean
  reason?: string
  score: number | null
  verdict: 'buy' | 'consider' | 'skip' | 'unavailable'
  verdictTitle: string
  ownLevel: number | null
  candidateLevel: number | null
  ownXpPerHour: number | null
  candidateXpPerHour: number | null
  candidateAtOwnLevelXpPerHour: number | null
  gainPercentAtOwnLevel: number | null
  breakEvenLevel: number | null
  breakEvenHours: number | null
  timeToOwnLevelHours: number | null
  lostXpAtBreakEven: number | null
  returnAfterBreakEvenHours: number | null
  ownHunt: WorthDecisionHunt | null
  candidateHunt: WorthDecisionHunt | null
  candidateAtOwnLevelHunt: WorthDecisionHunt | null
  route: WorthDecisionRouteStage[]
  trainerLevel: number
  estimatedTrainerLevel: boolean
}

export interface WorthDecisionHunt {
  key: string
  speciesId: number
  name: string
  area: string
  region: string
  level: number
  pokemonXpPerHour: number
  confidence: 'ESTIMADO' | 'CALIBRADO'
}

interface SimulationResult {
  route: WorthDecisionRouteStage[]
  breakEvenLevel: number | null
  breakEvenHours: number | null
  timeToTargetHours: number
  lostXpAtBreakEven: number | null
  returnAfterBreakEvenHours: number | null
  finalXpPerHour: number | null
  finalHunt: WorthDecisionHunt | null
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined

function normalize(value: string | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function resolveSpecies(data: HuntSpecies[], pokemon: PokemonWorthSnapshot): HuntSpecies | undefined {
  if (pokemon.speciesId !== undefined) {
    const byId = data.find((row) => row[0] === pokemon.speciesId)
    if (byId) return byId
  }
  const name = normalize(pokemon.speciesName)
  if (!name) return undefined
  const exact = data.find((row) => normalize(row[1]) === name)
  if (exact) return exact
  return data
    .filter((row) => name.endsWith(` ${normalize(row[1])}`) || normalize(row[1]).endsWith(` ${name}`))
    .sort((a, b) => b[1].length - a[1].length)[0]
}

function completeProjectedStats(pokemon: PokemonWorthSnapshot, level: number) {
  const projected = projectPokemon(pokemon, level)
  if (!WORTH_STAT_KEYS.every((key) => finite(projected.stats[key]) !== undefined)) return null
  return projected.stats
}

export function buildWorthHuntProfile(
  data: HuntSpecies[],
  pokemon: PokemonWorthSnapshot,
  level: number,
  context: WorthDecisionContext,
  absolutePokemonXp?: number
): HuntProfile | null {
  const species = resolveSpecies(data, pokemon)
  if (!species) return null
  const stats = completeProjectedStats(pokemon, level)
  if (!stats) return null
  const avgIv = finite(pokemon.ivTotal) !== undefined ? Number(pokemon.ivTotal) / 6 : 16
  const ivs = pokemon.ivs ?? {}
  const normalizedLevel = Math.max(1, Math.floor(level))
  const floorXp = xpTotalForLevel(normalizedLevel)
  const nextXp = xpTotalForLevel(normalizedLevel + 1)
  const suppliedXp = finite(absolutePokemonXp)
  const pokemonXp = suppliedXp !== undefined && suppliedXp >= floorXp && suppliedXp < nextXp ? suppliedXp : floorXp

  return {
    trainerLevel: Math.max(1, Math.floor(context.trainerLevel)),
    trainerXp: xpTotalForLevel(Math.max(1, Math.floor(context.trainerLevel))),
    trainerXpMultiplier: 1,
    speciesId: species[0],
    pokemonLevel: normalizedLevel,
    pokemonXp,
    pokemonXpMultiplier: 1,
    quality: finite(pokemon.quality) ?? 1,
    potency: pokemon.potency ?? 1,
    shiny: Boolean(pokemon.shiny),
    ivAtk: finite(ivs.atk) ?? avgIv,
    ivSpAtk: finite(ivs.spAtk) ?? avgIv,
    ivDef: finite(ivs.def) ?? avgIv,
    ivSpDef: finite(ivs.spDef) ?? avgIv,
    ivHp: finite(ivs.hp) ?? avgIv,
    ivSpeed: finite(ivs.speed) ?? avgIv,
    types: pokemon.types?.length ? pokemon.types : species[2],
    baseStats: species[3],
    stats,
    refinement: pokemon.refinement
  }
}

function bestFor(
  data: HuntSpecies[],
  pokemon: PokemonWorthSnapshot,
  level: number,
  context: WorthDecisionContext,
  absolutePokemonXp?: number
): HuntRecommendation | null {
  const profile = buildWorthHuntProfile(data, pokemon, level, context, absolutePokemonXp)
  if (!profile) return null
  return rankHunts(data, profile, 'route')[0] ?? null
}

function huntSnapshot(row: HuntRecommendation | null): WorthDecisionHunt | null {
  if (!row) return null
  return {
    key: row.key,
    speciesId: row.id,
    name: row.name,
    area: row.area,
    region: row.region,
    level: row.level,
    pokemonXpPerHour: row.pokemonXpPerHour,
    confidence: row.confidence
  }
}

function validPokemonLevel(pokemon: PokemonWorthSnapshot | null | undefined): number | null {
  const value = finite(pokemon?.level)
  return value !== undefined && value > 0 ? Math.max(1, Math.floor(value)) : null
}

function candidateStartingXp(candidate: PokemonWorthSnapshot, level: number): number {
  const floor = xpTotalForLevel(level)
  const next = xpTotalForLevel(level + 1)
  const current = finite(candidate.pokemonXp)
  return current !== undefined && current >= floor && current < next ? current : floor
}

function appendStage(
  route: WorthDecisionRouteStage[],
  best: HuntRecommendation,
  fromLevel: number,
  toLevel: number,
  xpPerHour: number,
  hours: number
): void {
  const previous = route[route.length - 1]
  if (previous && previous.key === best.key) {
    previous.toLevel = toLevel
    previous.endXpPerHour = xpPerHour
    previous.hours += hours
    return
  }
  route.push({
    key: best.key,
    speciesId: best.id,
    huntName: best.name,
    area: best.area,
    region: best.region,
    huntLevel: best.level,
    fromLevel,
    toLevel,
    startXpPerHour: xpPerHour,
    endXpPerHour: xpPerHour,
    hours,
    confidence: best.confidence
  })
}

function simulateCandidateToLevel(
  data: HuntSpecies[],
  candidate: PokemonWorthSnapshot,
  targetLevel: number,
  context: WorthDecisionContext,
  baselineXpPerHour: number
): SimulationResult {
  const startLevel = validPokemonLevel(candidate) ?? targetLevel
  if (startLevel >= targetLevel) {
    const best = bestFor(data, candidate, targetLevel, context)
    const xp = best?.pokemonXpPerHour ?? null
    const breakEven = xp !== null && xp >= baselineXpPerHour
    return {
      route: [],
      breakEvenLevel: breakEven ? targetLevel : null,
      breakEvenHours: breakEven ? 0 : null,
      timeToTargetHours: 0,
      lostXpAtBreakEven: breakEven ? 0 : null,
      returnAfterBreakEvenHours: breakEven ? 0 : null,
      finalXpPerHour: xp,
      finalHunt: huntSnapshot(best)
    }
  }

  const route: WorthDecisionRouteStage[] = []
  let level = startLevel
  let absoluteXp = candidateStartingXp(candidate, level)
  let elapsedHours = 0
  let lostXp = 0
  let lossAtBreakEven: number | null = null
  let remainingGap = 0
  let breakEvenLevel: number | null = null
  let breakEvenHours: number | null = null
  let returnAfterBreakEvenHours: number | null = null
  let lastXpPerHour: number | null = null
  let lastBest: HuntRecommendation | null = null

  for (let guard = 0; guard < 12_000 && level < targetLevel; guard += 1) {
    const best = bestFor(data, candidate, level, context, absoluteXp)
    if (!best || !Number.isFinite(best.pokemonXpPerHour) || best.pokemonXpPerHour <= 0) break
    const xpPerHour = best.pokemonXpPerHour
    lastXpPerHour = xpPerHour
    lastBest = best

    if (breakEvenLevel === null && xpPerHour >= baselineXpPerHour) {
      breakEvenLevel = level
      breakEvenHours = elapsedHours
      lossAtBreakEven = lostXp
      remainingGap = lostXp
      if (remainingGap <= 0) returnAfterBreakEvenHours = 0
    }

    const nextLevelXp = xpTotalForLevel(level + 1)
    const xpNeeded = Math.max(0, nextLevelXp - absoluteXp)
    const hours = xpNeeded / xpPerHour
    if (!Number.isFinite(hours) || hours < 0 || hours > 365 * 24) break

    if (breakEvenLevel === null) {
      lostXp += Math.max(0, baselineXpPerHour - xpPerHour) * hours
    } else if (returnAfterBreakEvenHours === null) {
      const netPerHour = xpPerHour - baselineXpPerHour
      if (netPerHour > 0 && remainingGap > 0) {
        const recoveryHours = remainingGap / netPerHour
        if (recoveryHours <= hours) {
          returnAfterBreakEvenHours = (elapsedHours - (breakEvenHours ?? elapsedHours)) + recoveryHours
          remainingGap = 0
        } else {
          remainingGap -= netPerHour * hours
        }
      } else if (netPerHour < 0) {
        remainingGap += -netPerHour * hours
      }
    }

    appendStage(route, best, level, level + 1, xpPerHour, hours)
    elapsedHours += hours
    absoluteXp = nextLevelXp
    level += 1
  }

  const finalBest = bestFor(data, candidate, targetLevel, context, xpTotalForLevel(targetLevel))
  const finalXpPerHour = finalBest?.pokemonXpPerHour ?? lastXpPerHour
  const finalHunt = huntSnapshot(finalBest ?? lastBest)
  if (route.length && finalBest && route[route.length - 1].key === finalBest.key) {
    route[route.length - 1].endXpPerHour = finalBest.pokemonXpPerHour
    route[route.length - 1].toLevel = targetLevel
  }

  if (breakEvenLevel === null && finalXpPerHour !== null && finalXpPerHour >= baselineXpPerHour) {
    breakEvenLevel = targetLevel
    breakEvenHours = elapsedHours
    lossAtBreakEven = lostXp
    remainingGap = lostXp
  }

  if (breakEvenLevel !== null && returnAfterBreakEvenHours === null && finalXpPerHour !== null) {
    const netPerHour = finalXpPerHour - baselineXpPerHour
    if (netPerHour > 0) {
      returnAfterBreakEvenHours = Math.max(0, elapsedHours - (breakEvenHours ?? elapsedHours)) + Math.max(0, remainingGap) / netPerHour
    }
  }

  return {
    route,
    breakEvenLevel,
    breakEvenHours,
    timeToTargetHours: elapsedHours,
    lostXpAtBreakEven: lossAtBreakEven,
    returnAfterBreakEvenHours,
    finalXpPerHour,
    finalHunt
  }
}

export function gridiumWorthScore(params: {
  ownXpPerHour: number
  candidateNowXpPerHour: number
  candidateAtOwnLevelXpPerHour: number
  returnAfterBreakEvenHours: number | null
}): number {
  const own = Math.max(1, params.ownXpPerHour)
  const gainPercent = ((params.candidateAtOwnLevelXpPerHour - own) / own) * 100
  const currentRatio = params.candidateNowXpPerHour / own
  const gainComponent = clamp(gainPercent / 20, -3.5, 4)
  const currentComponent = clamp((currentRatio - 1) * 2, -2, 2)
  const returnPenalty = params.returnAfterBreakEvenHours === null
    ? (gainPercent > 0 ? 1.25 : 2.5)
    : clamp(params.returnAfterBreakEvenHours / 72, 0, 1.75)
  return Number(clamp(5 + gainComponent + currentComponent - returnPenalty, 0, 10).toFixed(1))
}

export function calculateWorthDecision(
  data: HuntSpecies[],
  own: PokemonWorthSnapshot | null | undefined,
  candidate: PokemonWorthSnapshot | null | undefined,
  context: WorthDecisionContext
): WorthDecisionResult {
  const trainerLevel = Math.max(1, Math.floor(context.trainerLevel || 1))
  const unavailable = (reason: string): WorthDecisionResult => ({
    available: false,
    reason,
    score: null,
    verdict: 'unavailable',
    verdictTitle: 'Dados insuficientes para calcular XP/h',
    ownLevel: validPokemonLevel(own),
    candidateLevel: validPokemonLevel(candidate),
    ownXpPerHour: null,
    candidateXpPerHour: null,
    candidateAtOwnLevelXpPerHour: null,
    gainPercentAtOwnLevel: null,
    breakEvenLevel: null,
    breakEvenHours: null,
    timeToOwnLevelHours: null,
    lostXpAtBreakEven: null,
    returnAfterBreakEvenHours: null,
    ownHunt: null,
    candidateHunt: null,
    candidateAtOwnLevelHunt: null,
    route: [],
    trainerLevel,
    estimatedTrainerLevel: Boolean(context.estimatedTrainerLevel)
  })

  if (!own || !candidate) return unavailable('Selecione o seu Pokémon e o candidato.')
  if (!data.length) return unavailable('Base de Hunts ainda não carregou.')
  const ownLevel = validPokemonLevel(own)
  const candidateLevel = validPokemonLevel(candidate)
  if (!ownLevel || !candidateLevel) return unavailable('Os dois Pokémon precisam ter nível conhecido.')
  if (!completeProjectedStats(own, ownLevel) || !completeProjectedStats(candidate, candidateLevel)) {
    return unavailable('Preciso dos seis stats atuais, ou de base/IV/qualidade/potência suficientes para reconstruí-los.')
  }

  const stableContext: WorthDecisionContext = { trainerLevel, estimatedTrainerLevel: context.estimatedTrainerLevel }
  const ownBest = bestFor(data, own, ownLevel, stableContext, finite(own.pokemonXp))
  const candidateBest = bestFor(data, candidate, candidateLevel, stableContext, finite(candidate.pokemonXp))
  const candidateAtOwnBest = bestFor(data, candidate, ownLevel, stableContext, xpTotalForLevel(ownLevel))
  if (!ownBest || !candidateBest || !candidateAtOwnBest) return unavailable('Não encontrei uma Hunt válida para um dos Pokémon com o nível de treinador atual.')

  const ownXp = ownBest.pokemonXpPerHour
  const candidateNow = candidateBest.pokemonXpPerHour
  const candidateAtOwn = candidateAtOwnBest.pokemonXpPerHour
  if (!(ownXp > 0) || !(candidateNow > 0) || !(candidateAtOwn > 0)) return unavailable('O motor de Hunt não retornou XP/h válido.')

  const simulation = simulateCandidateToLevel(data, candidate, ownLevel, stableContext, ownXp)
  const gainPercent = ((candidateAtOwn - ownXp) / ownXp) * 100
  const score = gridiumWorthScore({
    ownXpPerHour: ownXp,
    candidateNowXpPerHour: candidateNow,
    candidateAtOwnLevelXpPerHour: candidateAtOwn,
    returnAfterBreakEvenHours: simulation.returnAfterBreakEvenHours
  })

  let verdict: WorthDecisionResult['verdict'] = 'skip'
  let verdictTitle = 'Não vale pela XP/h'
  if (gainPercent > 0) {
    if (simulation.returnAfterBreakEvenHours !== null && simulation.returnAfterBreakEvenHours <= 48 && gainPercent >= 15) {
      verdict = 'buy'
      verdictTitle = 'Vale a compra!'
    } else {
      verdict = 'consider'
      verdictTitle = simulation.returnAfterBreakEvenHours === null ? 'Melhora no futuro, mas o retorno é longo' : 'Pode valer a compra'
    }
  }

  return {
    available: true,
    score,
    verdict,
    verdictTitle,
    ownLevel,
    candidateLevel,
    ownXpPerHour: ownXp,
    candidateXpPerHour: candidateNow,
    candidateAtOwnLevelXpPerHour: candidateAtOwn,
    gainPercentAtOwnLevel: gainPercent,
    breakEvenLevel: simulation.breakEvenLevel,
    breakEvenHours: simulation.breakEvenHours,
    timeToOwnLevelHours: candidateLevel < ownLevel ? simulation.timeToTargetHours : 0,
    lostXpAtBreakEven: simulation.lostXpAtBreakEven,
    returnAfterBreakEvenHours: simulation.returnAfterBreakEvenHours,
    ownHunt: huntSnapshot(ownBest),
    candidateHunt: huntSnapshot(candidateBest),
    candidateAtOwnLevelHunt: huntSnapshot(candidateAtOwnBest),
    route: simulation.route,
    trainerLevel,
    estimatedTrainerLevel: Boolean(context.estimatedTrainerLevel)
  }
}
