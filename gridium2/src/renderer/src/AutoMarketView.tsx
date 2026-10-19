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
import {
  POKEIDLE_AUTO_MARKET_DEFAULTS,
  categoryForPokeIdleItem,
  normalizePokeIdleItemName
} from '../../shared/pokeidle-item-catalog'
import { AUTO_MARKET_VISUAL_PRESETS } from './automarket-presets'
import { itemSpriteUrl } from './item-visuals'

const categoryMeta: Record<AutoMarketCategory, { icon: string; title: string; subtitle: string }> = {
  balls: { icon: '◉', title: 'POKÉBOLAS', subtitle: 'Bolas de captura' },
  potions: { icon: '▥', title: 'POÇÕES', subtitle: 'Cura em campo' },
  revives: { icon: '✚', title: 'REVIVES', subtitle: 'Levanta quem caiu' }
}

const categories: AutoMarketCategory[] = ['balls','potions','revives']
type PickerItem = AutoMarketCatalogItem & { preset?: boolean }

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
      <div class="automarket-title"><span class="automarket-icon">▤</span><div><h1>AUTOMARKET</h1><p>Reabastecimento por conta · catálogo real do PokeIdle · dados ao vivo do servidor</p></div></div>
      <div class="automarket-mode">
        <button class={state.mode === 'observe' ? 'active observe' : ''} onClick={() => setMode('observe')}>👁 OBSERVAR</button>
        <button class={state.mode === 'auto' ? 'active live' : ''} onClick={() => setMode('auto')}>⚡ AUTOMÁTICO</button>
      </div>
      <div class={`automarket-arm ${state.mode}`}><i />{state.mode === 'auto' ? `AUTO ARMADO · ${enabled} REGRAS` : `SÓ OBSERVANDO · ${enabled} REGRAS`}</div>
    </section>

    <section class="automarket-grid poke-frame">
      <div class="am-corner"><b>REABASTECIMENTO</b><span>Somente itens reais do PokeIdle. Compra apenas anúncio confirmado.</span></div>
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
      <b>🛡 PROTEÇÕES DA ALPHA 0.5.3</b>
      <span>Catálogo fechado: 4 Pokébolas · 6 Poções · 2 Revives</span>
      <span>Nome/imagem locais; ID, estoque e preço só vêm do servidor</span>
      <span>Sem vínculo de ID real = não compra</span>
      <span>Sem anúncio real recente = não compra</span>
      <span>Preço acima do teto ou saldo insuficiente = não compra</span>
      <span>Compra só é concluída após confirmação do PokeIdle</span>
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

  const options = mergeOptions(category, catalog, account)
  const visualName = rule.itemName || POKEIDLE_AUTO_MARKET_DEFAULTS[category]
  const selectedItem = rule.itemId
    ? options.find((row) => row.itemId === rule.itemId)
    : options.find((row) => normalizePokeIdleItemName(row.name) === normalizePokeIdleItemName(visualName))
  const inventory = rule.itemId ? account.inventory.find((row) => row.itemId === rule.itemId) : undefined
  const suggestionOnly = !rule.itemName

  const commit = (patch: Partial<AutoMarketRule>): void => {
    void window.gridium2.setAutoMarketRule(id, { ...rule, ...patch })
  }

  return <div class={`am-rule-cell ${rule.enabled ? 'enabled' : 'disabled'} state-${status?.state || 'waiting'}`}>
    <div class="am-rule-top">
      <ItemPicker
        category={category}
        items={options}
        selected={selectedItem}
        suggestionOnly={suggestionOnly}
        onSelect={(item) => commit({ itemId: item && !item.preset ? item.itemId : '', itemName: item?.name || '', enabled: item ? rule.enabled : false })}
      />
      <label class="am-switch"><input type="checkbox" checked={rule.enabled} onChange={(event) => commit({ enabled: event.currentTarget.checked })} /><span /> <b>{rule.enabled ? 'ATIVO' : 'PAUSADO'}</b></label>
    </div>

    <div class="am-stock-line">
      <div class="am-selected-item">
        <ItemSprite item={selectedItem} category={category} />
        <div>
          <b>{selectedItem?.name || visualName}</b>
          <small>{inventory
            ? `×${formatNumber(inventory.quantity)} no estoque`
            : suggestionOnly
              ? 'sugestão visual · escolha o item'
              : selectedItem?.preset
                ? 'aguardando ID real do servidor'
                : 'estoque aguardando servidor'}</small>
        </div>
      </div>
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

function ItemPicker({
  category, items, selected, suggestionOnly, onSelect
}: {
  category: AutoMarketCategory
  items: PickerItem[]
  selected?: PickerItem
  suggestionOnly: boolean
  onSelect: (item?: PickerItem) => void
}) {
  return <details class="am-item-picker">
    <summary>
      <ItemSprite item={selected} category={category} compact />
      <span><b>{selected?.name || '— escolher item —'}</b><small>{suggestionOnly ? 'sugestão · clique para escolher' : selected?.preset ? 'aguardando ID do servidor' : selected ? 'vinculado ao servidor' : 'trocar item'}</small></span>
      <i>⌄</i>
    </summary>
    <div class="am-item-menu">
      <button class="am-item-option none" onClick={(event) => { onSelect(undefined); event.currentTarget.closest('details')?.removeAttribute('open') }}>
        <span class="am-item-sprite empty">—</span><b>Nenhum</b>
      </button>
      {items.map((item) => <button class={`am-item-option ${samePickerItem(selected, item) ? 'selected' : ''}`} key={`${item.preset ? 'preset' : 'server'}:${item.itemId}:${normalizePokeIdleItemName(item.name)}`} onClick={(event) => { onSelect(item); event.currentTarget.closest('details')?.removeAttribute('open') }}>
        <ItemSprite item={item} category={category} compact />
        <span><b>{item.name}</b><small>{item.preset ? 'PokeIdle · aguardando vínculo do servidor' : 'PokeIdle · ID confirmado'}</small></span>
      </button>)}
    </div>
  </details>
}

function ItemSprite({ item, category, compact = false }: { item?: PickerItem; category: AutoMarketCategory; compact?: boolean }) {
  const src = item ? itemSpriteUrl(item.name) : ''
  return <span class={`am-item-sprite ${compact ? 'compact' : ''}`}>
    <span class="am-item-fallback">{categoryMeta[category].icon}</span>
    {src && <img src={src} alt={item?.name || 'Item'} loading="lazy" />}
  </span>
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label class="am-number"><small>{label}</small><input type="number" min="0" step="1" value={String(value)} onChange={(event) => onChange(Math.max(0, Number(event.currentTarget.value) || 0))} /></label>
}

function StatusLine({ status, mode }: { status?: AutoMarketRuleStatus; mode: 'observe'|'auto' }) {
  const state = status?.state || 'waiting'
  return <div class={`am-status ${state}`}><i /> <span>{status?.message || 'Aguardando dados do servidor'}</span>{state === 'would-buy' && <b>{mode === 'auto' ? 'PRONTO' : 'SIMULAÇÃO'}</b>}</div>
}

function mergeOptions(category: AutoMarketCategory, catalog: AutoMarketCatalogItem[], account: AutoMarketAccountSnapshot): PickerItem[] {
  const byName = new Map<string, PickerItem>()
  for (const preset of AUTO_MARKET_VISUAL_PRESETS[category]) {
    byName.set(normalizePokeIdleItemName(preset.name), { itemId: `preset:${preset.key}`, name: preset.name, bestCoins: null, bestGems: null, observedAt: 0, preset: true })
  }

  const addAuthoritative = (item: AutoMarketCatalogItem): void => {
    if (categoryForPokeIdleItem(item.name) !== category) return
    byName.set(normalizePokeIdleItemName(item.name), { ...item, preset: false })
  }

  for (const item of catalog) addAuthoritative(item)
  for (const item of account.inventory) addAuthoritative({ itemId: item.itemId, name: item.name, bestCoins: null, bestGems: null, observedAt: item.observedAt })

  const order = AUTO_MARKET_VISUAL_PRESETS[category].map((item) => normalizePokeIdleItemName(item.name))
  return [...byName.values()].sort((a,b) => order.indexOf(normalizePokeIdleItemName(a.name)) - order.indexOf(normalizePokeIdleItemName(b.name)))
}

function samePickerItem(a?: PickerItem, b?: PickerItem): boolean {
  if (!a || !b) return false
  if (!a.preset && !b.preset && a.itemId === b.itemId) return true
  return normalizePokeIdleItemName(a.name) === normalizePokeIdleItemName(b.name)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
}
