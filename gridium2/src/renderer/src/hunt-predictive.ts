import type { HuntProfileScan } from '../../shared/contracts'
import type { HuntProfile, HuntRecommendation, RouteStage } from './hunt-engine'

export interface PredictiveHuntCard {
  targetKey: string
  targetArea: string
  targetName: string
  targetRegion: string
  trainerLevel: number
  pokemonLevel: number
  etaCurrentHours: number
  etaBaseHours: number | null
  projectedXpPerHour: number
  gainPercent: number
  confidencePercent: number
  lockedNow: boolean
}

export function buildPredictiveHuntCard(
  profile: HuntProfile,
  currentBest: HuntRecommendation,
  route: RouteStage[],
  baseRoute: RouteStage[],
  scan?: HuntProfileScan | null
): PredictiveHuntCard | null {
  const next = route[1]
  if (!next) return null

  const baseMatch = baseRoute.find((stage) => stage.hunt.key === next.hunt.key)
  const gainPercent = currentBest.pokemonXpPerHour > 0
    ? ((next.hunt.pokemonXpPerHour / currentBest.pokemonXpPerHour) - 1) * 100
    : 0

  return {
    targetKey: next.hunt.key,
    targetArea: next.hunt.area,
    targetName: next.hunt.name,
    targetRegion: next.hunt.region,
    trainerLevel: next.fromLevel,
    pokemonLevel: next.fromPokemonLevel,
    etaCurrentHours: next.etaHours,
    etaBaseHours: baseMatch?.etaHours ?? null,
    projectedXpPerHour: next.hunt.pokemonXpPerHour,
    gainPercent,
    confidencePercent: predictiveConfidence(scan, next),
    lockedNow: next.fromLevel > profile.trainerLevel || next.hunt.level > profile.trainerLevel
  }
}

export function predictiveConfidence(scan: HuntProfileScan | null | undefined, next: RouteStage): number {
  if (!scan) return 45
  let score = 46
  const stats = scan.stats
  const statValues = stats ? [stats.hp, stats.atk, stats.def, stats.spAtk, stats.spDef, stats.speed] : []
  const completeStats = statValues.length === 6 && statValues.every((value) => Number.isFinite(value))
  const partialStats = statValues.some((value) => Number.isFinite(value))
  if (completeStats) score += 18
  else if (partialStats) score += 8

  const ivs = scan.ivs
  const ivValues = ivs ? [ivs.hp, ivs.atk, ivs.def, ivs.spAtk, ivs.spDef, ivs.speed] : []
  const completeIvs = ivValues.length === 6 && ivValues.every((value) => Number.isFinite(value))
  if (completeIvs) score += 10
  else if (Number.isFinite(scan.ivAverage) || Number.isFinite(scan.ivTotal)) score += 5

  if (scan.refinement && Object.values(scan.refinement).some((value) => Number.isFinite(value))) score += 4
  if (scan.tmElemental !== undefined) score += 4
  if (Number.isFinite(scan.trainerXpMultiplier) && Number.isFinite(scan.pokemonXpMultiplier)) score += 8
  if (next.hunt.confidence === 'CALIBRADO') score += 12

  // Previsões muito distantes carregam mais incerteza mesmo quando a conta tem dados completos.
  const horizonPenalty = Math.min(15, Math.max(0, next.etaHours - 6) / 24 * 2)
  return Math.max(40, Math.min(95, Math.round(score - horizonPenalty)))
}

export function formatEtaCompact(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—'
  if (hours <= 0) return '<1m'
  const totalMinutes = Math.max(1, Math.round(hours * 60))
  if (totalMinutes < 60) return `${totalMinutes}m`
  const totalHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (totalHours < 48) return minutes ? `${totalHours}h${String(minutes).padStart(2, '0')}` : `${totalHours}h`
  const days = Math.floor(totalHours / 24)
  const hoursLeft = totalHours % 24
  return hoursLeft ? `${days}d${hoursLeft}h` : `${days}d`
}
