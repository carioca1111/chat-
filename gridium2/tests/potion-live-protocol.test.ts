import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HuntSessionRuntime } from '../src/main/hunt-session-runtime'

describe('live potion/revive protocol', () => {
  it('accepts typeless and array packets from the live socket', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()
    runtime.ingest({ t:'welcome', estado:{ id:1, huntSlug:'outland-02', pokemons:[{ id:1, xp:0 }] } }, now)
    runtime.ingest({ catalogoItens:[
      { id:101, categoria:'itens de cura', efeito:'+60 HP', preco:50 },
      { id:106, categoria:'itens de cura', efeito:'restaura 50 % da vida máxima', preco:2500 },
      { id:201, categoria:'revive', efeito:'restaura 10% do HP', preco:600 }
    ] }, now + 100)
    runtime.ingest([{ payload:{ bolsa:{ 101:403738, 106:3, 201:22 } } }], now + 200)
    const snapshot = runtime.snapshot(now + 200)
    expect(snapshot.potionStock).toBe(403741)
    expect(snapshot.potionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name:'Small Potion', quantity:403738 }),
      expect.objectContaining({ name:'Golden Potion', quantity:3 }),
      expect.objectContaining({ name:'Revive', quantity:22 })
    ]))
  })

  it('counts a sent use once, ignores its mirrored server event, then reconciles the inventory delta', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()
    runtime.ingest({ t:'welcome', catalogoItens:[
      { id:101, nome:'Small Potion' }, { id:201, nome:'Revive' }
    ], estado:{ id:1, huntSlug:'forest', pokemons:[{ id:1, xp:0 }], bolsa:{ 101:10, 201:4 } } }, now)

    runtime.ingest({ t:'usarItem', itemId:101 }, now + 1_000, 'sent')
    runtime.ingest({ t:'itemUsado', itemId:101 }, now + 1_100, 'received')
    runtime.ingest({ bolsa:{ 101:9, 201:4 } }, now + 1_200, 'received')

    runtime.ingest({ t:'revive', itemId:201 }, now + 2_000, 'sent')
    runtime.ingest({ t:'reviveUsado', itemId:201 }, now + 2_100, 'received')
    runtime.ingest({ bolsa:{ 101:9, 201:3 } }, now + 2_200, 'received')

    const snapshot = runtime.snapshot(now + 2_200)
    expect(snapshot.potionsUsedTotal).toBe(1)
    expect(snapshot.potionItems.find((item) => item.name === 'Small Potion')).toEqual(expect.objectContaining({ quantity:9, used:1 }))
    expect(snapshot.potionItems.find((item) => item.name === 'Revive')).toEqual(expect.objectContaining({ quantity:3, used:1 }))
  })

  it('does not discard typeless websocket frames and observes both directions plus binary JSON', () => {
    const source = readFileSync(new URL('../src/main/account-runtime.ts', import.meta.url), 'utf8')
    expect(source).toContain("method === 'Network.webSocketFrameReceived'")
    expect(source).toContain("method === 'Network.webSocketFrameSent'")
    expect(source).toContain('frame.opcode === 2')
    expect(source).not.toContain("if (!raw.includes")
  })
})
