import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HuntSpecies } from '../src/renderer/src/hunt-data'
import type { HuntProfile } from '../src/renderer/src/hunt-engine'
import { computeHuntRouteProjection } from '../src/renderer/src/hunt-route-projection'

describe('Hunt renderer performance', () => {
  it('moves future route simulation to a Web Worker instead of blocking HuntView', () => {
    const view = readFileSync(join(process.cwd(), 'src/renderer/src/HuntView.tsx'), 'utf8')
    const worker = readFileSync(join(process.cwd(), 'src/renderer/src/hunt-route.worker.ts'), 'utf8')

    expect(view).toContain("new Worker(new URL('./hunt-route.worker.ts', import.meta.url)")
    expect(view).not.toContain('buildRoute(data')
    expect(view).toContain('ROUTE_REFRESH_MS = 15_000')
    expect(worker).toContain('computeHuntRouteProjection')
  })

  it('keeps the same route calculator available to the worker', () => {
    const data: HuntSpecies[] = [
      [1, 'Bulbasaur', ['GRASS'], [45, 49, 49, 65, 65, 45], 1, 'Kanto', 'Starter Field']
    ]
    const profile: HuntProfile = {
      trainerLevel: 10,
      speciesId: 1,
      pokemonLevel: 10,
      quality: 1,
      potency: 1,
      shiny: false,
      ivAtk: 16,
      ivSpAtk: 16,
      ivDef: 16,
      ivSpDef: 16,
      ivHp: 16,
      ivSpeed: 16,
      types: ['GRASS'],
      baseStats: [45, 49, 49, 65, 65, 45],
      trainerXpMultiplier: 1,
      pokemonXpMultiplier: 1
    }

    const result = computeHuntRouteProjection(data, profile)
    expect(result.route.length).toBeGreaterThan(0)
    expect(result.route[0]?.hunt.area).toBe('Starter Field')
  })
})
