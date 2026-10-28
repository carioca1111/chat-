import fs from 'node:fs'

const path = 'gridium2/tests/hunt-session-runtime.test.ts'
let source = fs.readFileSync(path, 'utf8')
const from = `  it('recognizes the six current potions and both revives from effect-only catalog definitions', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({
      t: 'welcome',
      catalogoItens: [
        { id: 101, categoria: 'itens de cura', efeito: '+60 HP', preco: 50 },
        { id: 102, categoria: 'itens de cura', efeito: '+150 HP', preco: 150 },
        { id: 103, categoria: 'itens de cura', efeito: '+400 HP', preco: 400 },
        { id: 104, categoria: 'itens de cura', efeito: '+1.000 HP', preco: 800 },
        { id: 105, categoria: 'itens de cura', efeito: '+3.000 HP', preco: 1500 },
        { id: 106, categoria: 'itens de cura', efeito: 'cura 50% do HP máximo', preco: 2500 },
        { id: 201, categoria: 'revive', efeito: 'restaura 10% do HP', preco: 600 },
        { id: 202, categoria: 'revive', efeito: 'restaura 100% do HP', preco: 5000 }
      ],
      estado: {
        id: 99,
        huntSlug: 'outland-02',
        pokemons: [{ id: 1, xp: 0 }],
        bolsa: { 101: 10, 102: 20, 103: 30, 104: 40, 105: 50, 106: 60, 201: 70, 202: 80 }
      }
    }, now)

    let snapshot = runtime.snapshot(now)
    expect(snapshot.potionStock).toBe(210)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: '101', name: 'Small Potion', quantity: 10 }),
      expect.objectContaining({ itemId: '102', name: 'Great Potion', quantity: 20 }),
      expect.objectContaining({ itemId: '103', name: 'Ultra Potion', quantity: 30 }),
      expect.objectContaining({ itemId: '104', name: 'Hyper Potion', quantity: 40 }),
      expect.objectContaining({ itemId: '105', name: 'Ultimate Potion', quantity: 50 }),
      expect.objectContaining({ itemId: '106', name: 'Golden Potion', quantity: 60 }),
      expect.objectContaining({ itemId: '201', name: 'Revive', quantity: 70 }),
      expect.objectContaining({ itemId: '202', name: 'Max Revive', quantity: 80 })
    ]))

    runtime.ingest({ t: 'inventario', bolsa: { 101: 9, 102: 19, 103: 29, 104: 39, 105: 49, 106: 59, 201: 69, 202: 79 } }, now + 5_000)
    snapshot = runtime.snapshot(now + 5_000)
    expect(snapshot.potionStock).toBe(204)
    expect(snapshot.potionsUsedTotal).toBe(6)
    expect(snapshot.potionsUsedLastHour).toBe(6)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.used).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.used).toBe(1)
  })`

const to = `  it('recognizes the five live potions and both revives from effect-only catalog definitions', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({
      t: 'welcome',
      catalogoItens: [
        { id: 101, categoria: 'itens de cura', efeito: '+20 HP', preco: 20 },
        { id: 102, categoria: 'itens de cura', efeito: '+40 HP', preco: 50 },
        { id: 103, categoria: 'itens de cura', efeito: '+80 HP', preco: 125 },
        { id: 104, categoria: 'itens de cura', efeito: '+100 HP', preco: 175 },
        { id: 105, categoria: 'itens de cura', efeito: '+120 HP', preco: 240 },
        { id: 201, categoria: 'revive', efeito: 'restaura 50% do HP', preco: 100 },
        { id: 202, categoria: 'revive', efeito: 'restaura 100% do HP', preco: 350 }
      ],
      estado: {
        id: 99,
        huntSlug: 'outland-02',
        pokemons: [{ id: 1, xp: 0 }],
        bolsa: { 101: 10, 102: 20, 103: 30, 104: 40, 105: 50, 201: 70, 202: 80 }
      }
    }, now)

    let snapshot = runtime.snapshot(now)
    expect(snapshot.potionStock).toBe(150)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: '101', name: 'Small Potion', quantity: 10 }),
      expect.objectContaining({ itemId: '102', name: 'Great Potion', quantity: 20 }),
      expect.objectContaining({ itemId: '103', name: 'Ultra Potion', quantity: 30 }),
      expect.objectContaining({ itemId: '104', name: 'Hyper Potion', quantity: 40 }),
      expect.objectContaining({ itemId: '105', name: 'Ultimate Potion', quantity: 50 }),
      expect.objectContaining({ itemId: '201', name: 'Revive', quantity: 70 }),
      expect.objectContaining({ itemId: '202', name: 'Max Revive', quantity: 80 })
    ]))

    runtime.ingest({ t: 'inventario', bolsa: { 101: 9, 102: 19, 103: 29, 104: 39, 105: 49, 201: 69, 202: 79 } }, now + 5_000)
    snapshot = runtime.snapshot(now + 5_000)
    expect(snapshot.potionStock).toBe(145)
    expect(snapshot.potionsUsedTotal).toBe(5)
    expect(snapshot.potionsUsedLastHour).toBe(5)
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')?.used).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Max Revive')?.used).toBe(1)
  })`

if (!source.includes(from)) throw new Error('Legacy six-potion test anchor not found')
source = source.replace(from, to)
fs.writeFileSync(path, source)
