import { describe, expect, it } from 'vitest'
import { buildRoute, rankHunts, type HuntProfile, typeEffectiveness, xpPerKill } from '../src/renderer/src/hunt-engine'
import type { HuntSpecies } from '../src/renderer/src/hunt-data'

const profile: HuntProfile = {
  trainerLevel: 100,
  speciesId: 6,
  pokemonLevel: 100,
  quality: 1.2,
  potency: 3,
  shiny: false,
  ivAtk: 20,
  ivSpAtk: 20,
  ivDef: 20,
  ivSpDef: 20,
  ivHp: 20,
  types: ['FIRE', 'FLYING']
}

const data: HuntSpecies[] = [
  [1, 'Grass Target', ['GRASS'], [60,50,60,50,60,50], 50, 'Kanto', 'Bosque'],
  [2, 'Water Target', ['WATER'], [60,50,60,50,60,50], 50, 'Kanto', 'Lago'],
  [3, 'Locked Target', ['GRASS'], [60,50,60,50,60,50], 200, 'Johto', 'Rota 200'],
  [4, 'Higher Grass', ['GRASS'], [70,60,70,60,70,60], 100, 'Kanto', 'Topo']
]

describe('Hunt Intelligence model', () => {
  it('keeps the current XP/kill calibration points stable', () => {
    expect(xpPerKill(50)).toBe(1508)
    expect(xpPerKill(80)).toBe(3848)
    expect(xpPerKill(100)).toBe(6008)
  })

  it('applies dual type effectiveness', () => {
    expect(typeEffectiveness('FIRE', ['GRASS'])).toBe(2)
    expect(typeEffectiveness('ELECTRIC', ['GROUND'])).toBe(0)
    expect(typeEffectiveness('FIRE', ['GRASS', 'STEEL'])).toBe(4)
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

  it('builds a progression route only when the best target changes', () => {
    const route = buildRoute(data, { ...profile, trainerLevel: 50 }, 6)
    expect(route.length).toBeGreaterThan(0)
    expect(new Set(route.map((stage) => stage.hunt.id)).size).toBe(route.length)
    for (let i = 1; i < route.length; i += 1) expect(route[i].fromLevel).toBeGreaterThan(route[i - 1].fromLevel)
  })
})
