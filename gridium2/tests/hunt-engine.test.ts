import { describe, expect, it } from 'vitest'
import { buildRoute, huntTypeEffectiveness, rankHunts, type HuntProfile, typeEffectiveness, xpPerKill, xpTotalForLevel } from '../src/renderer/src/hunt-engine'
import type { HuntSpecies } from '../src/renderer/src/hunt-data'

const profile: HuntProfile = {
  trainerLevel: 100,
  trainerXp: xpTotalForLevel(100),
  trainerXpMultiplier: 1,
  speciesId: 6,
  pokemonLevel: 100,
  pokemonXp: xpTotalForLevel(100),
  pokemonXpMultiplier: 1,
  quality: 1.2,
  potency: 3,
  shiny: false,
  ivAtk: 20,
  ivSpAtk: 20,
  ivDef: 20,
  ivSpDef: 20,
  ivHp: 20,
  ivSpeed: 20,
  types: ['FIRE', 'FLYING']
}

const data: HuntSpecies[] = [
  [1, 'Grass Target', ['GRASS'], [60,50,60,50,60,50], 50, 'Kanto', 'Bosque'],
  [2, 'Water Target', ['WATER'], [60,50,60,50,60,50], 50, 'Kanto', 'Lago'],
  [3, 'Locked Target', ['GRASS'], [60,50,60,50,60,50], 200, 'Johto', 'Rota 200'],
  [4, 'Higher Grass', ['GRASS'], [70,60,70,60,70,60], 100, 'Kanto', 'Topo']
]

describe('Hunt Route V2', () => {
  it('keeps base XP/kill calibrated to real server packets', () => {
    expect(xpPerKill(10)).toBe(68)
    expect(xpPerKill(50)).toBe(1508)
    expect(xpPerKill(80)).toBe(3848)
    expect(xpPerKill(100)).toBe(6008)
  })

  it('matches server xpNivel checkpoints', () => {
    expect(xpTotalForLevel(1)).toBe(0)
    expect(xpTotalForLevel(10)).toBe(9300)
    expect(xpTotalForLevel(20)).toBe(98800)
    expect(xpTotalForLevel(67)).toBe(4582600)
    expect(xpTotalForLevel(165)).toBe(72192800)
  })

  it('keeps standard chart separate from amplified Hunt effectiveness', () => {
    expect(typeEffectiveness('FIRE', ['GRASS'])).toBe(2)
    expect(huntTypeEffectiveness('FIRE', ['GRASS'])).toBe(2.5)
    expect(huntTypeEffectiveness('WATER', ['WATER'])).toBeCloseTo(1 / 3)
    expect(huntTypeEffectiveness('GRASS', ['FIRE', 'FLYING'])).toBeCloseTo(1 / 6)
    expect(huntTypeEffectiveness('ELECTRIC', ['GROUND'])).toBe(0)
  })

  it('never recommends a hunt above the trainer unlock', () => {
    const rows = rankHunts(data, profile, 'route')
    expect(rows.some((row) => row.id === 3)).toBe(false)
    expect(rows.every((row) => row.level <= 100)).toBe(true)
  })

  it('uses matchup in ranking rather than only hunt level', () => {
    const sameLevel = rankHunts(data.slice(0, 2), profile, 'xp')
    expect(sameLevel[0].name).toBe('Grass Target')
  })

  it('applies only the Pokemon XP multiplier to Pokemon XP/h', () => {
    const normal = rankHunts(data, profile, 'route')[0]
    const boosted = rankHunts(data, { ...profile, pokemonXpMultiplier: 1.65, trainerXpMultiplier: 4 }, 'route')[0]
    expect(boosted.pokemonXpPerKill / normal.pokemonXpPerKill).toBeCloseTo(1.65)
    expect(boosted.pokemonXpPerHour / normal.pokemonXpPerHour).toBeCloseTo(1.65)
    expect(boosted.trainerXpPerHour / normal.trainerXpPerHour).toBeCloseTo(4)
  })

  it('builds progression from trainer and Pokemon level changes without duplicate stages', () => {
    const route = buildRoute(data, { ...profile, trainerLevel: 50, trainerXp: xpTotalForLevel(50), pokemonLevel: 50, pokemonXp: xpTotalForLevel(50) }, 6)
    expect(route.length).toBeGreaterThan(0)
    expect(new Set(route.map((stage) => stage.hunt.id)).size).toBe(route.length)
    for (let i = 1; i < route.length; i += 1) {
      expect(route[i].etaHours).toBeGreaterThanOrEqual(route[i - 1].etaHours)
      expect(route[i].fromLevel >= route[i - 1].fromLevel || route[i].fromPokemonLevel > route[i - 1].fromPokemonLevel).toBe(true)
    }
  })
})
