import { describe, expect, it, vi } from 'vitest'
import type { AccountId, AutoMarketRule } from '../src/shared/contracts'
import { AutoMarketRuntime, extractServerInventory, normalizeMarketListing } from '../src/main/auto-market-runtime'

const baseRule = (patch: Partial<AutoMarketRule> = {}): AutoMarketRule => ({
  category: 'balls', enabled: true, itemId: '10', itemName: 'Ultra Ball', minStock: 500,
  targetStock: 1000, maxUnitPrice: 130, currency: 'coins', ...patch
})

const statePacket = (quantity = 100, gold = 1_000_000) => ({
  t: 'estado', estado: { id: 77, nick: 'Conta Teste', gold, orbs: 500, servidorAgora: Date.now(), inventory: [{ itemId: 10, nome: 'Ultra Ball', qtd: quantity }] }
})
const listingPacket = (price = 120, id = 500) => ({
  t: 'market', aba: 'item', linhas: [{ id, tipo: 'item', itemId: 10, nome: 'Ultra Ball', preco: price, moeda: 'gold', qtd: 900, vendedorId: 999 }]
})

function runtime(send = vi.fn(async () => ({ ok: true }))) {
  return { rt: new AutoMarketRuntime({ sendCommand: send, onChanged: () => undefined, scheduler: false }), send }
}

async function ready(rt: AutoMarketRuntime, accountId: AccountId = 1, quantity = 100, gold = 1_000_000, price = 120) {
  rt.setSocketReady(accountId, true)
  rt.ingest(accountId, statePacket(quantity, gold))
  rt.ingest(accountId, listingPacket(price))
  rt.updateRule(accountId, baseRule())
}

describe('Gridium 2 AutoMarket server runtime', () => {
  it('extracts inventory only from explicit server inventory containers', () => {
    expect(extractServerInventory({ inventory: [{ itemId: 10, nome: 'Ultra Ball', qtd: 321 }] })[0]).toMatchObject({ itemId: '10', name: 'Ultra Ball', quantity: 321 })
    expect(extractServerInventory({ randomCard: { itemId: 10, nome: 'Ultra Ball', qtd: 999 } })).toHaveLength(0)
  })

  it('normalizes only real item listings with id, itemId, price and currency', () => {
    expect(normalizeMarketListing({ id: 1, itemId: 10, nome: 'Ultra Ball', preco: 120, moeda: 'gold', qtd: 2 })).toMatchObject({ listingId: '1', itemId: '10', price: 120, currency: 'coins', quantity: 2 })
    expect(normalizeMarketListing({ itemId: 10, preco: 120, moeda: 'gold' })).toBeNull()
  })

  it('OBSERVE reports what it would buy and never sends a transaction', async () => {
    const { rt, send } = runtime()
    await ready(rt)
    await rt.evaluateAccount(1)
    const status = rt.snapshot().accounts[0].statuses.find((row) => row.category === 'balls')
    expect(status?.state).toBe('would-buy')
    expect(status?.message).toContain('OBSERVAR')
    expect(send).not.toHaveBeenCalled()
  })

  it('does not buy without authoritative inventory', async () => {
    const { rt, send } = runtime()
    rt.setSocketReady(1, true)
    rt.ingest(1, { t: 'estado', estado: { id: 77, nick: 'Conta Teste', gold: 1_000_000, orbs: 500, servidorAgora: Date.now() } })
    rt.ingest(1, listingPacket())
    rt.updateRule(1, baseRule())
    rt.setMode('auto')
    await rt.evaluateAccount(1)
    expect(send).not.toHaveBeenCalled()
    expect(rt.snapshot().accounts[0].statuses.find((row) => row.category === 'balls')?.message).toContain('estoque real')
  })

  it('does not buy when stock is above the minimum', async () => {
    const { rt, send } = runtime()
    await ready(rt, 1, 700)
    rt.setMode('auto')
    await rt.evaluateAccount(1)
    expect(send).not.toHaveBeenCalled()
    expect(rt.snapshot().accounts[0].statuses.find((row) => row.category === 'balls')?.state).toBe('ok')
  })

  it('does not buy above the configured price ceiling', async () => {
    const { rt, send } = runtime()
    await ready(rt, 1, 100, 1_000_000, 131)
    rt.setMode('auto')
    await rt.evaluateAccount(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('does not buy without an explicit positive price ceiling', async () => {
    const { rt, send } = runtime()
    await ready(rt)
    rt.updateRule(1, baseRule({ maxUnitPrice: 0 }))
    rt.setMode('auto')
    await rt.evaluateAccount(1)
    expect(send).not.toHaveBeenCalled()
    expect(rt.snapshot().accounts[0].statuses.find((row) => row.category === 'balls')?.message).toContain('preço máximo')
  })

  it('checks balance using unit price times quantity', async () => {
    const { rt, send } = runtime()
    await ready(rt, 1, 100, 1000)
    rt.setMode('auto')
    await rt.evaluateAccount(1)
    expect(send).not.toHaveBeenCalled()
    expect(rt.snapshot().accounts[0].statuses.find((row) => row.category === 'balls')?.message).toContain('Saldo insuficiente')
  })

  it('sends one validated buy and waits for server confirmation', async () => {
    const { rt, send } = runtime()
    await ready(rt)
    rt.setMode('auto')
    await rt.evaluateAccount(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(1, { t: 'market.comprar', id: 500, qtd: 900, preco: 120, moeda: 'gold' })
    expect(rt.snapshot().accounts[0].pending).toBe(true)
    await rt.evaluateAccount(1)
    expect(send).toHaveBeenCalledTimes(1)
    rt.ingest(1, { t: 'batalha', ev: [{ k: 'marketComprado', anuncioId: 500, total: 108000, moeda: 'gold' }] })
    expect(rt.snapshot().accounts[0].pending).toBe(false)
    expect(rt.snapshot().accounts[0].lastAction).toContain('confirmada pelo servidor')
  })

  it('keeps all four account rules and balances independent', async () => {
    const { rt } = runtime()
    rt.setSocketReady(1, true); rt.setSocketReady(2, true)
    rt.ingest(1, statePacket(100, 10000))
    rt.ingest(2, { t: 'estado', estado: { id: 88, nick: 'Outra', gold: 22222, inventory: [{ itemId: 10, nome: 'Ultra Ball', qtd: 999 }] } })
    rt.updateRule(1, baseRule({ minStock: 500 }))
    rt.updateRule(2, baseRule({ minStock: 50 }))
    const snapshot = rt.snapshot()
    expect(snapshot.accounts[0].coins).toBe(10000)
    expect(snapshot.accounts[1].coins).toBe(22222)
    expect(snapshot.accounts[0].rules[0].minStock).toBe(500)
    expect(snapshot.accounts[1].rules[0].minStock).toBe(50)
  })

  it('never persists AUTO armed mode; only rules are persisted', () => {
    const { rt } = runtime()
    rt.setMode('auto')
    const persisted = rt.persisted() as Record<string, unknown>
    expect(persisted.mode).toBeUndefined()
    expect(persisted.rules).toBeTruthy()
  })
})
