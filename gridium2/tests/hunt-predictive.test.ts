import { describe, expect, it } from 'vitest'
import type { HuntProfileScan } from '../src/shared/contracts'
import type { HuntProfile, HuntRecommendation, RouteStage } from '../src/renderer/src/hunt-engine'
import { buildPredictiveHuntCard, formatEtaCompact, predictiveConfidence } from '../src/renderer/src/hunt-predictive'

const profile: HuntProfile = {
  trainerLevel: 450,
  trainerXp: 1_000_000,
  trainerXpMultiplier: 1.5,
  speciesId: 6,
  pokemonLevel: 284,
  pokemonXp: 500_000,
  pokemonXpMultiplier: 1.5,
  quality: 1.2,
  potency: 4,
  shiny: false,
  ivAtk: 28,
  ivSpAtk: 30,
  ivDef: 27,
  ivSpDef: 29,
  ivHp: 31,
  ivSpeed: 26,
  types: ['FIRE', 'FLYING'],
  baseStats: [78,84,78,109,85,100]
}

const current: HuntRecommendation = {
  key: 'Outland|Larvitar|246|420', id: 246, name: 'Larvitar', types: ['ROCK','GROUND'], region: 'Outland', area: 'Larvitar', level: 420,
  killsPerHour: 300, xpPerKill: 1, pokemonXpPerKill: 1, trainerXpPerHour: 1, pokemonXpPerHour: 52_400_000,
  safety: 90, matchup: 2.5, score: 50_000_000, confidence: 'ESTIMADO'
}

const nextHunt: HuntRecommendation = {
  key: 'Hoenn|Bagon|371|500', id: 371, name: 'Bagon', types: ['DRAGON'], region: 'Hoenn', area: 'Bagon', level: 500,
  killsPerHour: 320, xpPerKill: 1, pokemonXpPerKill: 1, trainerXpPerHour: 1, pokemonXpPerHour: 67_100_000,
  safety: 88, matchup: 1, score: 65_000_000, confidence: 'ESTIMADO'
}

const route: RouteStage[] = [
  { fromLevel: 450, fromPokemonLevel: 284, toLevel: 499, etaHours: 0, hunt: current },
  { fromLevel: 500, fromPokemonLevel: 318, toLevel: null, etaHours: 2.2333, hunt: nextHunt }
]

const baseRoute: RouteStage[] = [
  { fromLevel: 450, fromPokemonLevel: 284, toLevel: 499, etaHours: 0, hunt: current },
  { fromLevel: 500, fromPokemonLevel: 318, toLevel: null, etaHours: 2.85, hunt: nextHunt }
]

const scan: HuntProfileScan = {
  trainerLevel: 450,
  trainerXpMultiplier: 1.5,
  activePokemonId: '1',
  speciesId: 6,
  pokemonLevel: 284,
  pokemonXpMultiplier: 1.5,
  quality: 1.2,
  potency: 4,
  ivs: { hp: 31, atk: 28, def: 27, spAtk: 30, spDef: 29, speed: 26 },
  stats: { hp: 1000, atk: 900, def: 850, spAtk: 1100, spDef: 900, speed: 920 },
  refinement: { spAtk: 15 },
  shiny: false,
  tmElemental: 'FIRE',
  source: 'server',
  detectedAt: Date.now()
}

describe('predictive Hunt card', () => {
  it('builds compact next-Hunt metrics including locked future Hunts', () => {
    const result = buildPredictiveHuntCard(profile, current, route, baseRoute, scan)
    expect(result).not.toBeNull()
    expect(result?.pokemonLevel).toBe(318)
    expect(result?.trainerLevel).toBe(500)
    expect(result?.lockedNow).toBe(true)
    expect(result?.etaCurrentHours).toBeCloseTo(2.2333)
    expect(result?.etaBaseHours).toBeCloseTo(2.85)
    expect(result?.projectedXpPerHour).toBe(67_100_000)
    expect(result?.gainPercent).toBeCloseTo(28.05, 1)
  })

  it('returns no predictive card while the route has no future switch', () => {
    expect(buildPredictiveHuntCard(profile, current, route.slice(0, 1), [], scan)).toBeNull()
  })

  it('keeps confidence bounded and penalizes longer horizons', () => {
    const near = predictiveConfidence(scan, route[1])
    const far = predictiveConfidence(scan, { ...route[1], etaHours: 240 })
    expect(near).toBeGreaterThanOrEqual(40)
    expect(near).toBeLessThanOrEqual(95)
    expect(far).toBeLessThan(near)
  })

  it('formats ETA for compact chips', () => {
    expect(formatEtaCompact(0.5)).toBe('30m')
    expect(formatEtaCompact(2.25)).toBe('2h15')
    expect(formatEtaCompact(50)).toBe('2d2h')
    expect(formatEtaCompact(null)).toBe('—')
  })
})
