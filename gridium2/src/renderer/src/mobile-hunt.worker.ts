/// <reference lib="webworker" />

import type { AccountId, HuntProfileScan } from '../../shared/contracts'
import type { HuntSpecies } from './hunt-data'
import { rankHunts, type HuntProfile, type HuntRecommendation, type RouteStage } from './hunt-engine'
import { computeHuntRouteProjection } from './hunt-route-projection'
import { buildPredictiveHuntCard } from './hunt-predictive'

export interface MobileHuntWorkerRequest {
  key: string
  accountId: AccountId
  data: HuntSpecies[]
  scan: HuntProfileScan
}

export interface MobileHuntWorkerResponse {
  key: string
  accountId: AccountId
  summary?: unknown
  error?: string
}

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<MobileHuntWorkerRequest>) => {
  const { key, accountId, data, scan } = event.data
  try {
    const species = resolveSpecies(data, scan)
    if (!species) throw new Error('Espécie ativa não encontrada no catálogo Hunt.')
    const profile = buildProfile(species, scan)
    if (!profile) throw new Error('Perfil Hunt incompleto.')

    const top = rankHunts(data, profile, 'route').slice(0, 5)
    const best = top[0]
    const projection = computeHuntRouteProjection(data, profile)
    const prediction = best ? buildPredictiveHuntCard(profile, best, projection.route, projection.baseRoute, scan) : null

    const summary = {
      generatedAt: Date.now(),
      profile: {
        speciesId: species[0],
        speciesName: species[1],
        pokemonLevel: scan.pokemonLevel,
        trainerLevel: scan.trainerLevel,
        potency: scan.potency,
        shiny: scan.shiny,
        huntSlug: scan.huntSlug,
        ivAverage: scan.ivAverage,
        pokemonXpMultiplier: scan.pokemonXpMultiplier,
        trainerXpMultiplier: scan.trainerXpMultiplier
      },
      best: best ? compactHunt(best) : null,
      prediction,
      route: projection.route.slice(0, 6).map(compactStage),
      top: top.map(compactHunt)
    }
    scope.postMessage({ key, accountId, summary } satisfies MobileHuntWorkerResponse)
  } catch (error) {
    scope.postMessage({ key, accountId, error: error instanceof Error ? error.message : String(error) } satisfies MobileHuntWorkerResponse)
  }
}

function resolveSpecies(data: HuntSpecies[], scan: HuntProfileScan): HuntSpecies | undefined {
  if (scan.speciesId !== undefined) {
    const byId = data.find((row) => row[0] === scan.speciesId)
    if (byId) return byId
  }
  const serverName = scan.speciesName?.trim().toLowerCase()
  if (!serverName) return undefined
  const exact = data.find((row) => row[1].toLowerCase() === serverName)
  if (exact) return exact
  return data
    .filter((row) => serverName.endsWith(` ${row[1].toLowerCase()}`))
    .sort((a, b) => b[1].length - a[1].length)[0]
}

function buildProfile(species: HuntSpecies, scan: HuntProfileScan): HuntProfile | null {
  if (scan.trainerLevel === undefined || scan.pokemonLevel === undefined || scan.quality === undefined || scan.potency === undefined || scan.shiny === undefined) return null
  if (!scan.ivs && scan.ivAverage === undefined && scan.ivTotal === undefined) return null
  const avgIv = scan.ivAverage ?? ((scan.ivTotal ?? 96) / 6)
  const ivs = scan.ivs ?? {}
  return {
    trainerLevel: scan.trainerLevel,
    trainerXp: scan.trainerXp,
    trainerXpMultiplier: scan.trainerXpMultiplier ?? 1,
    speciesId: species[0],
    pokemonLevel: scan.pokemonLevel,
    pokemonXp: scan.pokemonXp,
    pokemonXpMultiplier: scan.pokemonXpMultiplier ?? 1,
    quality: scan.quality,
    potency: scan.potency,
    shiny: scan.shiny,
    ivAtk: ivs.atk ?? avgIv,
    ivSpAtk: ivs.spAtk ?? avgIv,
    ivDef: ivs.def ?? avgIv,
    ivSpDef: ivs.spDef ?? avgIv,
    ivHp: ivs.hp ?? avgIv,
    ivSpeed: ivs.speed ?? avgIv,
    types: species[2],
    baseStats: species[3],
    stats: scan.stats,
    refinement: scan.refinement,
    tmElemental: scan.tmElemental,
    tmAoe: scan.tmAoe
  }
}

function compactHunt(row: HuntRecommendation) {
  return {
    key: row.key,
    id: row.id,
    name: row.name,
    region: row.region,
    area: row.area,
    level: row.level,
    killsPerHour: row.killsPerHour,
    pokemonXpPerKill: row.pokemonXpPerKill,
    pokemonXpPerHour: row.pokemonXpPerHour,
    safety: row.safety,
    matchup: row.matchup,
    confidence: row.confidence
  }
}

function compactStage(stage: RouteStage) {
  return {
    fromLevel: stage.fromLevel,
    fromPokemonLevel: stage.fromPokemonLevel,
    toLevel: stage.toLevel,
    etaHours: stage.etaHours,
    hunt: compactHunt(stage.hunt)
  }
}

export {}
