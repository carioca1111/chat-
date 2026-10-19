import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PokeIdleServerState } from '../src/main/pokeidle-server-state'

describe('PokeIdle authoritative Hunt server state', () => {
  it('selects only the exact Pokemon referenced by server activeId', () => {
    const state = new PokeIdleServerState()
    const result = state.ingest({
      t: 'welcome',
      estado: {
        id: 'account-a', nick: 'Conta A', level: 500, cheio: true, activeId: 17,
        pokemons: [
          { id: 99, speciesId: 6, speciesName: 'Charizard', level: 999, potencia: 5, qualidade: 2, ivTotal: 192, shiny: true },
          { id: 17, speciesId: 94, speciesName: 'Gengar', level: 212, potencia: 4, qualidade: 1.72, ivTotal: 171, shiny: false }
        ]
      }
    }, 123)

    expect(result.accepted).toBe(true)
    expect(result.profile).toMatchObject({
      activePokemonId: '17',
      speciesId: 94,
      speciesName: 'Gengar',
      trainerLevel: 500,
      pokemonLevel: 212,
      potency: 4,
      quality: 1.72,
      ivTotal: 171,
      ivAverage: 28.5,
      shiny: false,
      source: 'server',
      detectedAt: 123
    })
  })

  it('reads real stats, individual IVs, progression XP and Pokemon XP multiplier', () => {
    const state = new PokeIdleServerState()
    const result = state.ingest({
      t:'welcome',
      estado:{
        id:28379, nick:'Carioca', level:321, xp:5000000, xpNivel:4900000, xpProximo:5100000,
        bonusXp:{ tr:1.35, pk:1.65 }, huntSlug:'shuckle', activeId:14495388,
        pokemons:[{
          id:14495388, speciesId:9, level:318, xp:4300000, xpNivel:4200000, xpProximo:4400000,
          qualidade:1.437, potencia:2, shiny:false, maxHp:7600,
          stats:{ hp:633, atk:651, def:683, spAtk:641, spDef:625, speed:589 },
          ivs:{ hp:27, atk:31, def:26, spAtk:29, spDef:17, speed:23 },
          refino:{ hp:2, atk:1, def:0, spAtk:3, spDef:0 }, tmElemental:'WATER', tmAoe:true
        }]
      }
    }, 500)

    expect(result.profile).toMatchObject({
      trainerLevel:321, trainerXp:5000000, trainerXpLevelStart:4900000, trainerXpNext:5100000, trainerXpMultiplier:1.35,
      activePokemonId:'14495388', speciesId:9, pokemonLevel:318, pokemonXp:4300000, pokemonXpLevelStart:4200000, pokemonXpNext:4400000,
      pokemonXpMultiplier:1.65, huntSlug:'shuckle', maxHp:7600, tmElemental:'WATER', tmAoe:true,
      stats:{ hp:633, atk:651, def:683, spAtk:641, spDef:625, speed:589 },
      ivs:{ hp:27, atk:31, def:26, spAtk:29, spDef:17, speed:23 },
      refinement:{ hp:2, atk:1, def:0, spAtk:3, spDef:0 }
    })
  })

  it('merges pkMud only by Pokemon instance id', () => {
    const state = new PokeIdleServerState()
    state.ingest({ t:'welcome', estado:{ id:'a', level:20, activeId:7, pokemons:[{ id:7, speciesId:25, level:10, potencia:2, qualidade:1.1, ivTotal:120, shiny:false }] } })
    const result = state.ingest({ t:'estado', estado:{ pkMud:[{ id:7, level:11, qualidade:1.2 }] } }, 200)
    expect(result.profile).toMatchObject({ activePokemonId:'7', speciesId:25, pokemonLevel:11, quality:1.2, potency:2 })
  })

  it('returns no profile after activeId switches until that exact record arrives', () => {
    const state = new PokeIdleServerState()
    state.ingest({ t:'welcome', estado:{ id:'a', activeId:1, pokemons:[{ id:1, speciesId:1, level:10, potencia:1, qualidade:1, ivTotal:96, shiny:false }] } })
    const switched = state.ingest({ t:'estado', estado:{ activeId:2 } })
    expect(switched.profile).toBeNull()

    const arrived = state.ingest({ t:'estado', estado:{ pkMud:[{ id:2, speciesId:4, level:12, potencia:2, qualidade:1.15, ivTotal:108, shiny:false }] } })
    expect(arrived.profile).toMatchObject({ activePokemonId:'2', speciesId:4, pokemonLevel:12 })
  })

  it('ignores battle, market and chat packets even when they contain Pokemon names', () => {
    const state = new PokeIdleServerState()
    state.ingest({ t:'welcome', estado:{ activeId:5, pokemons:[{ id:5, speciesId:7, level:30, potencia:2, qualidade:1.3, ivTotal:132, shiny:false }] } })
    const before = state.profile()
    expect(state.ingest({ t:'batalha', pokemon:{ name:'Mewtwo', level:9999 } }).accepted).toBe(false)
    expect(state.ingest({ t:'market', linhas:[{ speciesName:'Rayquaza' }] }).accepted).toBe(false)
    expect(state.ingest({ t:'chat', texto:'Charizard Gengar Mew' }).accepted).toBe(false)
    expect(state.profile()).toEqual(before)
  })

  it('does not treat generic name as species because it may be a nickname', () => {
    const state = new PokeIdleServerState()
    state.ingest({ t:'welcome', estado:{ activeId:4, pokemons:[{ id:4, speciesId:94, name:'Meu Fantasma', nickname:'Mewtwo', level:40, potencia:3, qualidade:1.4, ivTotal:150, shiny:true }] } })
    expect(state.profile()).toMatchObject({ speciesId:94, speciesName:undefined, activePokemonId:'4' })
  })

  it('isolates server state between account trackers', () => {
    const one = new PokeIdleServerState()
    const two = new PokeIdleServerState()
    one.ingest({ t:'welcome', estado:{ id:'one', activeId:1, pokemons:[{ id:1, speciesId:6, level:100 }] } })
    two.ingest({ t:'welcome', estado:{ id:'two', activeId:8, pokemons:[{ id:8, speciesId:3, level:200 }] } })
    expect(one.profile()?.speciesId).toBe(6)
    expect(two.profile()?.speciesId).toBe(3)
    expect(one.profile()?.serverAccountId).toBe('one')
    expect(two.profile()?.serverAccountId).toBe('two')
  })

  it('never exposes unrelated credentials from raw server packets', () => {
    const state = new PokeIdleServerState()
    state.ingest({
      t:'welcome', token:'SECRET', email:'user@example.com',
      estado:{ id:'a', activeId:1, authToken:'STATE_SECRET', pokemons:[{ id:1, speciesId:25, level:10, token:'PK_SECRET' }] }
    })
    const serialized = JSON.stringify(state.profile())
    expect(serialized).not.toContain('SECRET')
    expect(serialized).not.toContain('user@example.com')
    expect(serialized).not.toContain('token')
  })

  it('keeps Hunt DOM scraping removed and activeId selection inside the server reducer', () => {
    const runtime = readFileSync(join(process.cwd(), 'src/main/account-runtime.ts'), 'utf8')
    const reducer = readFileSync(join(process.cwd(), 'src/main/pokeidle-server-state.ts'), 'utf8')
    const huntStart = runtime.indexOf('async scanHuntProfile')
    const huntEnd = runtime.indexOf('async command', huntStart)
    const huntPath = runtime.slice(huntStart, huntEnd)

    expect(huntStart).toBeGreaterThanOrEqual(0)
    expect(huntEnd).toBeGreaterThan(huntStart)
    expect(huntPath).not.toContain('executeJavaScript')
    expect(huntPath).not.toContain('document')
    expect(runtime).not.toContain('document.body')
    expect(runtime).not.toContain('HUNT_PROFILE_SCAN_SCRIPT')
    expect(runtime).toContain('Network.webSocketFrameReceived')
    expect(reducer).toContain('activeId')
    expect(reducer).toContain('this.pokemons.get(this.activeId)')
  })
})
