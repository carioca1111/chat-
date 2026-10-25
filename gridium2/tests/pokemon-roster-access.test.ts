import { describe, expect, it } from 'vitest'
import { pokemonWorthFromServerRow } from '../src/main/pokemon-roster-access'

describe('Vale a pena roster sanitization', () => {
  it('exposes only comparison-safe Pokemon fields', () => {
    const row = {
      id: 91, speciesId: 3, speciesName: 'Venusaur', level: 775, qualidade: 1.589, potencia: 2,
      shiny: false, token: 'SECRET', email: 'hidden@example.com',
      ivs: { hp:16, atk:25, def:30, spAtk:27, spDef:29, speed:19 },
      stats: { hp:1415, atk:1556, def:1685, spAtk:1815, spDef:1862, speed:1491 },
      refino: { hp:2, atk:1 }
    }
    const result = pokemonWorthFromServerRow('91', row, 2)
    expect(result).toMatchObject({ instanceId:'91', accountId:2, speciesId:3, speciesName:'Venusaur', level:775, quality:1.589, potency:2, ivTotal:146, shiny:false, source:'account' })
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(JSON.stringify(result)).not.toContain('hidden@example.com')
  })
})
