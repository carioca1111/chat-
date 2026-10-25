import { describe, expect, it } from 'vitest'
import { calculatePokeIdleStat, comparePokemonWorth, parsePokemonFicha, projectPokemon } from '../src/shared/worth-it'
import type { PokemonWorthSnapshot } from '../src/shared/contracts'

const VENUSAUR = `# Venusaur — ficha do PokeIdle

## O pokemon
- Espécie: Venusaur (#3) — GRASS / POISON
- Shiny: não
- Nível: 775
- Potência: P2 (+5% em todos os stats)
- Qualidade: 1.589 (melhor que 98% dos nascimentos)
- IV somado: 146 de 192
- Nota da Calculadora: 3.55 de 10 (Razoável)
- Poder (⚔): 2,886
- HP de combate: 16,980 (o HP do stat × 12)

| Stat | Base da espécie | IV (1–32) | Stat atual (nível 775) |
|---|---|---|---|
| HP | 80 | 16 | 1,415 |
| ATK | 82 | 25 | 1,556 |
| DEF | 83 | 30 | 1,685 |
| SP.ATK | 100 | 27 | 1,815 |
| SP.DEF | 100 | 29 | 1,862 |
| SPD | 80 | 19 | 1,491 |
| Total | 525 | 146 | 9,824 |`

describe('Vale a pena parser and comparison', () => {
  it('parses the pasted PokeIdle ficha format', () => {
    const pokemon = parsePokemonFicha(VENUSAUR)
    expect(pokemon).toMatchObject({ speciesName:'Venusaur', speciesId:3, level:775, potency:2, quality:1.589, ivTotal:146, shiny:false, types:['GRASS','POISON'], calculatorScore:3.55, power:2886, combatHp:16980 })
    expect(pokemon?.baseStats).toMatchObject({ hp:80, atk:82, def:83, spAtk:100, spDef:100, speed:80 })
    expect(pokemon?.ivs).toMatchObject({ hp:16, atk:25, def:30, spAtk:27, spDef:29, speed:19 })
    expect(pokemon?.stats).toMatchObject({ hp:1415, atk:1556, def:1685, spAtk:1815, spDef:1862, speed:1491 })
  })

  it('projects current stats linearly to the same level', () => {
    const pokemon = parsePokemonFicha(VENUSAUR)!
    const projected = projectPokemon(pokemon, 1000)
    expect(projected.method).toBe('scaled-current')
    expect(projected.stats.hp).toBeCloseTo(1415 * 1000 / 775, 5)
    expect(projected.total).toBeGreaterThan(9824)
  })

  it('implements the supplied PokeIdle stat formula', () => {
    const value = calculatePokeIdleStat({ stat:'atk', base:82, iv:25, level:775, quality:1.589, potency:2, shiny:false, legendary:false })
    expect(value).toBeGreaterThan(0)
    const shiny = calculatePokeIdleStat({ stat:'atk', base:82, iv:25, level:775, quality:1.589, potency:2, shiny:true, legendary:false })
    expect(shiny).toBeCloseTo(value * 3, 8)
  })

  it('returns a transparent same-level verdict', () => {
    const left = parsePokemonFicha(VENUSAUR)!
    const right: PokemonWorthSnapshot = { ...left, instanceId:'b', speciesName:'Stronger', stats:{ ...left.stats, atk:2000, spAtk:2200 } }
    const result = comparePokemonWorth(left, right, 1000)
    expect(result.verdict).toBe('right')
    expect(result.differencePercent).toBeGreaterThan(0)
    expect(result.rightWins).toBeGreaterThan(0)
  })
})
