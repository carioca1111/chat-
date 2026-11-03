import type { AccountSnapshot, GridiumSnapshot, PanelRareItemSnapshot } from '../../shared/contracts'

export type FarmAccount = GridiumSnapshot['accounts'][number]
export interface FarmItem {
  key: string
  name: string
  quantity: number
  accounts: number[]
  iconUrl?: string
}
export interface FarmOverview {
  items: FarmItem[]
  tokens: number
  otherRare: number
  captures: number
  gold: number
  unidentified: Array<{ accountId: number; itemId: string; quantity: number }>
}

export const isStone = (name: string): boolean => /(?:stone|pedra)/i.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
export const isUnknownItemName = (name: string): boolean => /^Item\s*#\d+$/i.test(name.trim())
export const isBossToken = (name: string): boolean => /boss[\s_-]*tokens?/i.test(name)

/** URLs must originate from PokeIdle itself, never another game catalog. */
export function officialItemImage(item: Pick<PanelRareItemSnapshot, 'name' | 'iconUrl'>): string | undefined {
  if (item.iconUrl) {
    try {
      const url = new URL(item.iconUrl)
      if (url.protocol === 'https:' && ['pokeidle.io', 'www.pokeidle.io'].includes(url.hostname) && /\.(png|gif|jpe?g|webp|svg)$/i.test(url.pathname)) return url.href
    } catch { /* ignore untrusted or malformed icons */ }
  }
  // Verified official PokeIdle pixel-art asset, not a generic sprite or another game's catalog.
  if (/^bronze[\s_-]*boss[\s_-]*tokens?$/i.test(item.name)) return 'https://pokeidle.io/assets/site/assets/items/bronze_boss_token.png'
  // Officially published image at pokeidle.io/app; no speculative IDs/assets.
  if (/^safari[\s_-]*ticket$/i.test(item.name)) return 'https://pokeidle.io/img/itens/safari-ticket.png'
  return undefined
}

export function farmConnectionLabel(account: Pick<AccountSnapshot, 'status' | 'huntProtocolStatus'>): string {
  if (account.status === 'crashed') return 'ERRO NA TELA'
  if (account.status === 'offline') return 'FALHA DE PÁGINA'
  if (account.status === 'booting' || account.status === 'loading') return 'CARREGANDO'
  if (account.huntProtocolStatus === 'live') return 'SERVIDOR ATIVO'
  if (account.huntProtocolStatus === 'unavailable') return 'MONITOR INDISPONÍVEL'
  return 'AGUARDANDO DADOS'
}

export function farmOverview(accounts: FarmAccount[]): FarmOverview {
  const items = new Map<string, FarmItem>()
  let captures = 0
  let gold = 0
  const unidentified: FarmOverview['unidentified'] = []
  accounts.forEach((account, accountIndex) => {
    const stats = account.panelAnalytics
    if (!stats) return
    captures += stats.capturesTotal
    gold += stats.goldEarnedTotal
    for (const item of stats.rareItems || []) {
      if (!item.name || isStone(item.name) || isUnknownItemName(item.name) || item.quantity <= 0) continue
      const key = item.name.trim().toLocaleLowerCase('pt-BR')
      const row = items.get(key) ?? { key, name: item.name, quantity: 0, accounts: accounts.map(() => 0) }
      row.quantity += item.quantity
      row.accounts[accountIndex] += item.quantity
      if (!row.iconUrl) row.iconUrl = officialItemImage(item)
      items.set(key, row)
    }
    for (const item of stats.rareItemDiagnostics?.inventory ?? []) {
      if (isUnknownItemName(item.name)) unidentified.push({ accountId: account.id, itemId: item.id, quantity: item.quantity })
    }
  })
  const output = [...items.values()].sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
  const tokens = output.filter(row => isBossToken(row.name)).reduce((sum, row) => sum + row.quantity, 0)
  return { items: output, tokens, otherRare: output.reduce((sum, row) => sum + row.quantity, 0) - tokens, captures, gold, unidentified }
}
