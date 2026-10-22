import type { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type {
  AccountSnapshot,
  GridiumSnapshot,
  PanelAnalyticsSnapshot,
  PanelEventSnapshot,
  PanelGranularity,
  PanelHistoryBucket,
  PanelRareItemSnapshot
} from '../../shared/contracts'
import './panel-history.css'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const BRASILIA_TIME_ZONE = 'America/Sao_Paulo'
const BRASILIA_UTC_OFFSET_MS = -3 * HOUR

type HistoryMetric = 'pokemonXp' | 'captures' | 'goldEarned' | 'marketCoins' | 'marketGems' | 'rmtBrl'

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
  pokemonXpTotal: 0,
  pokemonXpLastHour: 0,
  goldEarnedTotal: 0,
  goldEarnedLastHour: 0,
  marketCoinsRevenue: 0,
  marketGemsRevenue: 0,
  rmtBrlRevenue: 0,
  historyMinute: [],
  historyHour: [],
  historyDay: [],
  events: []
}

export function PanelView({ snapshot }: { snapshot: GridiumSnapshot }) {
  const accounts = snapshot.accounts
  const analytics = accounts.map((account) => account.panelAnalytics ?? EMPTY)
  const revisions = analytics.map((row) => row.revision).join('|')
  const total = useMemo(() => combine(analytics), [revisions])
  const [granularity, setGranularity] = useState<PanelGranularity>('hour')
  const online = accounts.filter((account) => account.status === 'ready').length
  const accountBars = accounts.map((account) => ({ account, value: account.panelAnalytics?.capturesLastHour ?? 0 }))
  const rare = combineRare(analytics)
  const events = combineEvents(accounts)
  const xpSeries = useMemo(() => buildSeries(analytics, granularity, 'pokemonXp'), [revisions, granularity])
  const captureSeries = useMemo(() => buildSeries(analytics, granularity, 'captures'), [revisions, granularity])
  const goldSeries = useMemo(() => buildSeries(analytics, granularity, 'goldEarned'), [revisions, granularity])
  const visibleGoldStart = goldSeries[0]?.at ?? 0
  const visibleGoldEnd = goldSeries.at(-1)?.at ?? Date.now()
  const goldByAccount = accounts.map((account) => ({
    accountId: account.id,
    value: sumMetric(account.panelAnalytics ?? EMPTY, granularity, 'goldEarned', visibleGoldStart, visibleGoldEnd)
  }))

  return <main class="panel-page">
    <section class="panel-hero poke-card">
      <div>
        <span class="panel-kicker">▥ PAINEL ANALYTICS · HISTÓRICO PERSISTENTE</span>
        <h1>VISÃO GERAL DAS 4 CONTAS</h1>
        <p>Dados compactos, persistentes e sincronizados pelo horário de Brasília.</p>
      </div>
      <span class="panel-live"><i class="status-ok" /> SERVIDOR · {online}/4 ONLINE</span>
    </section>

    <section class="panel-metrics">
      <PanelMetric icon="●" label="CONTAS ONLINE" value={`${online}/4`} sub="sessões ativas" tone="green" />
      <PanelMetric icon="↗" label="XP/H POKÉMON" value={compact(total.pokemonXpLastHour)} sub="últimos 60 min" tone="cyan" />
      <PanelMetric icon="◉" label="CAPTURAS/H" value={fmt(total.capturesLastHour)} sub="últimos 60 min" tone="cyan" />
      <PanelMetric icon="⌁" label="CAPTURAS" value={fmt(total.capturesTotal)} sub="histórico salvo" tone="purple" />
      <PanelMetric icon="★" label="NOTA ≥ 3,5" value={fmt(total.note35Plus)} sub="nota oficial" tone="gold" />
      <PanelMetric icon="✦" label="SHINYS VISTOS" value={total.shiniesSeen === null ? '—' : fmt(total.shiniesSeen)} sub={total.shiniesSeen === null ? 'evento não exposto' : 'contador do servidor'} tone="pink" />
      <PanelMetric icon="✧" label="SHINYS PEGOS" value={fmt(total.shiniesCaught)} sub="captura confirmada" tone="pink" />
      <PanelMetric icon="◆" label="ITENS RAROS" value={fmt(total.rareItemsTotal)} sub="histórico salvo" tone="gold" />
      <PanelMetric icon="$" label="GOLD GANHO" value={compact(total.goldEarnedTotal)} sub={`${compact(total.goldEarnedLastHour)} na última hora`} tone="green" />
    </section>

    <section class="panel-account-grid">
      {accounts.map((account) => <AccountPanel account={account} key={account.id} />)}
    </section>

    <section class="panel-timeseries-grid">
      <ChartCard title="XP DO POKÉMON" subtitle={`${granularityLabel(granularity)} · horário de Brasília`} wide>
        <ChartToolbar granularity={granularity} onGranularity={setGranularity} />
        <LineChart points={xpSeries} valueFormatter={compact} tone="xp" />
      </ChartCard>
      <ChartCard title="POKÉMONS CAPTURADOS" subtitle={`${granularityLabel(granularity)} · horário de Brasília`} wide>
        <ChartToolbar granularity={granularity} onGranularity={setGranularity} />
        <LineChart points={captureSeries} valueFormatter={fmt} tone="captures" />
      </ChartCard>
      <ChartCard title="GOLD GANHO" subtitle="4 contas somadas · batalha, Hunt, Market e qualquer aumento confirmado do saldo" wide>
        <div class="panel-money-toolbar single-source"><ChartToolbar granularity={granularity} onGranularity={setGranularity} /></div>
        <TrendColumnChart points={goldSeries} valueFormatter={compact} />
        <div class="panel-revenue-accounts">
          {goldByAccount.map((row) => <div key={row.accountId}><small>CONTA {row.accountId}</small><b>{compact(row.value)} Gold</b></div>)}
        </div>
        <div class="panel-money-note">Cada coluna mede <b>Gold ganho bruto</b> pelo aumento real de <b>estado.gold</b>. 1m mostra 60 minutos, 1h mostra 24 horas e 1d mostra 30 dias, sempre no horário de Brasília.</div>
      </ChartCard>
      <ChartCard title="CAPTURAS POR CONTA" subtitle="Últimos 60 minutos">
        <ColumnChart labels={accountBars.map((row) => `Conta ${row.account.id}`)} values={accountBars.map((row) => row.value)} classes={['account a1','account a2','account a3','account a4']} />
      </ChartCard>
    </section>

    <section class="panel-chart-grid">
      <ChartCard title="CAPTURAS POR POTÊNCIA" subtitle={`${fmt(total.capturesTotal)} capturas confirmadas`}>
        <ColumnChart labels={['P1','P2','P3','P4','P5']} values={total.capturesByPotency} classes={['p1','p2','p3','p4','p5']} />
      </ChartCard>
      <ChartCard title="DISTRIBUIÇÃO DE NOTAS" subtitle={`${fmt(total.note35Plus)} capturas com nota ≥ 3,5`}>
        <ColumnChart labels={['0–0,99','1–1,99','2–2,99','3–3,49','3,5–3,99','4–4,49','4,5–4,99','5,0+']} values={total.noteBands} classes={['q0','q1','q2','q3','q35','q4','q45','q5']} />
      </ChartCard>
      <ChartCard title="SHINYS VISTOS × PEGOS" subtitle={total.shiniesSeen === null ? 'Vistos aguardando evento explícito do servidor' : `${ratio(total.shiniesCaught, total.shiniesSeen)}% de conversão`}>
        <ColumnChart labels={['Vistos','Pegos']} values={[total.shiniesSeen ?? 0,total.shiniesCaught]} classes={['seen','caught']} unknown={[total.shiniesSeen === null,false]} />
      </ChartCard>
      <ChartCard title="ITENS RAROS RECEBIDOS" subtitle="Aumentos confirmados no inventário">
        {rare.length ? <ColumnChart labels={rare.map((item) => short(item.name))} values={rare.map((item) => item.quantity)} classes={rare.map((_,index) => `rare r${index}`)} /> : <EmptyChart text="Nenhum item raro confirmado" />}
      </ChartCard>
      <ChartCard title="ATIVIDADE RECENTE" subtitle="Capturas, drops e Market persistidos" wide>
        <div class="panel-events">{events.length ? events.slice(0,12).map((event) => <div class="panel-event" key={`${event.accountId}-${event.at}-${event.label}`}>
          <time>{clock(event.at)}</time><b>Conta {event.accountId}</b><span>{event.label}</span><small>{event.detail}</small>
        </div>) : <div class="panel-event-empty">Aguardando as primeiras atividades.</div>}</div>
      </ChartCard>
    </section>

    <section class="panel-note poke-card">
      <b>HISTÓRICO PERSISTENTE</b>
      <span>O painel restaura os dados após reiniciar o PC. As janelas exibem exatamente 60 minutos, 24 horas ou 30 dias e os rótulos seguem America/Sao_Paulo. O Gold é calculado por aumento positivo do saldo real; notas usam o campo oficial “nota”.</span>
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
    <div class="panel-pokemon panel-pokemon-text"><div><strong>{name}</strong><span>Nv {profile?.pokemonLevel ?? '—'} · P{profile?.potency ?? '—'}{profile?.shiny ? ' · ✦ SHINY' : ''}</span><small>{profile?.huntSlug ? `Hunt: ${profile.huntSlug}` : 'Hunt aguardando servidor'}</small></div></div>
    <div class="panel-account-stats"><Stat label="XP/H" value={compact(stats.pokemonXpLastHour)} /><Stat label="CAPTURAS/H" value={fmt(stats.capturesLastHour)} /><Stat label="GOLD/H" value={compact(stats.goldEarnedLastHour)} /><Stat label="NOTA ≥3,5" value={fmt(stats.note35Plus)} /></div>
    <div class="panel-account-foot"><span>Última captura</span><b>{stats.lastCaptureAt ? relative(stats.lastCaptureAt) : '—'}</b></div>
  </article>
}

function PanelMetric({ icon,label,value,sub,tone }: { icon:string; label:string; value:string; sub:string; tone:string }) {
  return <div class={`panel-metric poke-card ${tone}`}><span class="panel-metric-icon">{icon}</span><div><small>{label}</small><b>{value}</b><em>{sub}</em></div></div>
}

function ChartCard({ title,subtitle,children,wide=false }: { title:string; subtitle:string; children:ComponentChildren; wide?:boolean }) {
  return <article class={`panel-chart poke-card ${wide ? 'wide' : ''}`}><header><div><b>{title}</b><small>{subtitle}</small></div></header>{children}</article>
}

function ChartToolbar({ granularity, onGranularity }: { granularity: PanelGranularity; onGranularity: (value: PanelGranularity) => void }) {
  return <div class="panel-segmented timeframe">
    <button class={granularity === 'minute' ? 'active' : ''} onClick={() => onGranularity('minute')}>1m</button>
    <button class={granularity === 'hour' ? 'active' : ''} onClick={() => onGranularity('hour')}>1h</button>
    <button class={granularity === 'day' ? 'active' : ''} onClick={() => onGranularity('day')}>1d</button>
  </div>
}

function LineChart({ points, valueFormatter, tone }: { points: TimePoint[]; valueFormatter:(value:number)=>string; tone:'xp'|'captures' }) {
  const values = points.map((point) => point.value)
  const max = Math.max(1, ...values)
  const width = 1000
  const height = 230
  const padX = 24
  const padTop = 18
  const padBottom = 38
  const innerHeight = height - padTop - padBottom
  const coords = points.map((point, index) => ({
    x: points.length <= 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2),
    y: padTop + (1 - point.value / max) * innerHeight,
    ...point
  }))
  const path = coords.map((point,index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const tickEvery = Math.max(1, Math.floor(points.length / 6))
  return <div class={`panel-line-wrap ${tone}`}>
    <div class="panel-line-current"><small>ÚLTIMO</small><b>{valueFormatter(points.at(-1)?.value ?? 0)}</b></div>
    <svg class="panel-line-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
      {[0,.25,.5,.75,1].map((ratio) => <line class="line-grid" key={ratio} x1={padX} x2={width-padX} y1={padTop + ratio * innerHeight} y2={padTop + ratio * innerHeight} />)}
      <path class="line-area" d={`${path} L ${coords.at(-1)?.x ?? padX} ${padTop+innerHeight} L ${coords[0]?.x ?? padX} ${padTop+innerHeight} Z`} />
      <path class="line-path" d={path} />
      {coords.map((point,index) => <circle key={point.at} class="line-point" cx={point.x} cy={point.y} r={index === coords.length-1 ? 5 : 2.6}><title>{`${timeLabel(point.at, point.granularity)} · ${valueFormatter(point.value)}`}</title></circle>)}
    </svg>
    <div class="panel-line-labels">{points.map((point,index) => (index % tickEvery === 0 || index === points.length - 1) ? <span key={point.at}>{timeLabel(point.at, point.granularity)}</span> : null)}</div>
  </div>
}

function TrendColumnChart({ points, valueFormatter }: { points: TimePoint[]; valueFormatter:(value:number)=>string }) {
  const max = Math.max(1, ...points.map((point) => point.value))
  const labelEvery = points[0]?.granularity === 'minute' ? 10 : points[0]?.granularity === 'hour' ? 4 : 5
  return <div class="trend-columns-scroll"><div class="trend-columns">
    {points.map((point,index) => {
      const previous = points[index - 1]?.value
      const trend = index === 0 ? 'neutral' : point.value > (previous ?? 0) ? 'up' : 'down'
      const height = Math.max(point.value > 0 ? 7 : 2, Math.round((point.value / max) * 100))
      const showTime = index % labelEvery === 0 || index === points.length - 1
      return <div class="trend-column-slot" key={point.at}>
        <div class="trend-column-track"><i class={`trend-column ${trend}`} style={{height:`${height}%`}}><title>{`${valueFormatter(point.value)} Gold`}</title></i></div>
        <b>{showTime ? timeLabel(point.at, point.granularity) : ''}</b>
      </div>
    })}
  </div></div>
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

interface TimePoint { at: number; value: number; granularity: PanelGranularity }

export function buildSeries(rows: PanelAnalyticsSnapshot[], granularity: PanelGranularity, metric: HistoryMetric, count = pointCount(granularity), now = Date.now()): TimePoint[] {
  const step = granularity === 'minute' ? MINUTE : granularity === 'hour' ? HOUR : DAY
  const end = bucketStart(now, granularity)
  const starts = Array.from({ length: count }, (_, index) => end - (count - 1 - index) * step)
  const totals = new Map(starts.map((at) => [at, 0]))
  for (const row of rows) {
    const history = historyOf(row, granularity)
    for (const bucket of history) {
      if (!totals.has(bucket.at)) continue
      totals.set(bucket.at, (totals.get(bucket.at) ?? 0) + Number(bucket[metric] || 0))
    }
  }
  return starts.map((at) => ({ at, value: totals.get(at) ?? 0, granularity }))
}

function pointCount(granularity: PanelGranularity): number { return granularity === 'minute' ? 60 : granularity === 'hour' ? 24 : 30 }
function historyOf(row: PanelAnalyticsSnapshot, granularity: PanelGranularity): PanelHistoryBucket[] {
  return granularity === 'minute' ? row.historyMinute : granularity === 'hour' ? row.historyHour : row.historyDay
}
function bucketStart(at: number, granularity: PanelGranularity): number {
  if (granularity === 'minute') return Math.floor(at / MINUTE) * MINUTE
  if (granularity === 'hour') return Math.floor(at / HOUR) * HOUR
  return Math.floor((at + BRASILIA_UTC_OFFSET_MS) / DAY) * DAY - BRASILIA_UTC_OFFSET_MS
}
function sumMetric(row: PanelAnalyticsSnapshot, granularity: PanelGranularity, metric: HistoryMetric, start: number, end: number): number {
  return historyOf(row, granularity).filter((bucket) => bucket.at >= start && bucket.at <= end).reduce((sum,bucket) => sum + Number(bucket[metric] || 0), 0)
}

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
    pokemonXpTotal: rows.reduce((sum,row) => sum + row.pokemonXpTotal,0),
    pokemonXpLastHour: rows.reduce((sum,row) => sum + row.pokemonXpLastHour,0),
    goldEarnedTotal: rows.reduce((sum,row) => sum + row.goldEarnedTotal,0),
    goldEarnedLastHour: rows.reduce((sum,row) => sum + row.goldEarnedLastHour,0),
    marketCoinsRevenue: rows.reduce((sum,row) => sum + row.marketCoinsRevenue,0),
    marketGemsRevenue: rows.reduce((sum,row) => sum + row.marketGemsRevenue,0),
    rmtBrlRevenue: rows.reduce((sum,row) => sum + row.rmtBrlRevenue,0),
    historyMinute: combineHistory(rows.map((row) => row.historyMinute)),
    historyHour: combineHistory(rows.map((row) => row.historyHour)),
    historyDay: combineHistory(rows.map((row) => row.historyDay)),
    events: []
  }
}

function combineHistory(groups: PanelHistoryBucket[][]): PanelHistoryBucket[] {
  const map = new Map<number, PanelHistoryBucket>()
  for (const group of groups) for (const item of group) {
    const current = map.get(item.at) ?? { at: item.at, pokemonXp: 0, captures: 0, goldEarned: 0, marketCoins: 0, marketGems: 0, rmtBrl: 0 }
    current.pokemonXp += item.pokemonXp
    current.captures += item.captures
    current.goldEarned += item.goldEarned
    current.marketCoins += item.marketCoins
    current.marketGems += item.marketGems
    current.rmtBrl += item.rmtBrl
    map.set(item.at, current)
  }
  return [...map.values()].sort((a,b) => a.at - b.at)
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
  for (const account of accounts) for (const event of account.panelAnalytics?.events ?? []) {
    if (event.accountEvent === 'rmt-sale') continue
    out.push({ ...event, accountId: account.id })
  }
  return out.sort((a,b) => b.at - a.at)
}

function fmt(value:number):string { return Math.round(value).toLocaleString('pt-BR') }
function compact(value:number):string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value/1_000_000_000).toLocaleString('pt-BR',{maximumFractionDigits:1})} bi`
  if (abs >= 1_000_000) return `${(value/1_000_000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mi`
  if (abs >= 1_000) return `${(value/1_000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`
  return value.toLocaleString('pt-BR',{maximumFractionDigits:1})
}
function ratio(caught:number, seen:number):number { return seen > 0 ? Math.round((caught / seen) * 100) : 0 }
function short(value:string):string { return value.length > 13 ? `${value.slice(0,12)}…` : value }
function clock(at:number):string { return new Date(at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:BRASILIA_TIME_ZONE}) }
function timeLabel(at:number, granularity:PanelGranularity):string {
  const date = new Date(at)
  if (granularity === 'minute') return date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:BRASILIA_TIME_ZONE})
  if (granularity === 'hour') return `${date.toLocaleTimeString('pt-BR',{hour:'2-digit',hour12:false,timeZone:BRASILIA_TIME_ZONE})}h`
  return date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',timeZone:BRASILIA_TIME_ZONE})
}
function granularityLabel(value:PanelGranularity):string { return value === 'minute' ? '1m por ponto · 60 minutos' : value === 'hour' ? '1h por ponto · 24 horas' : '1d por ponto · 30 dias' }
function relative(at:number):string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (seconds < 60) return `${seconds}s atrás`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min atrás`
  const hours = Math.floor(minutes/60)
  if (hours < 24) return `${hours} h atrás`
  return `${Math.floor(hours/24)} d atrás`
}
