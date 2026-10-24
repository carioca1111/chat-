import { useEffect, useState } from 'preact/hooks'
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

  if (!selected) return <section class="hunt-assist poke-card"><div class="ha-loading">Preparando Hunt Control…</div></section>

  if (mode === 'all') {
    return <section class="hunt-assist poke-card">
      <AssistHeader mode={mode} setMode={setMode} joinSameHunt={joinSameHunt} setJoinSameHunt={setJoinSameHunt} groupAvailable={groupAvailable} sameHuntCount={sameHunt.length} />
      <div class="ha-all-grid">{snapshot.accounts.map((account) => <AccountMiniCard account={account} key={account.id} onSelect={() => { void window.gridium2.selectAccount(account.id); setMode('individual') }} />)}</div>
    </section>
  }

  const accounts = mode === 'group' && joinSameHunt && groupAvailable ? sameHunt : [selected]
  const aggregate = aggregateAccounts(accounts)
  const baseGoalKey = mode === 'group' ? `group:${selectedHunt}` : `account:${selected.id}:${selectedHunt || 'sem-hunt'}`
  const captureGoalKey = baseGoalKey
  const killGoalKey = `kill:${baseGoalKey}`
  const captureGoal = Math.max(1, Math.floor(goals[captureGoalKey] ?? 1000))
  const killGoal = Math.max(1, Math.floor(goals[killGoalKey] ?? 5000))
  const captureRemaining = Math.max(0, captureGoal - aggregate.capturesTotal)
  const killRemaining = Math.max(0, killGoal - aggregate.killsEstimatedTotal)
  const captureEtaHours = aggregate.capturesPerHour > 0 ? captureRemaining / aggregate.capturesPerHour : Infinity
  const killEtaHours = aggregate.killsPerHour > 0 ? killRemaining / aggregate.killsPerHour : Infinity
  const etaCenterHours = aggregate.potionsPerHour > 0 ? aggregate.potionStock / aggregate.potionsPerHour : Infinity
  const captureProgress = Math.min(100, aggregate.capturesTotal / captureGoal * 100)
  const killProgress = Math.min(100, aggregate.killsEstimatedTotal / killGoal * 100)
  const health = huntHealth(aggregate.capturesPerHour, etaCenterHours, aggregate.sessionHours)
  const timeline = buildTimeline(captureRemaining, captureEtaHours, killRemaining, killEtaHours, etaCenterHours)
  const huntLabel = formatHuntName(selectedHunt)
  const activePokemon = activePokemonLabel(selected)

  const saveGoal = (key: string, value: number): void => {
    const next = Math.max(1, Math.min(10_000_000, Math.floor(value)))
    setGoals((current) => {
      const updated = { ...current, [key]: next }
      try { localStorage.setItem(GOAL_STORAGE, JSON.stringify(updated)) } catch { /* local settings only */ }
      return updated
    })
  }

  return <section class={`hunt-assist poke-card ${mode === 'group' ? 'group-mode' : ''}`}>
    <AssistHeader mode={mode} setMode={setMode} joinSameHunt={joinSameHunt} setJoinSameHunt={setJoinSameHunt} groupAvailable={groupAvailable} sameHuntCount={sameHunt.length} />
    <div class="ha-dashboard">
      <div class="ha-identity">
        <div class="ha-sprites">{accounts.slice(0,4).map((account) => <PokemonSprite speciesId={account.huntProfile?.speciesId} name={account.huntProfile?.speciesName || `Conta ${account.id}`} className="ha-pokemon" key={account.id} />)}</div>
        <div class="ha-id-copy">
          <small>{mode === 'group' ? `${accounts.length} CONTAS · MESMA HUNT` : `CONTA ${selected.id} · POKÉMON ATIVO`}</small>
          <b>{mode === 'group' ? (huntLabel || 'Hunt em grupo') : activePokemon}</b>
          <span>{mode === 'group' ? `${formatDuration(aggregate.sessionHours)} de sessão combinada` : `${huntLabel ? `Hunt · ${huntLabel}` : 'Hunt aguardando servidor'} · ${formatDuration(aggregate.sessionHours)}`} · <em class={`ha-health ${health.className}`}>{health.label}</em></span>
        </div>
      </div>

      <div class="ha-core-stats">
        <CompactStat label="CAPTURAS" value={formatNumber(aggregate.capturesTotal)} sub={`${formatRate(aggregate.capturesPerHour)}/h`} accent />
        <CompactStat label="ABATES ESTIM." value={formatNumber(aggregate.killsEstimatedTotal)} sub={`${formatRate(aggregate.killsPerHour)}/h`} />
        <CompactStat label="SESSÃO" value={formatDuration(aggregate.sessionHours)} sub={mode === 'group' ? `${accounts.length} contas somadas` : 'tempo nesta Hunt'} />
        <CompactStat label="CENTRO" value={formatEta(etaCenterHours)} sub={aggregate.potionsPerHour > 0 ? `${formatRate(aggregate.potionsPerHour)} poções/h` : 'sustain estável'} />
      </div>

      <GoalCard className="capture" label="META DE CAPTURAS" current={aggregate.capturesTotal} goal={captureGoal} remaining={captureRemaining} eta={captureEtaHours} progress={captureProgress} onCommit={(value) => saveGoal(captureGoalKey, value)} />
      <GoalCard className="kills" label="META DE ABATES" current={aggregate.killsEstimatedTotal} goal={killGoal} remaining={killRemaining} eta={killEtaHours} progress={killProgress} onCommit={(value) => saveGoal(killGoalKey, value)} />

      <PotionCard items={aggregate.potionItems} stock={aggregate.potionStock} used={aggregate.potionsUsedTotal} rate={aggregate.potionsPerHour} centerEta={etaCenterHours} />

      <div class="ha-potency">
        {aggregate.capturesByPotency.map((value,index) => <span class={`p${index + 1}`} key={index}><small>P{index + 1}</small><b>{formatNumber(value)}</b></span>)}
        <span class="shiny-seen"><small>SHINY VISTO</small><b>✦ {formatNumber(aggregate.shiniesSeen)}</b></span>
        <span class="shiny-caught"><small>SHINY PEGO</small><b>★ {formatNumber(aggregate.shiniesCaught)}</b></span>
      </div>

      <div class="ha-timeline"><small>PRÓXIMOS</small>{timeline.map((event,index) => <span key={index}><b>{event.when}</b>{event.label}</span>)}</div>
    </div>

    {mode === 'group' && <div class="ha-group-contrib">{accounts.map((account) => {
      const useCaptures = aggregate.capturesTotal > 0
      const groupTotal = Math.max(1, useCaptures ? aggregate.capturesTotal : aggregate.killsEstimatedTotal)
      const accountTotal = useCaptures ? account.huntSession.capturesTotal : account.huntSession.killsEstimatedTotal
      const percent = accountTotal / groupTotal * 100
      return <button key={account.id} onClick={() => void window.gridium2.selectAccount(account.id)}><b>C{account.id}</b><i><em style={{ width: `${Math.min(100, percent)}%` }} /></i><span>{percent.toFixed(0)}% · {formatNumber(accountTotal)} {useCaptures ? 'cap' : 'abates'}</span></button>
    })}</div>}
  </section>
}

function AssistHeader({ mode, setMode, joinSameHunt, setJoinSameHunt, groupAvailable, sameHuntCount }: {
  mode: ViewMode; setMode: (mode: ViewMode) => void; joinSameHunt: boolean; setJoinSameHunt: (value: boolean) => void; groupAvailable: boolean; sameHuntCount: number
}) {
  return <div class="ha-header">
    <div class="ha-title"><span>◆</span><div><b>HUNT CONTROL</b><small>captura · abates · sustain · metas</small></div></div>
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
    <div class="ha-mini-head"><b>CONTA {account.id} · {activePokemonLabel(account)}</b><small>{formatHuntName(huntKey(account)) || 'aguardando Hunt'}</small></div>
    <div class="ha-mini-values"><span><small>CAP</small><b>{formatNumber(session.capturesTotal)}</b><em>{formatRate(captureRate)}/h</em></span><span><small>ABATES</small><b>{formatNumber(session.killsEstimatedTotal)}</b><em>{formatRate(killRate)}/h</em></span><span><small>POÇÕES</small><b>{formatNumber(session.potionStock)}</b><em>centro {formatEta(center)}</em></span><span class="mini-shiny"><small>SHINY</small><b>✦{session.shiniesSeen} / ★{session.shiniesCaught}</b><em>P5 {session.capturesByPotency[4]}</em></span></div>
  </button>
}

function CompactStat({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return <div class={`ha-stat ${accent ? 'accent' : ''}`}><small>{label}</small><b>{value}</b><span>{sub}</span></div>
}

function GoalCard({ className, label, current, goal, remaining, eta, progress, onCommit }: {
  className: string; label: string; current: number; goal: number; remaining: number; eta: number; progress: number; onCommit: (value: number) => void
}) {
  return <div class={`ha-goal-block ${className}`}>
    <div class="ha-goal-top"><span>{label}</span><GoalEditor value={goal} onCommit={onCommit} /></div>
    <div class="ha-progress"><i style={{ width: `${progress}%` }} /></div>
    <div class="ha-goal-foot"><b>{progress.toFixed(progress >= 10 ? 0 : 1)}%</b><span>faltam {formatNumber(remaining)}</span><em>ETA {formatEta(eta)}</em></div>
    <div class="ha-goal-current">{formatNumber(current)} / {formatNumber(goal)}</div>
  </div>
}

function GoalEditor({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = (): void => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed < 1) {
      setDraft(String(value))
      return
    }
    const next = Math.max(1, Math.min(10_000_000, Math.floor(parsed)))
    setDraft(String(next))
    onCommit(next)
  }

  return <input
    class="ha-goal-input"
    type="text"
    inputMode="numeric"
    pattern="[0-9]*"
    value={draft}
    onInput={(event) => setDraft(event.currentTarget.value.replace(/\D/g, '').slice(0, 8))}
    onBlur={commit}
    onKeyDown={(event) => {
      if (event.key === 'Enter') { commit(); event.currentTarget.blur() }
      if (event.key === 'Escape') { setDraft(String(value)); event.currentTarget.blur() }
    }}
    aria-label="Editar meta"
  />
}

function PotionCard({ items, stock, used, rate, centerEta }: { items: HuntPotionSnapshot[]; stock: number; used: number; rate: number; centerEta: number }) {
  const visible = items.slice(0, 3)
  return <div class="ha-potion-block">
    <div class="ha-potion-icons">{visible.length ? visible.map((item) => {
      const src = itemSpriteUrl(item.name)
      return <span title={`${item.name}: ${formatNumber(item.quantity)}`} key={item.itemId}>{src ? <img src={src} alt={item.name} /> : '▥'}</span>
    }) : <span class="empty">▥</span>}</div>
    <div class="ha-potion-copy"><small>POÇÕES</small><b>{formatNumber(stock)} <i>estoque</i></b><span>{formatNumber(used)} usadas · {rate > 0 ? `${formatRate(rate)}/h` : 'sem consumo medido'}</span><strong>Centro {formatEta(centerEta)}</strong></div>
  </div>
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

function activePokemonLabel(account: AccountSnapshot): string {
  const name = String(account.huntProfile?.speciesName || '').trim()
  if (name) return name
  if (account.huntProfile?.speciesId !== undefined) return `Pokémon #${account.huntProfile.speciesId}`
  return 'Pokémon ativo'
}

function formatHuntName(value: string): string {
  if (!value) return ''
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function huntHealth(captureRate: number, centerHours: number, sessionHours: number): { label: string; className: string } {
  if (sessionHours > .25 && captureRate <= 0) return { label: 'SEM CAPTURAS', className: 'bad' }
  if (Number.isFinite(centerHours) && centerHours <= .25) return { label: 'CENTRO LOGO', className: 'bad' }
  if (Number.isFinite(centerHours) && centerHours <= .75) return { label: 'ATENÇÃO', className: 'warn' }
  return { label: 'HUNT ESTÁVEL', className: 'good' }
}

function buildTimeline(captureRemaining: number, captureEta: number, killRemaining: number, killEta: number, centerEta: number): Array<{ when: string; label: string }> {
  const rows: Array<{ hours: number; when: string; label: string }> = []
  if (captureRemaining === 0) rows.push({ hours: 0, when: 'AGORA', label: 'meta de capturas concluída' })
  else if (Number.isFinite(captureEta)) rows.push({ hours: captureEta, when: formatEta(captureEta), label: 'meta de capturas' })
  if (killRemaining === 0) rows.push({ hours: 0, when: 'AGORA', label: 'meta de abates concluída' })
  else if (Number.isFinite(killEta)) rows.push({ hours: killEta, when: formatEta(killEta), label: 'meta de abates' })
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
