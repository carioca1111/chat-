import { describe, expect, it } from 'vitest'
import { HUNT_PROFILE_SCAN_SCRIPT, parseHuntPageText } from '../src/main/hunt-scan'

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

  it('extracts equipped shiny, average IV and labelled fields', () => {
    const scan = parseHuntPageText(`
      Treinador Nv 500
      EQUIPADO
      TEXT: Gengar Lv 212
      QUALITY: 1,72
      POTENCY: P4
      IV MÉDIO: 28,5
      SHINY
    `)

    expect(scan).toMatchObject({
      trainerLevel: 500,
      speciesName: 'Gengar',
      pokemonLevel: 212,
      quality: 1.72,
      potency: 4,
      ivAverage: 28.5,
      shiny: true
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

  it('keeps the injected DOM collector bounded and targeted', () => {
    expect(HUNT_PROFILE_SCAN_SCRIPT).toContain('count++ >= 120')
    expect(HUNT_PROFILE_SCAN_SCRIPT).toContain('slice(0, 60000)')
    expect(HUNT_PROFILE_SCAN_SCRIPT).not.toContain('localStorage')
  })
})
