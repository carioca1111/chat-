import { useMemo, useState } from 'preact/hooks'
import type { GridiumSnapshot, PanelEventSnapshot } from '../../shared/contracts'
import { farmConnectionLabel, farmOverview, isStone, isBossToken } from './farm-intelligence-model'

const number = (n: number) => n.toLocaleString('pt-BR')
const compact = (n: number) => Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
type DropEvent = PanelEventSnapshot & { accountId: number }

export function FarmIntelligenceView({ snapshot }: { snapshot: GridiumSnapshot }) {
  const accounts = snapshot.accounts
  const revisions = accounts.map(a => `${a.id}:${a.panelAnalytics?.revision ?? 0}`).join('|')
  const summary = useMemo(() => farmOverview(accounts), [revisions])
  const [selected, setSelected] = useState('all')
  const visibleItems = summary.items.filter(item => selected === 'all' || item.accounts[accounts.findIndex(a => String(a.id) === selected)] > 0)
  const tokenByAccount = accounts.map((account, index) => ({
    account, count: summary.items.filter(item => isBossToken(item.name)).reduce((sum, item) => sum + item.accounts[index], 0)
  }))
  const events: DropEvent[] = accounts.flatMap(account =>
    (account.panelAnalytics?.events ?? [])
      .filter(event => event.accountEvent === 'rare-item' && !isStone(event.label))
      .map(event => ({ ...event, accountId: account.id }))
  ).sort((a,b) => b.at - a.at).slice(0, 8)

  return <main class="farm-page">
    <header class="farm-hero poke-card">
      <div><span class="farm-kicker">✦ GRIDIIUM INTELLIGENCE</span><h1>Farm Intelligence</h1><p>O que suas 4 contas realmente conseguiram no farm.</p></div>
      <span class="farm-sync">◆ INVENTÁRIO DO SERVIDOR</span>
    </header>

    <section class="farm-kpis" aria-label="Resumo do farm">
      <div class="farm-kpi farm-primary"><span class="farm-kpi-icon">✦</span><div><small>BOSS TOKENS</small><strong>{number(summary.tokens)}</strong><span>registrados</span></div></div>
      <div class="farm-kpi"><span class="farm-kpi-icon">◆</span><div><small>OUTROS RAROS</small><strong>{number(summary.otherRare)}</strong><span>sem stones</span></div></div>
      <div class="farm-kpi"><span class="farm-kpi-icon">◉</span><div><small>CAPTURAS</small><strong>{compact(summary.captures)}</strong><span>4 contas</span></div></div>
      <div class="farm-kpi"><span class="farm-kpi-icon">◈</span><div><small>GOLD DE FARM</small><strong>{compact(summary.gold)}</strong><span>histórico salvo</span></div></div>
    </section>

    <section class="farm-account-grid" aria-label="Situação das contas">
      {accounts.map((account, index) => <article class="farm-account poke-card" key={account.id}>
        <div class="farm-account-head"><span class="farm-account-number">{account.id}</span><strong>CONTA {account.id}</strong></div>
        <span class={`farm-state ${account.status === 'offline' || account.status === 'crashed' ? 'problem' : account.status === 'ready' && account.huntProtocolStatus === 'live' ? 'live' : 'pending'}`}>
          <i />{farmConnectionLabel(account)}
        </span>
        <div class="farm-account-bottom"><span>Boss Tokens</span><b>{number(tokenByAccount[index]?.count ?? 0)}</b></div>
      </article>)}
    </section>

    <section class="farm-drops poke-card">
      <div class="farm-section-head">
        <div><h2>✦ Drops raros</h2><p>Histórico por item · apenas aumentos de estoque registrados · stones excluídas.</p></div>
        <label class="farm-filter">Conta <select value={selected} onChange={event => setSelected(event.currentTarget.value)}><option value="all">Todas</option>{accounts.map(a => <option key={a.id} value={String(a.id)}>Conta {a.id}</option>)}</select></label>
      </div>
      {visibleItems.length === 0
        ? <div class="farm-empty"><span>◇</span><strong>Nenhum item raro identificado</strong><p>Quando o servidor enviar um nome reconhecido e o estoque aumentar, o drop aparecerá aqui. Itens sem nome não são considerados raros por suposição.</p></div>
        : <div class="farm-item-grid">
          {visibleItems.map(item => <article class="farm-item" key={item.key}>
            <div class="farm-item-art">{item.iconUrl ? <img src={item.iconUrl} alt={item.name} loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} /> : <span class="farm-art-placeholder" title="Imagem oficial ainda não identificada">✦</span>}</div>
            <div class="farm-item-text"><strong>{item.name}</strong><small>{item.iconUrl ? 'Imagem oficial' : 'Sprite indisponível'}</small><div class="farm-item-accounts">{accounts.map((a,i) => <span key={a.id} class={item.accounts[i] > 0 ? 'has' : ''}>C{a.id} {number(item.accounts[i])}</span>)}</div></div>
            <b class="farm-item-total">× {number(selected === 'all' ? item.quantity : item.accounts[accounts.findIndex(a => String(a.id) === selected)] || 0)}</b>
          </article>)}
        </div>}
    </section>

    <section class="farm-two-col">
      <div class="farm-mini poke-card">
        <h2>Tokens por conta</h2><p>Distribuição dos Boss Tokens registrados</p>
        {tokenByAccount.map(({account,count}) => <div class="farm-bar-row" key={account.id}><strong>C{account.id}</strong><div class="farm-bar-track"><span style={{ width: `${summary.tokens ? count / summary.tokens * 100 : 0}%` }} /></div><b>{number(count)}</b></div>)}
      </div>
      <div class="farm-mini poke-card">
        <h2>Últimos drops</h2><p>Eventos confirmados pelo rastreador</p>
        {events.length
          ? <div class="farm-event-list">{events.map((event,i) => <div class="farm-event" key={`${event.accountId}-${event.at}-${i}`}><time>{new Date(event.at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo'})}</time><span>Conta {event.accountId}</span><b>{event.label}</b></div>)}</div>
          : <p class="farm-quiet">Ainda não há eventos de drops raros identificados.</p>}
      </div>
    </section>
    <details class="farm-diagnostics poke-card">
      <summary>Diagnóstico de itens não identificados <span>{summary.unidentified.length} entradas</span></summary>
      <p>Estes são saldos atuais de itens sem nome no protocolo, <strong>não</strong> drops raros contabilizados. Para mostrar o nome e a imagem real, o servidor precisa fornecer um catálogo correspondente.</p>
      <div class="farm-unidentified">{summary.unidentified.slice(0, 32).map((row,i) => <span key={i}>Conta {row.accountId} · ID #{row.itemId} · estoque {number(row.quantity)}</span>)}</div>
    </details>
  </main>
}
