import type { HuntSpecies } from './hunt-data'
import { buildRoute, type HuntProfile, type RouteStage } from './hunt-engine'

export interface HuntRouteProjection {
  route: RouteStage[]
  baseRoute: RouteStage[]
}

/**
 * Heavy predictive work used by the Hunt worker.
 * Keep this pure so the worker and tests share exactly the same calculation.
 */
export function computeHuntRouteProjection(data: HuntSpecies[], profile: HuntProfile): HuntRouteProjection {
  const route = buildRoute(data, profile, 6)
  if (!route[1]) return { route, baseRoute: [] }

  const trainerBonus = Math.abs((profile.trainerXpMultiplier ?? 1) - 1) > 0.0001
  const pokemonBonus = Math.abs((profile.pokemonXpMultiplier ?? 1) - 1) > 0.0001
  if (!trainerBonus && !pokemonBonus) return { route, baseRoute: route }

  const baseRoute = buildRoute(
    data,
    { ...profile, trainerXpMultiplier: 1, pokemonXpMultiplier: 1 },
    12
  )
  return { route, baseRoute }
}
