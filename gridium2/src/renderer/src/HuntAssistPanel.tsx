import { useEffect, useMemo, useState } from 'preact/hooks'
import type { AccountSnapshot, GridiumSnapshot, HuntPotionSnapshot } from '../../shared/contracts'
import { itemSpriteUrl } from './item-visuals'
import { PokemonSprite } from './PokemonSprite'

type ViewMode = 'individual' | 'all' | 'group'
type Goals = Record<string, number>
const GOAL_STORAGE = 'gridium2-hunt-capture-goals-v1'
const HOUR = 60 * 60 * 1000

export function HuntAssistPanel({ snapshot }: { snapshot: GridiumSnapshot }) {
  const [mode, setMode] = useState<ViewMode>('individual')
  const [joinSameHunt, setJoinSameHunt] = useState(true)
  const [goals, setGoals] = useState<Goals>(() => {
    try { return JSON.parse(localStorage.getItem(GOAL_STORAGE) || '{}') as Goals } catch { return {} }
  })
  const selected = snapshot.accounts.find((account) => account.id === snapshot.selectedAccount)
  const selectedHunt = huntKey(selected)
  const sameHunt = selectedHunt ? snapshot.accounts.filter((account) => huntKey(account) === selectedHunt) : []
  const groupAvailable = sameHunt.length >= 2

  useEffect(() => {
    if (mode === 'group' && (!joinSameHunt || !groupAvailable)) setMode('individual')
  }, [mode, joinSameHunt, groupAvailable])

  if (!selected) return <section class="hunt-assist poke-card"><div class="ha-loading">Preparando Hunt Intelligence…</div></section>

  if (mode === 'all') {
    return <section class="hunt-assist poke-card">
      <AssistHeader mode={mode} setMode={setMode} joinSameHunt={joinSameHunt} setJoinSameHunt={setJoinSameHunt} groupAvailable={groupAvailable} sameHuntCount={sameHunt.length} />
      <div class="ha-all-grid">{snapshot.accounts.map((account) => <AccountMiniCard account={account} key={account.id} onSelect={() => { void window.gridium2.selectAccount(account.id); setMode('individual') }} />)}</div>
    </section>
  }

  const accounts = mode === 'group' && joinSameHunt && groupAvailable ? sameHunt : [selected]
  const aggregate = aggregateAccounts(accounts)
  const goalKey = mode === 'group' ? `group:${selectedHunt}` : `account:${selected.id}:${selectedHunt || 'sem-hunt'}`
  const goal = Math.max(1, Math.floor(goals[goalKey] ?? 1000))
  const remaining = Math.max(0, goal - aggregate.capturesTotal)
  const etaGoalHours = aggregate.capturesPerHour > 0 ? remaining / aggregate.capturesPerHour : Infinity
  const etaCenterHours = aggregate.potionsPerHour > 0 ? aggregate.potionStock / aggregate.potionsPerHour : Infinity
  const progress = Math.min(100, aggregate.capturesTotal / goal * 100)
  const health = huntHealth(aggregate.capturesPerHour, etaCenterHours, aggregate.sessionHours)
  const potion = aggregate.potionItems[0]
  const timeline = buildTimeline(remaining, etaGoalHours, aggregate.killsEstimatedTotal, aggregate.killsPerHour, etaCenterHours)

  const changeGoal = (value: number): void => {
    const next = Math.max(1, Math.min(10_000_000, Math.floor(value || 1)))
    setGoals((current) => {
      const updated = { ...current, [goalKey]: next }
      try { localStorage.setItem(GOAL_STORAGE, JSON.stringify(updated)) } catch { /* local settings only */ }
      return updated
    })
  }

  return <section class={`hunt-assist poke-card ${mode === 'group' ? 'group-mode' : ''}`}>
    <AssistHeader mode={mode} setMode={setMode} joinSameHunt={joinSameHunt} setJoinSameHunt={setJoinSameHunt} groupAvailable={groupAvailable} sameHuntCount={sameHunt.length} />
    <div class="ha-dashboard">
      <div class="ha-identity">
        <div class="ha-sprites">{accounts.slice(0,4).map((account) => <PokemonSprite speciesId={account.huntProfile?.speciesId} name={account.huntProfile?.speciesName || `Conta ${account.id}`} className="ha-pokemon" key={account.id} />)}</div>
        <div class="ha-id-copy"><small>{mode === 'group' ? `${accounts.length} CONTAS JUNTAS` : `CONTA ${selected.id}`}</small><b>{selectedHunt || selected.huntProfile?.speciesName || 'Hunt aguardando servidor'}</b><span>{formatDuration(aggregate.sessionHours)} de sessão · <em class={`ha-health ${health.className}`}>{health.label}</em></span></div>
      </div>

      <div class="ha-core-stats">
        <CompactStat label="CAPTURAS" value={formatNumber(aggregate.capturesTotal)} sub={`${formatRate(aggregate.capturesPerHour)}/h`} accent />
        <CompactStat label="ABATES ESTIM." value={formatNumber(aggregate.killsEstimatedTotal)} sub={`${formatRate(aggregate.killsPerHour)}/h`} />
        <CompactStat label="FALTAM" value={formatNumber(remaining)} sub={`ETA ${formatEta(etaGoalHours)}`} />
        <CompactStat label="CENTRO" value={formatEta(etaCenterHours)} sub={aggregate.potionsPerHour > 0 ? `${formatRate(aggregate.potionsPerHour)} poções/h` : 'sustain estável'} />
      </div>

      <div class="ha-goal-block">
        <div class="ha-goal-top"><span>META DE CAPTURA</span><label><input type="number" min="1" max="10000000" value={goal} onChange={(event) => changeGoal(Number(event.currentTarget.value))} /></label></div>
        <div class="ha-progress"><i style={{ width: `${progress}%` }} /></div>
        <div class="ha-progress-copy"><b>{progress.toFixed(progress >= 10 ? 0 : 1)}%</b><span>{formatNumber(aggregate.capturesTotal)} / {formatNumber(goal)}</span></div>
      </div>

      <div class="ha-potion-block">
        <span class="ha-item-sprite"><span>▥</span>{potion && itemSpriteUrl(potion.name) && <img src={itemSpriteUrl(potion.name)} alt={potion.name} />}</span>
        <div><small>POÇÕES</small><b>{formatNumber(aggregate.potionStock)} <i>estoque</i></b><span>{formatNumber(aggregate.potionsUsedTotal)} usadas · {potion?.name || 'aguardando inventário'}</span></div>
      </div>

      <div class="ha-potency">
        {aggregate.capturesByPotency.map((value,index) => <span class={`p${index + 1}`} key={index}><small>P{index + 1}</small><b>{formatNumber(value)}</b></span>)}
        <span class="shiny-seen"><small>SHINY VISTO</small><b>✦ {formatNumber(aggregate.shiniesSeen)}</b></span>
        <span class="shiny-caught"><small>SHINY PEGO</small><b>★ {formatNumber(aggregate.shiniesCaught)}</b></span>
      </div>

      <div class="ha-timeline"><small>PRÓXIMOS</small>{timeline.map((event,index) => <span key={index}><b>{event.when}</b>{event.label}</span>)}</div>
    </div>

    {mode === 'group' && <div class="ha-group-contrib">{accounts.map((account) => {
      const total = Math.max(1, aggregate.capturesTotal)
      const percent = account.huntSession.capturesTotal / total * 100
      return <button key={account.id} onClick={() => void window.gridium2.selectAccount(account.id)}><b>C{account.id}</b><i><em style={{ width: `${percent}%` }} /></i><span>{percent.toFixed(0)}% · {formatNumber(account.huntSession.capturesTotal)} cap</span></button>
    })}</div>}
  </section>
}

function AssistHeader({ mode, setMode, joinSameHunt, setJoinSameHunt, groupAvailable, sameHuntCount }: {
  mode: ViewMode; setMode: (mode: ViewMode) => void; joinSameHunt: boolean; setJoinSameHunt: (value: boolean) => void; groupAvailable: boolean; sameHuntCount: number
}) {
  return <div class="ha-header">
    <div class="ha-title"><span>⚔</span><div><b>HUNT CONTROL</b><small>captura · sustain · metas · projeções</small></div></div>
    <div class="ha-modes"><button class={mode === 'individual' ? 'active' : ''} onClick={() => setMode('individual')}>INDIVIDUAL</button><button class={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>4 CONTAS</button><button class={mode === 'group' ? 'active' : ''} disabled={!joinSameHunt || !groupAvailable} onClick={() => setMode('group')}>GRUPO {groupAvailable ? `×${sameHuntCount}` : ''}</button></div>
    <label class={`ha-join ${groupAvailable ? 'available' : ''}`} title="Quando duas ou mais contas estão na mesma Hunt, soma as estatísticas delas em um único painel."><input type="checkbox" checked={joinSameHunt} onChange={(event) => setJoinSameHunt(event.currentTarget.checked)} /><span /> <b>JUNTAR MESMA HUNT</b><small>{groupAvailable ? `${sameHuntCount} detectadas` : 'nenhum grupo agora'}</small></label>
  </div>
}

function AccountMiniCard({ account, onSelect }: { account: AccountSnapshot; onSelect: () => void }) {
  const session = account.huntSession
  const captureRate = normalizedRate(session.capturesTotal, session.capturesLastHour, session.sessionStartedAt)
  const killRate = normalizedRate(session.killsEstimatedTotal, session.killsEstimatedLastHour, session.sessionStartedAt)
  const potionRate = normalizedRate(session.potionsUsedTotal, session.potionsUsedLastHour, session.sessionStartedAt)
  const center = potionRate > 0 ? session.potionStock / potionRate : Infinity
  return <button class={`ha-account-mini ${account.huntProtocolStatus === 'live' ? 'live' : ''}`} onClick={onSelect}>
    <PokemonSprite speciesId={account.huntProfile?.speciesId} name={account.huntProfile?.speciesName || `Conta ${account.id}`} className="ha-mini-pokemon" />
    <div class="ha-mini-head"><b>CONTA {account.id}</b><small>{huntKey(account) || 'aguardando Hunt'}</small></div>
    <div class="ha-mini-values"><span><small>CAP</small><b>{formatNumber(session.capturesTotal)}</b><em>{formatRate(captureRate)}/h</em></span><span><small>ABATES</small><b>{formatNumber(session.killsEstimatedTotal)}</b><em>{formatRate(killRate)}/h</em></span><span><small>POÇÕES</small><b>{formatNumber(session.potionStock)}</b><em>centro {formatEta(center)}</em></span><span class="mini-shiny"><small>SHINY</small><b>✦{session.shiniesSeen} / ★{session.shiniesCaught}</b><em>P5 {session.capturesByPotency[4]}</em></span></div>
  </button>
}

function CompactStat({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return <div class={`ha-stat ${accent ? 'accent' : ''}`}><small>{label}</small><b>{value}</b><span>{sub}</span></div>
}

function aggregateAccounts(accounts: AccountSnapshot[]) {
  const now = Date.now()
  const capturesByPotency: [number,number,number,number,number] = [0,0,0,0,0]
  const potionMap = new Map<string, HuntPotionSnapshot>()
  let capturesTotal = 0, capturesPerHour = 0, killsEstimatedTotal = 0, killsPerHour = 0
  let potionStock = 0, potionsUsedTotal = 0, potionsPerHour = 0, shiniesSeen = 0, shiniesCaught = 0
  let sessionStartedAt = now
  for (const account of accounts) {
    const s = account.huntSession
    capturesTotal += s.capturesTotal
    capturesPerHour += normalizedRate(s.capturesTotal, s.capturesLastHour, s.sessionStartedAt, now)
    killsEstimatedTotal += s.killsEstimatedTotal
    killsPerHour += normalizedRate(s.killsEstimatedTotal, s.killsEstimatedLastHour, s.sessionStartedAt, now)
    potionStock += s.potionStock
    potionsUsedTotal += s.potionsUsedTotal
    potionsPerHour += normalizedRate(s.potionsUsedTotal, s.potionsUsedLastHour, s.sessionStartedAt, now)
    shiniesSeen += s.shiniesSeen
    shiniesCaught += s.shiniesCaught
    sessionStartedAt = Math.min(sessionStartedAt, s.sessionStartedAt)
    capturesByPotency[0] += s.capturesByPotency[0]
    capturesByPotency[1] += s.capturesByPotency[1]
    capturesByPotency[2] += s.capturesByPotency[2]
    capturesByPotency[3] += s.capturesByPotency[3]
    capturesByPotency[4] += s.capturesByPotency[4]
    for (const item of s.potionItems) {
      const key = item.name.toLowerCase()
      const previous = potionMap.get(key)
      potionMap.set(key, { itemId: item.itemId, name: item.name, quantity: (previous?.quantity || 0) + item.quantity, used: (previous?.used || 0) + item.used })
    }
  }
  return {
    capturesTotal, capturesPerHour, killsEstimatedTotal, killsPerHour, potionStock, potionsUsedTotal, potionsPerHour,
    capturesByPotency, shiniesSeen, shiniesCaught, sessionHours: Math.max(0, (now - sessionStartedAt) / HOUR),
    potionItems: [...potionMap.values()].sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
  }
}

function normalizedRate(total: number, lastHour: number, startedAt: number, now = Date.now()): number {
  const elapsedHours = Math.max(1 / 60, (now - startedAt) / HOUR)
  return elapsedHours < 1 ? total / elapsedHours : lastHour
}

function huntKey(account?: AccountSnapshot): string {
  return String(account?.huntProfile?.huntSlug || account?.huntSession.huntSlug || '').trim()
}

function huntHealth(captureRate: number, centerHours: number, sessionHours: number): { label: string; className: string } {
  if (sessionHours > .25 && captureRate <= 0) return { label: 'SEM CAPTURAS', className: 'bad' }
  if (Number.isFinite(centerHours) && centerHours <= .25) return { label: 'CENTRO LOGO', className: 'bad' }
  if (Number.isFinite(centerHours) && centerHours <= .75) return { label: 'ATENÇÃO', className: 'warn' }
  return { label: 'HUNT ESTÁVEL', className: 'good' }
}

function buildTimeline(remaining: number, goalEta: number, kills: number, killsPerHour: number, centerEta: number): Array<{ when: string; label: string }> {
  const rows: Array<{ hours: number; when: string; label: string }> = []
  if (remaining === 0) rows.push({ hours: 0, when: 'AGORA', label: 'meta concluída' })
  else if (Number.isFinite(goalEta)) rows.push({ hours: goalEta, when: formatEta(goalEta), label: 'meta de capturas' })
  const nextKills = Math.ceil((kills + 1) / 500) * 500
  if (killsPerHour > 0) {
    const eta = Math.max(0, (nextKills - kills) / killsPerHour)
    rows.push({ hours: eta, when: formatEta(eta), label: `${formatNumber(nextKills)} abates` })
  }
  if (Number.isFinite(centerEta)) rows.push({ hours: centerEta, when: formatEta(centerEta), label: 'retorno estimado ao Centro' })
  if (!rows.length) rows.push({ hours: Infinity, when: '—', label: 'coletando ritmo real' })
  return rows.sort((a,b) => a.hours - b.hours).slice(0,3)
}

function formatEta(hours: number): string {
  if (!Number.isFinite(hours)) return '—'
  if (hours <= 0) return 'agora'
  const minutes = Math.max(1, Math.round(hours * 60))
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60), m = minutes % 60
  return `${h}h${m ? String(m).padStart(2,'0') : ''}`
}
function formatDuration(hours: number): string { return formatEta(hours) === 'agora' ? '<1m' : formatEta(hours) }
function formatNumber(value: number): string { return Math.max(0, Math.round(value)).toLocaleString('pt-BR') }
function formatRate(value: number): string { return value >= 100 ? Math.round(value).toLocaleString('pt-BR') : value.toFixed(value >= 10 ? 1 : 2).replace('.', ',') }
