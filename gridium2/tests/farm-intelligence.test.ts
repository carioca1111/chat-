import { describe, expect, it } from 'vitest'
import { farmConnectionLabel, farmOverview, isStone, officialItemImage } from '../src/renderer/src/farm-intelligence-model'
import type { GridiumSnapshot } from '../src/shared/contracts'

function account(id: number, rareItems: Array<{ itemId:string; name:string; quantity:number; iconUrl?:string }> = [], status = 'ready', huntProtocolStatus = 'live') {
  return {
    id,
    status,
    huntProtocolStatus,
    panelAnalytics: {
      revision: 1,
      capturesTotal: 42,
      goldEarnedTotal: 1000,
      rareItems,
      rareItemDiagnostics: { packetShapes: [], catalogSize: 0, inventory: [{ id: '109', name: 'Item #109', quantity: 10 }] }
    }
  } as unknown as GridiumSnapshot['accounts'][number]
}

describe('Farm Intelligence summary', () => {
  it('sums drops across four separate accounts, excluding stones and unknown ids', () => {
    const accounts = [
      account(1, [{ itemId: '20', name: 'Bronze Boss Token', quantity: 5 }, { itemId: '109', name: 'Rock Stone', quantity: 13 }]),
      account(2, [{ itemId: '20', name: 'Bronze Boss Token', quantity: 6 }, { itemId: '100', name: 'Shiny Stone', quantity: 1 }]),
      account(3, [{ itemId: '73', name: 'Boss Token', quantity: 3 }, { itemId: '200', name: 'Safari Ticket', quantity: 2 }]),
      account(4, [{ itemId: '999', name: 'Item #999', quantity: 7 }])
    ]
    const summary = farmOverview(accounts)
    expect(summary.tokens).toBe(14)
    expect(summary.otherRare).toBe(2)
    expect(summary.captures).toBe(168)
    expect(summary.gold).toBe(4000)
    expect(summary.unidentified).toHaveLength(4)
    expect(summary.items).toHaveLength(3)
    expect(summary.items.find(row => row.name === 'Bronze Boss Token')?.accounts).toEqual([5,6,0,0])
  })

  it('does not classify arbitrary item ids as stones or boss tokens', () => {
    expect(isStone('Rock Stone')).toBe(true)
    expect(isStone('pedra da lua')).toBe(true)
    expect(isStone('Boss Token')).toBe(false)
    expect(officialItemImage({ name: 'Safari Ticket' })).toBe('https://pokeidle.io/img/itens/safari-ticket.png')
    expect(officialItemImage({ name: 'Boss Token', iconUrl: 'https://evil.example.com/token.png' })).toBeUndefined()
    expect(officialItemImage({ name: 'Boss Token', iconUrl: 'https://pokeidle.io/img/itens/token.png' })).toContain('pokeidle.io')
  })

  it('distinguishes loading from real page errors and unavailable telemetry', () => {
    expect(farmConnectionLabel(account(1, [], 'loading'))).toBe('CARREGANDO')
    expect(farmConnectionLabel(account(1, [], 'ready', 'waiting'))).toBe('AGUARDANDO DADOS')
    expect(farmConnectionLabel(account(1, [], 'ready', 'unavailable'))).toBe('MONITOR INDISPONÍVEL')
    expect(farmConnectionLabel(account(1, [], 'ready', 'live'))).toBe('SERVIDOR ATIVO')
    expect(farmConnectionLabel(account(1, [], 'offline'))).toBe('FALHA DE PÁGINA')
  })
})
