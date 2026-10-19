import { describe, expect, it } from 'vitest'
import { PokeIdleServerState } from '../src/main/pokeidle-server-state'

describe('Hunt Route V2 server inputs', () => {
  it('extracts precise combat stats, six IVs and Pokemon XP multiplier from the active record', () => {
    const state = new PokeIdleServerState()
    const result = state.ingest({
      t: 'welcome',
      estado: {
        id: 28379,
        nick: 'Conta teste',
        level: 321,
        xp: 123456,
        xpNivel: 120000,
        xpProximo: 140000,
        huntSlug: 'shuckle',
        bonusXp: { tr: 3.25, pk: 1.65 },
        activeId: 14495388,
        pokemons: [{
          id: 14495388,
          speciesId: 9,
          speciesName: 'Blastoise',
          level: 318,
          xp: 900000,
          xpNivel: 880000,
          xpProximo: 940000,
          quality: 1.437,
          potencia: 2,
          shiny: false,
          maxHp: 3552,
          ivTotal: 153,
          ivs: { hp: 27, atk: 31, def: 26, spAtk: 29, spDef: 17, speed: 23 },
          stats: { hp: 296, atk: 305, def: 320, spAtk: 301, spDef: 293, speed: 276 },
          refino: { hp: 1, atk: 2, def: 3, spAtk: 4, spDef: 5 },
          tmElemental: 'WATER',
          tmAoe: true
        }]
      }
    }, 1000)

    expect(result.profile).toMatchObject({
      trainerLevel: 321,
      trainerXp: 123456,
      trainerXpLevelStart: 120000,
      trainerXpNext: 140000,
      trainerXpMultiplier: 3.25,
      activePokemonId: '14495388',
      speciesId: 9,
      pokemonLevel: 318,
      pokemonXp: 900000,
      pokemonXpLevelStart: 880000,
      pokemonXpNext: 940000,
      pokemonXpMultiplier: 1.65,
      quality: 1.437,
      potency: 2,
      ivTotal: 153,
      ivAverage: 25.5,
      ivs: { hp: 27, atk: 31, def: 26, spAtk: 29, spDef: 17, speed: 23 },
      stats: { hp: 296, atk: 305, def: 320, spAtk: 301, spDef: 293, speed: 276 },
      refinement: { hp: 1, atk: 2, def: 3, spAtk: 4, spDef: 5 },
      maxHp: 3552,
      huntSlug: 'shuckle',
      tmElemental: 'WATER',
      tmAoe: true
    })
  })

  it('does not confuse trainer and Pokemon XP multipliers', () => {
    const state = new PokeIdleServerState()
    const result = state.ingest({
      t: 'welcome',
      estado: {
        level: 100,
        bonusXp: { tr: 9.5, pk: 1.25 },
        activeId: 7,
        pokemons: [{ id: 7, speciesId: 25, level: 100, quality: 1.2, potencia: 2, shiny: false, ivTotal: 120 }]
      }
    })
    expect(result.profile?.trainerXpMultiplier).toBe(9.5)
    expect(result.profile?.pokemonXpMultiplier).toBe(1.25)
  })
})
