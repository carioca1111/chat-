import { describe, expect, it } from 'vitest'
import {
  buildRoute,
  effectiveMoveCooldown,
  huntKey,
  huntTypeEffectiveness,
  rankHunts,
  shouldSwitchHunt,
  type HuntProfile,
  typeEffectiveness,
  xpPerKill,
  xpTotalForLevel
} from '../src/renderer/src/hunt-engine'
import { loadHuntSpecies, type HuntSpecies } from '../src/renderer/src/hunt-data'

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

describe('Hunt Route V2.1', () => {
  it('uses the current empirically measured XP/kill curve level² + 12', () => {
    expect(xpPerKill(10)).toBe(112)
    expect(xpPerKill(50)).toBe(2512)
    expect(xpPerKill(80)).toBe(6412)
    expect(xpPerKill(100)).toBe(10012)
    expect(xpPerKill(320)).toBe(102412)
  })

  it('keeps accumulated xpNivel progression separate from kill reward', () => {
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

  it('applies Speed IV to move cooldown', () => {
    expect(effectiveMoveCooldown(60, 1)).toBeCloseTo(59.99)
    expect(effectiveMoveCooldown(60, 32)).toBeCloseTo(59.68)
    expect(effectiveMoveCooldown(10, 32)).toBeLessThan(effectiveMoveCooldown(10, 1))
  })

  it('never recommends a hunt above the trainer unlock', () => {
    const rows = rankHunts(data, profile, 'route')
    expect(rows.some((row) => row.id === 3)).toBe(false)
    expect(rows.every((row) => row.level <= 100)).toBe(true)
  })

  it('uses matchup and real supplied move metadata instead of only hunt level', () => {
    const fireMove = { ...profile, moves: [{ type:'FIRE', power:120, cooldownSeconds:5, category:'special' as const }] }
    const sameLevel = rankHunts(data.slice(0, 2), fireMove, 'xp')
    expect(sameLevel[0].name).toBe('Grass Target')
  })

  it('uses elemental TM metadata when the server exposes a named type', () => {
    const withoutTm = rankHunts(data.slice(0, 1), { ...profile, tmElemental:null }, 'xp')[0]
    const withTm = rankHunts(data.slice(0, 1), { ...profile, tmElemental:'FIRE' }, 'xp')[0]
    expect(withTm.killsPerHour).toBeGreaterThanOrEqual(withoutTm.killsPerHour)
  })

  it('applies only the Pokemon XP multiplier to Pokemon XP/h', () => {
    const normal = rankHunts(data, profile, 'route')[0]
    const boosted = rankHunts(data, { ...profile, pokemonXpMultiplier: 1.65, trainerXpMultiplier: 4 }, 'route')[0]
    expect(boosted.pokemonXpPerKill / normal.pokemonXpPerKill).toBeCloseTo(1.65)
    expect(boosted.pokemonXpPerHour / normal.pokemonXpPerHour).toBeCloseTo(1.65)
    expect(boosted.trainerXpPerHour / normal.trainerXpPerHour).toBeCloseTo(4)
  })

  it('keeps potency/shiny in the fallback stat model when live stats are unavailable', () => {
    const plain = rankHunts(data.slice(0, 1), { ...profile, potency:1, shiny:false, stats:undefined }, 'xp')[0]
    const powered = rankHunts(data.slice(0, 1), { ...profile, potency:5, shiny:true, stats:undefined }, 'xp')[0]
    expect(powered.killsPerHour).toBeGreaterThanOrEqual(plain.killsPerHour)
    expect(powered.safety).toBeGreaterThanOrEqual(plain.safety)
  })

  it('uses individual defensive stats in safety', () => {
    const weak = rankHunts(data.slice(0,1), { ...profile, stats:{hp:100,atk:100,def:80,spAtk:100,spDef:80,speed:100} }, 'route')[0]
    const tank = rankHunts(data.slice(0,1), { ...profile, stats:{hp:200,atk:100,def:300,spAtk:100,spDef:300,speed:100} }, 'route')[0]
    expect(tank.safety).toBeGreaterThanOrEqual(weak.safety)
  })

  it('accepts incomplete optional combat data without producing NaN', () => {
    const row = rankHunts(data.slice(0,1), { ...profile, stats:undefined, refinement:undefined, moves:undefined, tmElemental:undefined }, 'route')[0]
    expect(Number.isFinite(row.pokemonXpPerHour)).toBe(true)
    expect(Number.isFinite(row.safety)).toBe(true)
    expect(row.confidence).toBe('ESTIMADO')
  })

  it('calibrates kills/h and Pokemon XP/h from wall-clock samples', () => {
    const key = huntKey(data[0])
    const calibrated = rankHunts(data.slice(0,1), {
      ...profile,
      calibration:[{ huntKey:key, sampleSeconds:600, kills:20, pokemonXpGained:100_000, trainerXpGained:80_000, deaths:1, heals:2, idleSeconds:40 }]
    }, 'route')[0]
    expect(calibrated.confidence).toBe('CALIBRADO')
    expect(calibrated.killsPerHour).toBeCloseTo(120)
    expect(calibrated.pokemonXpPerKill).toBeCloseTo(5000)
    expect(calibrated.pokemonXpPerHour).toBeCloseTo(600_000)
    expect(calibrated.trainerXpPerHour).toBeCloseTo(480_000)
  })

  it('does not mark short/noisy samples as calibrated', () => {
    const key = huntKey(data[0])
    const row = rankHunts(data.slice(0,1), { ...profile, calibration:[{huntKey:key,sampleSeconds:30,kills:3,pokemonXpGained:1000}] }, 'route')[0]
    expect(row.confidence).toBe('ESTIMADO')
  })

  it('does not switch hunt for an insignificant projected gain', () => {
    const current = rankHunts(data.slice(0,1), profile, 'route')[0]
    const tinyGain = { ...current, key:'other', score:current.score*1.02 }
    const realGain = { ...current, key:'other-2', score:current.score*1.05 }
    expect(shouldSwitchHunt(current,tinyGain)).toBe(false)
    expect(shouldSwitchHunt(current,realGain)).toBe(true)
  })

  it('memoizes identical rankings for the same data/profile inputs', () => {
    const first = rankHunts(data, profile, 'route')
    const second = rankHunts(data, profile, 'route')
    expect(second).toBe(first)
  })

  it('builds progression from trainer and Pokemon level changes without duplicate hunt keys', () => {
    const route = buildRoute(data, { ...profile, trainerLevel:50, trainerXp:xpTotalForLevel(50), pokemonLevel:50, pokemonXp:xpTotalForLevel(50) }, 6)
    expect(route.length).toBeGreaterThan(0)
    expect(new Set(route.map((stage) => stage.hunt.key)).size).toBe(route.length)
    for (let i=1;i<route.length;i+=1) {
      expect(route[i].etaHours).toBeGreaterThanOrEqual(route[i-1].etaHours)
      expect(route[i].fromLevel >= route[i-1].fromLevel || route[i].fromPokemonLevel > route[i-1].fromPokemonLevel).toBe(true)
    }
  })

  it('computes the real Blastoise 321/318 profile against the full catalog without forcing Shuckle', async () => {
    const catalog = await loadHuntSpecies()
    const blastoise: HuntProfile = {
      trainerLevel:321,
      speciesId:9,
      pokemonLevel:318,
      quality:1.437,
      potency:2,
      shiny:false,
      ivHp:27,
      ivAtk:31,
      ivDef:26,
      ivSpAtk:29,
      ivSpDef:17,
      ivSpeed:23,
      types:['WATER'],
      pokemonXpMultiplier:1.65,
      trainerXpMultiplier:3.25,
      refinement:{hp:1,atk:2,def:3,spAtk:4,spDef:5},
      tmElemental:'WATER'
    }
    const rows = rankHunts(catalog, blastoise, 'route')
    const best = rows[0]
    const shuckle = rows.find((row) => row.name === 'Shuckle')
    expect(best).toBeDefined()
    expect(shuckle).toBeDefined()
    expect(best.score).toBeGreaterThanOrEqual(shuckle!.score)
    expect(best.name.length).toBeGreaterThan(0)
  })
})
