import { describe, expect, it } from 'vitest'
import { matchSpeciesIdByDisplayName, normalizePokemonLookupName } from '../src/renderer/src/pokemon-sprites'

describe('Pokemon sprite resolver', () => {
  const catalog: Array<[number, string, ...unknown[]]> = [
    [6, 'Charizard'],
    [9, 'Blastoise'],
    [122, 'Mr. Mime'],
    [439, 'Mime Jr.']
  ]

  it('resolves Outlands prefixes by the canonical species suffix', () => {
    expect(matchSpeciesIdByDisplayName('Brave Charizard', catalog)).toBe(6)
    expect(matchSpeciesIdByDisplayName('Ancient Brave Charizard', catalog)).toBe(6)
    expect(matchSpeciesIdByDisplayName('Furious Blastoise', catalog)).toBe(9)
  })

  it('prefers the longest canonical suffix and normalizes punctuation', () => {
    expect(matchSpeciesIdByDisplayName('Brave Mr. Mime', catalog)).toBe(122)
    expect(matchSpeciesIdByDisplayName('Mystic Mime Jr.', catalog)).toBe(439)
    expect(normalizePokemonLookupName('Mr. Mime')).toBe('mr mime')
  })
})
