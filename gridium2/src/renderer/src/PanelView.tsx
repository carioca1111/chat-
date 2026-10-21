import type { ComponentChildren } from 'preact'
import { useMemo } from 'preact/hooks'
import type { AccountSnapshot, GridiumSnapshot, PanelAnalyticsSnapshot, PanelEventSnapshot, PanelRareItemSnapshot } from '../../shared/contracts'

const EMPTY: PanelAnalyticsSnapshot = {
  revision: 0,
  sessionStartedAt: 0,
  capturesTotal: 0,
  capturesLastHour: 0,
  capturesByPotency: [0,0,0,0,0],
  noteBands: [0,0,0,0,0,0,0,0],
  note35Plus: 0,
  shiniesSeen: null,
  shiniesCaught: 0,
  rareItems: [],
  rareItemsTotal: 0,
  lastCaptureAt: null,
  events: []
}

export function PanelView({ snapshot }: { snapshot: GridiumSnapshot }) {
  const accounts = snapshot.accounts
  const analytics = accounts.map((account) => account.panelAnalytics ?? EMPTY)
  const total = useMemo(() => combine(analytics), [analytics.map((row) => row.revision).join('|')])
  const online = accounts.filter((account) => account.status === 'ready').length
  const accountBars = accounts.map((account) => ({ account, value: account.panelAnalytics?.capturesLastHour ?? 0 }))
  const rare = combineRare(analytics)
  const events = combineEvents(accounts)

  return <main class="panel-page">
    <section class="panel-hero poke-card">
      <div>
        <span class="panel-kicker">▥ PAINEL ANALYTICS</span>
        <h1>VISÃO GERAL DAS 4 CONTAS</h1>
        <p>Capturas, potência, nota oficial, shinies e itens confirmados pelo estado do servidor.</p>
      </div>
      <span class="panel-live"><i class="status-ok" /> SERVIDOR · {online}/4 ONLINE</span>
    </section>

    <section class="panel-metrics">
      <PanelMetric icon="●" label="CONTAS ONLINE" value={`${online}/4`} sub="sessões ativas" tone="green" />
      <PanelMetric icon="◉" label="CAPTURAS/H" value={fmt(total.capturesLastHour)} sub="últimos 60 min" tone="cyan" />
      <PanelMetric icon="⌁" label="CAPTURAS" value={fmt(total.capturesTotal)} sub="sessão atual" tone="purple" />
      <PanelMetric icon="★" label="NOTA ≥ 3,5" value={fmt(total.note35Plus)} sub="nota oficial do servidor" tone="gold" />
      <PanelMetric icon="✦" label="SHINYS VISTOS" value={total.shiniesSeen === null ? '—' : fmt(total.shiniesSeen)} sub={total.shiniesSeen === null ? 'evento ainda não exposto' : 'contador do servidor'} tone="pink" />
      <PanelMetric icon="✧" label="SHINYS PEGOS" value={fmt(total.shiniesCaught)} sub="captura confirmada" tone="pink" />
      <PanelMetric icon="◆" label="ITENS RAROS" value={fmt(total.rareItemsTotal)} sub="aumentos no inventário" tone="gold" />
    </section>

    <section class="panel-account-grid">
      {accounts.map((account) => <AccountPanel account={account} key={account.id} />)}
    </section>

    <section class="panel-chart-grid">
      <ChartCard title="CAPTURAS POR POTÊNCIA" subtitle={`${fmt(total.capturesTotal)} capturas confirmadas`}>
        <ColumnChart labels={['P1','P2','P3','P4','P5']} values={total.capturesByPotency} classes={['p1','p2','p3','p4','p5']} />
      </ChartCard>
      <ChartCard title="DISTRIBUIÇÃO DE NOTAS" subtitle={`${fmt(total.note35Plus)} capturas com nota oficial ≥ 3,5`}>
        <ColumnChart labels={['0–0,99','1–1,99','2–2,99','3–3,49','3,5–3,99','4–4,49','4,5–4,99','5,0+']} values={total.noteBands} classes={['q0','q1','q2','q3','q35','q4','q45','q5']} />
      </ChartCard>
      <ChartCard title="SHINYS VISTOS × PEGOS" subtitle={total.shiniesSeen === null ? 'Vistos aguardando evento explícito do servidor' : `${ratio(total.shiniesCaught, total.shiniesSeen)}% de conversão`}>
        <ColumnChart labels={['Vistos','Pegos']} values={[total.shiniesSeen ?? 0,total.shiniesCaught]} classes={['seen','caught']} unknown={[total.shiniesSeen === null,false]} />
      </ChartCard>
      <ChartCard title="ITENS RAROS RECEBIDOS" subtitle="Somente aumentos de inventário com nomes raros conhecidos">
        {rare.length ? <ColumnChart labels={rare.map((item) => short(item.name))} values={rare.map((item) => item.quantity)} classes={rare.map((_,index) => `rare r${index}`)} /> : <EmptyChart text="Nenhum item raro confirmado nesta sessão" />}
      </ChartCard>
      <ChartCard title="CAPTURAS POR CONTA" subtitle="Últimos 60 minutos">
        <ColumnChart labels={accountBars.map((row) => `Conta ${row.account.id}`)} values={accountBars.map((row) => row.value)} classes={['account a1','account a2','account a3','account a4']} />
      </ChartCard>
      <ChartCard title="ATIVIDADE RECENTE" subtitle="Eventos confirmados pelo servidor" wide>
        <div class="panel-events">{events.length ? events.slice(0,8).map((event) => <div class="panel-event" key={`${event.accountId}-${event.at}-${event.label}`}>
          <time>{clock(event.at)}</time><b>Conta {event.accountId}</b><span>{event.label}</span><small>{event.detail}</small>
        </div>) : <div class="panel-event-empty">Aguardando as primeiras capturas e drops da sessão.</div>}</div>
      </ChartCard>
    </section>

    <section class="panel-note poke-card">
      <b>LEITURA SEM NÚMEROS INVENTADOS</b>
      <span>Captura = novo ID de Pokémon recebido depois do estado inicial. P1–P5 e a nota usam os campos oficiais do registro capturado; a nota é lida de “nota” e não de “quality”. A distribuição contabiliza desde 0. Itens raros usam aumentos confirmados no inventário; compras/transferências ainda podem aparecer como recebimentos. “Shiny visto” só será preenchido quando o servidor expuser um contador/evento explícito.</span>
    </section>
  </main>
}

function AccountPanel({ account }: { account: AccountSnapshot }) {
  const profile = account.huntProfile
  const stats = account.panelAnalytics ?? EMPTY
  const ready = account.status === 'ready'
  const name = profile?.speciesName || (profile?.speciesId !== undefined ? `Espécie #${profile.speciesId}` : 'Pokémon ativo')
  return <article class={`panel-account poke-card ${ready ? 'online' : 'offline'}`}>
    <div class="panel-account-head"><span class="panel-account-number">{account.id}</span><b>CONTA {account.id}</b><small><i class={`status-dot ${account.status}`} /> {ready ? 'ONLINE' : 'OFFLINE'}</small></div>
    <div class="panel-pokemon"><div class="panel-pokeball">◉</div><div><strong>{name}</strong><span>Nv {profile?.pokemonLevel ?? '—'} · P{profile?.potency ?? '—'}{profile?.shiny ? ' · ✦ SHINY' : ''}</span><small>{profile?.huntSlug ? `Hunt: ${profile.huntSlug}` : 'Hunt aguardando servidor'}</small></div></div>
    <div class="panel-account-stats"><Stat label="CAPTURAS/H" value={fmt(stats.capturesLastHour)} /><Stat label="CAPTURAS" value={fmt(stats.capturesTotal)} /><Stat label="NOTA ≥3,5" value={fmt(stats.note35Plus)} /><Stat label="SHINY" value={fmt(stats.shiniesCaught)} /></div>
    <div class="panel-account-foot"><span>Última captura</span><b>{stats.lastCaptureAt ? relative(stats.lastCaptureAt) : '—'}</b></div>
  </article>
}

function PanelMetric({ icon,label,value,sub,tone }: { icon:string; label:string; value:string; sub:string; tone:string }) {
  return <div class={`panel-metric poke-card ${tone}`}><span class="panel-metric-icon">{icon}</span><div><small>{label}</small><b>{value}</b><em>{sub}</em></div></div>
}

function ChartCard({ title,subtitle,children,wide=false }: { title:string; subtitle:string; children:ComponentChildren; wide?:boolean }) {
  return <article class={`panel-chart poke-card ${wide ? 'wide' : ''}`}><header><div><b>{title}</b><small>{subtitle}</small></div></header>{children}</article>
}

function ColumnChart({ labels,values,classes,unknown=[] }: { labels:string[]; values:number[]; classes:string[]; unknown?:boolean[] }) {
  const max = Math.max(1,...values)
  return <div class="column-chart">{labels.map((label,index) => {
    const value = values[index] ?? 0
    const height = Math.max(value > 0 ? 8 : 2, Math.round((value / max) * 100))
    return <div class="column-slot" key={`${label}-${index}`}><span class="column-value">{unknown[index] ? '—' : fmt(value)}</span><div class="column-track"><i class={`column ${classes[index] || ''} ${unknown[index] ? 'unknown' : ''}`} style={{height:`${height}%`}} /></div><b>{label}</b></div>
  })}</div>
}

function EmptyChart({ text }: { text:string }) { return <div class="panel-empty-chart"><span>◇</span><b>{text}</b></div> }
function Stat({ label,value }: { label:string; value:string }) { return <div><small>{label}</small><b>{value}</b></div> }

function combine(rows: PanelAnalyticsSnapshot[]): PanelAnalyticsSnapshot {
  const seenRows = rows.map((row) => row.shiniesSeen).filter((value): value is number => value !== null)
  const noteBands = [0,1,2,3,4,5,6,7].map((index) => rows.reduce((sum,row) => sum + row.noteBands[index],0)) as [number,number,number,number,number,number,number,number]
  return {
    revision: rows.reduce((sum,row) => sum + row.revision,0),
    sessionStartedAt: Math.min(...rows.filter((row) => row.sessionStartedAt > 0).map((row) => row.sessionStartedAt), Date.now()),
    capturesTotal: rows.reduce((sum,row) => sum + row.capturesTotal,0),
    capturesLastHour: rows.reduce((sum,row) => sum + row.capturesLastHour,0),
    capturesByPotency: [0,1,2,3,4].map((index) => rows.reduce((sum,row) => sum + row.capturesByPotency[index],0)) as [number,number,number,number,number],
    noteBands,
    note35Plus: noteBands.slice(4).reduce((sum,value) => sum + value,0),
    shiniesSeen: seenRows.length === rows.length && rows.length > 0 ? seenRows.reduce((sum,value) => sum + value,0) : null,
    shiniesCaught: rows.reduce((sum,row) => sum + row.shiniesCaught,0),
    rareItems: [],
    rareItemsTotal: rows.reduce((sum,row) => sum + row.rareItemsTotal,0),
    lastCaptureAt: Math.max(0,...rows.map((row) => row.lastCaptureAt ?? 0)) || null,
    events: []
  }
}

function combineRare(rows: PanelAnalyticsSnapshot[]): PanelRareItemSnapshot[] {
  const map = new Map<string, PanelRareItemSnapshot>()
  for (const row of rows) for (const item of row.rareItems) {
    const previous = map.get(item.itemId)
    map.set(item.itemId, { ...item, quantity: item.quantity + (previous?.quantity ?? 0) })
  }
  return [...map.values()].sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).slice(0,6)
}

function combineEvents(accounts: AccountSnapshot[]): Array<PanelEventSnapshot & { accountId:number }> {
  const out: Array<PanelEventSnapshot & { accountId:number }> = []
  for (const account of accounts) for (const event of account.panelAnalytics?.events ?? []) out.push({ ...event, accountId: account.id })
  return out.sort((a,b) => b.at - a.at)
}

function fmt(value:number):string { return Math.round(value).toLocaleString('pt-BR') }
function ratio(caught:number, seen:number):number { return seen > 0 ? Math.round((caught / seen) * 100) : 0 }
function short(value:string):string { return value.length > 13 ? `${value.slice(0,12)}…` : value }
function clock(at:number):string { return new Date(at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) }
function relative(at:number):string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (seconds < 60) return `${seconds}s atrás`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min atrás`
  return `${Math.floor(minutes/60)} h atrás`
}
