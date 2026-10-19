import type {
  AccountId,
  AutoMarketAccountSnapshot,
  AutoMarketCatalogItem,
  AutoMarketCategory,
  AutoMarketRule,
  AutoMarketRuleStatus,
  AutoMarketSnapshot,
  MarketCurrency
} from '../../shared/contracts'

const categoryMeta: Record<AutoMarketCategory, { icon: string; title: string; subtitle: string }> = {
  balls: { icon: '◉', title: 'POKÉBOLAS', subtitle: 'Bolas de captura' },
  potions: { icon: '▥', title: 'POÇÕES', subtitle: 'Cura em campo' },
  revives: { icon: '✚', title: 'REVIVES', subtitle: 'Levanta quem caiu' }
}

const categories: AutoMarketCategory[] = ['balls','potions','revives']

export function AutoMarketView({ state }: { state: AutoMarketSnapshot }) {
  const accounts = ([1,2,3,4] as AccountId[]).map((id) => state.accounts.find((row) => row.accountId === id))
  const enabled = state.accounts.reduce((sum, account) => sum + account.rules.filter((rule) => rule.enabled).length, 0)

  const setMode = (mode: 'observe'|'auto'): void => {
    if (mode === 'auto' && state.mode !== 'auto') {
      const ok = window.confirm('Ativar AutoMarket REAL? O Gridium poderá enviar compras ao Market quando estoque, anúncio, preço e saldo forem confirmados pelo servidor. Regras sem teto de preço nunca compram.')
      if (!ok) return
    }
    void window.gridium2.setAutoMarketMode(mode)
  }

  return <main class="automarket-page">
    <section class="automarket-header poke-frame">
      <div class="automarket-title"><span class="automarket-icon">▤</span><div><h1>AUTOMARKET</h1><p>Reabastecimento por conta · estoque e anúncios confirmados pelo servidor</p></div></div>
      <div class="automarket-mode">
        <button class={state.mode === 'observe' ? 'active observe' : ''} onClick={() => setMode('observe')}>👁 OBSERVAR</button>
        <button class={state.mode === 'auto' ? 'active live' : ''} onClick={() => setMode('auto')}>⚡ AUTOMÁTICO</button>
      </div>
      <div class={`automarket-arm ${state.mode}`}><i />{state.mode === 'auto' ? `AUTO ARMADO · ${enabled} REGRAS` : `SÓ OBSERVANDO · ${enabled} REGRAS`}</div>
    </section>

    <section class="automarket-grid poke-frame">
      <div class="am-corner"><b>REABASTECIMENTO</b><span>Compra somente anúncio real dentro do teto.</span></div>
      {accounts.map((account, index) => <AccountHead account={account} id={(index + 1) as AccountId} key={`head-${index}`} />)}

      {categories.map((category) => <>
        <CategoryHead category={category} key={`cat-${category}`} />
        {accounts.map((account, index) => <RuleCell
          key={`${category}-${index}`}
          account={account}
          category={category}
          catalog={state.catalog}
          mode={state.mode}
          id={(index + 1) as AccountId}
        />)}
      </>)}
    </section>

    <section class="automarket-footer-note poke-frame">
      <b>🛡 PROTEÇÕES DA ALPHA 0.5</b>
      <span>Sem estoque do servidor = não compra</span>
      <span>Sem anúncio real recente = não compra</span>
      <span>Preço acima do teto = não compra</span>
      <span>Saldo insuficiente = não compra</span>
      <span>Máximo 4 envios/min por conta</span>
      <span>Compra só é marcada como concluída após confirmação do servidor</span>
    </section>
  </main>
}

function AccountHead({ account, id }: { account?: AutoMarketAccountSnapshot; id: AccountId }) {
  const money = account?.coins
  return <div class={`am-account-head ${account?.socketReady ? 'live' : ''}`}>
    <div class="am-account-name"><i class={`account-color c${id}`} /><b>{account?.serverNick || `Conta ${id}`}</b></div>
    <span class="am-balance">🪙 {money === null || money === undefined ? '—' : formatNumber(money)}</span>
    <small>{account?.socketReady ? '● SERVIDOR AO VIVO' : '○ AGUARDANDO WEBSOCKET'}</small>
  </div>
}

function CategoryHead({ category }: { category: AutoMarketCategory }) {
  const meta = categoryMeta[category]
  return <div class="am-category"><span>{meta.icon}</span><div><b>{meta.title}</b><small>{meta.subtitle}</small></div></div>
}

function RuleCell({
  account, category, catalog, mode, id
}: {
  account?: AutoMarketAccountSnapshot
  category: AutoMarketCategory
  catalog: AutoMarketCatalogItem[]
  mode: 'observe'|'auto'
  id: AccountId
}) {
  if (!account) return <div class="am-rule-cell loading">Preparando Conta {id}…</div>
  const rule = account.rules.find((row) => row.category === category)
  const status = account.statuses.find((row) => row.category === category)
  if (!rule) return <div class="am-rule-cell loading">Regra indisponível</div>

  const inventory = account.inventory.find((row) => row.itemId === rule.itemId)
  const options = mergeOptions(catalog, account, rule)
  const commit = (patch: Partial<AutoMarketRule>): void => {
    void window.gridium2.setAutoMarketRule(id, { ...rule, ...patch })
  }

  return <div class={`am-rule-cell ${rule.enabled ? 'enabled' : 'disabled'} state-${status?.state || 'waiting'}`}>
    <div class="am-rule-top">
      <select value={rule.itemId} onChange={(event) => {
        const itemId = event.currentTarget.value
        const option = options.find((row) => row.itemId === itemId)
        commit({ itemId, itemName: option?.name || '' })
      }}>
        <option value="">— nenhum —</option>
        {options.map((item) => <option value={item.itemId} key={item.itemId}>{item.name}</option>)}
      </select>
      <label class="am-switch"><input type="checkbox" checked={rule.enabled} onChange={(event) => commit({ enabled: event.currentTarget.checked })} /><span /> <b>{rule.enabled ? 'ATIVO' : 'PAUSADO'}</b></label>
    </div>

    <div class="am-stock-line">
      <strong>{inventory ? `×${formatNumber(inventory.quantity)}` : '×—'}</strong>
      <span>estoque do servidor</span>
      {status?.bestUnitPrice !== null && status?.bestUnitPrice !== undefined && <em>{rule.currency === 'gems' ? '💎' : '🪙'} {formatNumber(status.bestUnitPrice)}</em>}
    </div>

    <div class="am-rule-fields">
      <NumberField label="MÍNIMO" value={rule.minStock} onChange={(value) => commit({ minStock: value, targetStock: Math.max(value, rule.targetStock) })} />
      <NumberField label="COMPRAR ATÉ" value={rule.targetStock} onChange={(value) => commit({ targetStock: Math.max(rule.minStock, value) })} />
      <NumberField label="TETO/UN." value={rule.maxUnitPrice} onChange={(value) => commit({ maxUnitPrice: value })} />
      <label class="am-currency"><small>MOEDA</small><select value={rule.currency} onChange={(event) => commit({ currency: event.currentTarget.value as MarketCurrency })}><option value="coins">🪙</option><option value="gems">💎</option></select></label>
    </div>

    <StatusLine status={status} mode={mode} />
  </div>
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label class="am-number"><small>{label}</small><input type="number" min="0" step="1" value={String(value)} onChange={(event) => onChange(Math.max(0, Number(event.currentTarget.value) || 0))} /></label>
}

function StatusLine({ status, mode }: { status?: AutoMarketRuleStatus; mode: 'observe'|'auto' }) {
  const state = status?.state || 'waiting'
  return <div class={`am-status ${state}`}><i /> <span>{status?.message || 'Aguardando dados do servidor'}</span>{state === 'would-buy' && <b>{mode === 'auto' ? 'PRONTO' : 'SIMULAÇÃO'}</b>}</div>
}

function mergeOptions(catalog: AutoMarketCatalogItem[], account: AutoMarketAccountSnapshot, rule: AutoMarketRule): AutoMarketCatalogItem[] {
  const map = new Map<string, AutoMarketCatalogItem>()
  for (const item of catalog) map.set(item.itemId, item)
  for (const item of account.inventory) {
    const previous = map.get(item.itemId)
    map.set(item.itemId, previous ? { ...previous, name: /^Item #/.test(previous.name) ? item.name : previous.name } : { itemId: item.itemId, name: item.name, bestCoins: null, bestGems: null, observedAt: item.observedAt })
  }
  if (rule.itemId && !map.has(rule.itemId)) map.set(rule.itemId, { itemId: rule.itemId, name: rule.itemName || `Item #${rule.itemId}`, bestCoins: null, bestGems: null, observedAt: 0 })
  return [...map.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(0,300)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
}
