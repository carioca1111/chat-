import { describe, expect, it } from 'vitest'
import type { PokemonWorthSnapshot } from '../src/shared/contracts'
import type { HuntSpecies } from '../src/renderer/src/hunt-data'
import { calculateWorthDecision, gridiumWorthScore } from '../src/renderer/src/worth-it-decision'

const data: HuntSpecies[] = [
  [1, 'Testmon', ['NORMAL'], [50, 50, 50, 50, 50, 50], 10, 'Kanto', 'Campo Teste'],
  [2, 'Tankmon', ['ROCK'], [80, 80, 80, 80, 80, 60], 25, 'Kanto', 'Pedreira']
]

const own: PokemonWorthSnapshot = {
  instanceId: 'own', speciesId: 1, speciesName: 'Testmon', level: 100,
  quality: 1, potency: 1, ivTotal: 96,
  ivs: { hp:16, atk:16, def:16, spAtk:16, spDef:16, speed:16 },
  stats: { hp:1000, atk:1000, def:1000, spAtk:1000, spDef:1000, speed:1000 },
  shiny: false, types: ['NORMAL'], source: 'account'
}

const candidate: PokemonWorthSnapshot = {
  instanceId: 'candidate', speciesId: 1, speciesName: 'Testmon', level: 50,
  quality: 1, potency: 1, ivTotal: 96,
  ivs: { hp:16, atk:16, def:16, spAtk:16, spDef:16, speed:16 },
  stats: { hp:650, atk:650, def:650, spAtk:650, spDef:650, speed:650 },
  shiny: false, types: ['NORMAL'], source: 'external'
}

describe('Vale a Pena XP decision model', () => {
  it('simulates current XP/h, same-level XP/h and a route without bonuses', () => {
    const result = calculateWorthDecision(data, own, candidate, { trainerLevel: 1000 })
    expect(result.available).toBe(true)
    expect(result.ownXpPerHour).toBeGreaterThan(0)
    expect(result.candidateXpPerHour).toBeGreaterThan(0)
    expect(result.candidateAtOwnLevelXpPerHour).toBeGreaterThan(0)
    expect(result.timeToOwnLevelHours).toBeGreaterThan(0)
    expect(result.route.length).toBeGreaterThan(0)
    expect(result.route[0].fromLevel).toBe(50)
    expect(result.route.at(-1)?.toLevel).toBe(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(10)
  })

  it('keeps the Gridium score bounded and rewards a strong same-level gain', () => {
    const strong = gridiumWorthScore({ ownXpPerHour: 42_300_000, candidateNowXpPerHour: 32_000_000, candidateAtOwnLevelXpPerHour: 61_100_000, returnAfterBreakEvenHours: 10.5 })
    const weak = gridiumWorthScore({ ownXpPerHour: 42_300_000, candidateNowXpPerHour: 20_000_000, candidateAtOwnLevelXpPerHour: 35_000_000, returnAfterBreakEvenHours: null })
    expect(strong).toBeGreaterThan(weak)
    expect(strong).toBeGreaterThan(5)
    expect(weak).toBeGreaterThanOrEqual(0)
    expect(strong).toBeLessThanOrEqual(10)
  })
})
