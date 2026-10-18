import { describe, expect, it } from 'vitest'
import { parseHuntPageText } from '../src/main/hunt-scan'

describe('Hunt profile page scan', () => {
  it('extracts trainer and active pokemon fields from visible game text', () => {
    const scan = parseHuntPageText(`
      Carioca11 Nv 626
      EM CAMPO
      Charizard Nv 627
      FIRE FLYING
      IV 148 Q 1,464 P2
      4085 / 13164
    `, 123)

    expect(scan).toMatchObject({
      trainerLevel: 626,
      speciesName: 'Charizard',
      pokemonLevel: 627,
      quality: 1.464,
      potency: 2,
      ivTotal: 148,
      source: 'page',
      detectedAt: 123
    })
  })

  it('returns null instead of inventing data for an empty page', () => {
    expect(parseHuntPageText('')).toBeNull()
  })

  it('returns partial data when optional quality fields are not visible', () => {
    const scan = parseHuntPageText('Treinador Nv 80\nEM CAMPO\nIvysaur Nv 83\nHP 100/100')
    expect(scan?.trainerLevel).toBe(80)
    expect(scan?.speciesName).toBe('Ivysaur')
    expect(scan?.pokemonLevel).toBe(83)
    expect(scan?.quality).toBeUndefined()
  })
})
