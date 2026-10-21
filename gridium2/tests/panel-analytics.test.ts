import { describe, expect, it } from 'vitest'
import { PanelAnalyticsTracker } from '../src/main/panel-analytics-runtime'

describe('Panel Analytics official Pokemon note', () => {
  it('uses server nota before quality and counts exact 3.5', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [] }, true, 1_000)
    tracker.ingestState({
      pkMud: [{
        id: 101,
        nome: 'Teste 3,5',
        quality: 1.437,
        nota: 3.5,
        potencia: 2,
        shiny: false
      }]
    }, false, 2_000)

    const snapshot = tracker.snapshot(2_000)
    expect(snapshot.capturesTotal).toBe(1)
    expect(snapshot.note35Plus).toBe(1)
    expect(snapshot.noteBands).toEqual([0,0,0,0,1,0,0,0])
    expect(snapshot.events[0]?.detail).toContain('nota 3,500')
  })

  it('counts every official note from zero through 5+', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [] }, true, 1_000)

    const notes = [0, 0.99, 1, 1.99, 2, 2.99, 3, 3.49, 3.5, 3.99, 4, 4.49, 4.5, 4.99, 5, 5.4]
    notes.forEach((nota, index) => {
      tracker.ingestState({ pkMud: [{ id: 200 + index, nome: `P${index}`, nota, quality: 1.1 }] }, false, 2_000 + index)
    })

    const snapshot = tracker.snapshot(3_000)
    expect(snapshot.capturesTotal).toBe(16)
    expect(snapshot.noteBands).toEqual([2,2,2,2,2,2,2,2])
    expect(snapshot.note35Plus).toBe(8)
  })

  it('does not pretend quality is an official note when nota is absent', () => {
    const tracker = new PanelAnalyticsTracker()
    tracker.ingestState({ pokemons: [] }, true, 1_000)
    tracker.ingestState({ pkMud: [{ id: 999, nome: 'Sem nota', quality: 4.8 }] }, false, 2_000)

    const snapshot = tracker.snapshot(2_000)
    expect(snapshot.capturesTotal).toBe(1)
    expect(snapshot.noteBands).toEqual([0,0,0,0,0,0,0,0])
    expect(snapshot.note35Plus).toBe(0)
    expect(snapshot.events[0]?.detail).toContain('nota indisponível')
  })
})
