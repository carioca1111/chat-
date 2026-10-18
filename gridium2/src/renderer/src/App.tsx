import { useEffect, useMemo, useState } from 'preact/hooks'
import type {
  AccountCommand,
  AccountId,
  AppModule,
  GridiumSnapshot,
  LayoutMode,
  PerformanceMode
} from '../../shared/contracts'
import { loadHuntSpecies, type HuntSpecies } from './hunt-data'
import { buildRoute, rankHunts, type HuntObjective, type HuntProfile } from './hunt-engine'

const initial: GridiumSnapshot = {
  layout: 4,
  selectedAccount: 1,
  performanceMode: 'auto',
  activeModule: 'accounts',
  accounts: [],
  telemetry: {
    cpuPercent: 0,
    memoryMB: 0,
    mainEventLoopMeanMs: 0,
    mainEventLoopMaxMs: 0,
    processCount: 0,
    capturedAt: Date.now()
  }
}

const statusLabel = {
  booting: 'INICIANDO', loading: 'CARREGANDO', ready: 'ONLINE', offline: 'OFFLINE', crashed: 'REINICIAR'
} as const

const modules: Array<[string, string, AppModule | null]> = [
  ['◉', 'CONTAS', 'accounts'], ['⚔', 'HUNT', 'hunt'], ['✦', 'SHINY', null], ['▣', 'MARKET', null],
  ['⌖', 'SNIPER', null], ['▤', 'AUTOMARKET', null], ['▥', 'PAINEL', null]
]

export function App() {
  const [snapshot, setSnapshot] = useState<GridiumSnapshot>(initial)

  useEffect(() => {
    let alive = true
    void window.gridium2.getSnapshot().then((next) => alive && setSnapshot(next))
    const unsubscribe = window.gridium2.onSnapshot(setSnapshot)
    return () => { alive = false; unsubscribe() }
  }, [])

  const selected = useMemo(
    () => snapshot.accounts.find((account) => account.id === snapshot.selectedAccount),
    [snapshot.accounts, snapshot.selectedAccount]
  )
  const onlineCount = snapshot.accounts.filter((account) => account.status === 'ready').length
  const ecoCount = snapshot.accounts.filter((account) => account.visualMode === 'eco').length

  const setLayout = (mode: LayoutMode) => void window.gridium2.setLayout(mode)
  const setPerformanceMode = (mode: PerformanceMode) => void window.gridium2.setPerformanceMode(mode)
  const setModule = (module: AppModule) => void window.gridium2.setModule(module)
  const setZoom = (id: AccountId, zoomPercent: number) => void window.gridium2.setAccountZoom(id, zoomPercent)
  const select = (id: AccountId) => void window.gridium2.selectAccount(id)
  const command = (id: AccountId, action: AccountCommand) => void window.gridium2.accountCommand(id, action)

  return (
    <div class="shell">
      <aside class="sidebar poke-frame">
        <div class="brand-panel">
          <div class="brand-ball" aria-hidden="true"><span /></div>
          <div class="brand-copy"><strong>GRIDIIUM <em>2</em></strong><span>POKEIDLE MANAGER</span></div>
        </div>

        <div class="section-label"><span>CONTAS ({onlineCount}/4)</span><span class="tiny-chip">ALPHA 0.3</span></div>
        <div class="accounts">
          {snapshot.accounts.length === 0 ? <div class="skeleton-card poke-card">Preparando as 4 sessões…</div> : snapshot.accounts.map((account) => (
            <div class={`account-block ${account.id === snapshot.selectedAccount ? 'selected' : ''}`} key={account.id}>
              <button class={`account-card poke-card ${account.id === snapshot.selectedAccount ? 'selected' : ''}`} onClick={() => select(account.id)}>
                <span class="account-orb" aria-hidden="true">{account.id}</span>
                <span class="account-main">
                  <span class="account-line"><b>Conta {account.id}</b><small class={`account-status ${account.status}`}><i class={`status-dot ${account.status}`} /> {statusLabel[account.status]}</small></span>
                  <span class="account-title">{account.title || 'PokeIdle.io'}</span>
                  <span class="account-meta">Sessão isolada{account.visualMode === 'eco' ? ' · ECO' : ' · QUALIDADE'}</span>
                </span>
              </button>
              {snapshot.activeModule === 'accounts' && <div class="account-zoom">
                <span class="zoom-label">AFASTAMENTO</span>
                <button class="zoom-button" onClick={() => setZoom(account.id, account.zoomPercent - 5)} disabled={account.zoomPercent <= 50}>−</button>
                <button class="zoom-value" onClick={() => setZoom(account.id, 100)}>{account.zoomPercent}%</button>
                <button class="zoom-button" onClick={() => setZoom(account.id, account.zoomPercent + 5)} disabled={account.zoomPercent >= 140}>+</button>
              </div>}
            </div>
          ))}
        </div>

        <div class="perf-card poke-card">
          <div class="perf-title"><span>DESEMPENHO</span><span class={`mode-badge ${snapshot.performanceMode}`}>{snapshot.performanceMode === 'auto' ? 'AUTO ECO' : 'FULL'}</span></div>
          <div class="perf-grid">
            <Metric icon="⚙" label="CPU" value={`${snapshot.telemetry.cpuPercent.toFixed(1)}%`} />
            <Metric icon="▦" label="RAM" value={`${snapshot.telemetry.memoryMB.toFixed(0)} MB`} />
            <Metric icon="⚡" label="LOOP" value={`${snapshot.telemetry.mainEventLoopMeanMs.toFixed(1)} ms`} />
            <Metric icon="●" label="PROCESSOS" value={`${snapshot.telemetry.processCount}`} />
          </div>
        </div>
        <div class="sidebar-footer"><span class="pulse" /> {onlineCount} contas online · {ecoCount} em eco visual</div>
      </aside>

      <header class="topbar poke-frame">
        <nav class="module-nav">
          {modules.map(([icon, label, module]) => (
            <button
              class={`module-button ${module && snapshot.activeModule === module ? 'active' : ''} ${module ? '' : 'locked'}`}
              disabled={!module}
              onClick={() => module && setModule(module)}
              title={module ? label : `${label} entra nas próximas versões`}
              key={label}
            ><span class="module-icon">{icon}</span><span>{label}</span></button>
          ))}
        </nav>
        <div class="top-tools">
          {snapshot.activeModule === 'accounts' && <>
            <div class="layout-picker poke-toggle">{([1,2,4] as LayoutMode[]).map((mode) => <button class={snapshot.layout === mode ? 'active' : ''} onClick={() => setLayout(mode)} key={mode}>{mode === 1 ? '1×1' : mode === 2 ? '1×2' : '2×2'}</button>)}</div>
            <div class="performance-picker poke-toggle">
              <button class={snapshot.performanceMode === 'auto' ? 'active' : ''} onClick={() => setPerformanceMode('auto')}>⚡ ECO</button>
              <button class={snapshot.performanceMode === 'full' ? 'active' : ''} onClick={() => setPerformanceMode('full')}>FULL</button>
            </div>
            <div class="selected-zoom"><span>ZOOM</span><b>{selected?.zoomPercent ?? 100}%</b></div>
            <div class="account-controls">
              <Control label="←" title="Voltar" onClick={() => command(snapshot.selectedAccount, 'back')} />
              <Control label="→" title="Avançar" onClick={() => command(snapshot.selectedAccount, 'forward')} />
              <Control label="⌂" title="PokeIdle.io" onClick={() => command(snapshot.selectedAccount, 'home')} />
              <Control label="↻" title="Recarregar" onClick={() => command(snapshot.selectedAccount, 'reload')} />
            </div>
          </>}
          {snapshot.activeModule === 'hunt' && <div class="hunt-top-status"><span>⚔ HUNT INTELLIGENCE</span><b>CONTA {snapshot.selectedAccount}</b></div>}
        </div>
      </header>

      {snapshot.activeModule === 'accounts' ? <main class="viewport-placeholder poke-frame">
        <div class="viewport-ribbon"><span class="ribbon-title">CONTA {snapshot.selectedAccount}</span><span>{selected?.title || 'PokeIdle.io'}</span><span class="ribbon-zoom">ZOOM {selected?.zoomPercent ?? 100}%</span><span class="ribbon-status"><i class={`status-dot ${selected?.status || 'booting'}`} /> {selected ? statusLabel[selected.status] : 'CARREGANDO'}</span></div>
        <div class="empty-message">As telas nativas do PokeIdle são renderizadas sobre esta área.</div>
      </main> : <HuntView accountId={snapshot.selectedAccount} />}

      <footer class="statusbar poke-frame">
        <span><i class="status-ok" /> GRIDIIUM CORE ATIVO</span><span>CONTA {snapshot.selectedAccount}</span>
        <span>{snapshot.activeModule === 'hunt' ? '⚔ HUNT MODEL · SERVIDOR ATUAL' : `ZOOM ${selected?.zoomPercent ?? 100}%`}</span>
        <span>{snapshot.performanceMode === 'auto' ? '⚡ AUTO ECO' : '◆ QUALIDADE TOTAL'}</span>
        <span>LOOP MÁX. {snapshot.telemetry.mainEventLoopMaxMs.toFixed(1)} ms</span>
      </footer>
    </div>
  )
}

function HuntView({ accountId }: { accountId: AccountId }) {
  const [data, setData] = useState<HuntSpecies[]>([])
  const [objective, setObjective] = useState<HuntObjective>('route')
  const [configured, setConfigured] = useState(false)
  const [trainerLevel, setTrainerLevel] = useState(1)
  const [speciesName, setSpeciesName] = useState('')
  const [pokemonLevel, setPokemonLevel] = useState(1)
  const [quality, setQuality] = useState(1)
  const [potency, setPotency] = useState<1|2|3|4|5>(1)
  const [shiny, setShiny] = useState(false)
  const [iv, setIv] = useState(16)

  useEffect(() => { void loadHuntSpecies().then(setData) }, [])
  useEffect(() => {
    const raw = localStorage.getItem(`gridium2:hunt-profile:${accountId}`)
    if (!raw) { setConfigured(false); setSpeciesName(''); return }
    try {
      const x = JSON.parse(raw)
      setTrainerLevel(Number(x.trainerLevel) || 1); setSpeciesName(String(x.speciesName || ''))
      setPokemonLevel(Number(x.pokemonLevel) || 1); setQuality(Number(x.quality) || 1)
      setPotency(([1,2,3,4,5].includes(Number(x.potency)) ? Number(x.potency) : 1) as 1|2|3|4|5)
      setShiny(Boolean(x.shiny)); setIv(Number(x.iv) || 16); setConfigured(Boolean(x.speciesName))
    } catch { setConfigured(false) }
  }, [accountId])

  const species = useMemo(() => data.find((row) => row[1].toLowerCase() === speciesName.trim().toLowerCase()), [data, speciesName])
  const profile = useMemo<HuntProfile | null>(() => species ? {
    trainerLevel: Math.max(1, trainerLevel), speciesId: species[0], pokemonLevel: Math.max(1, pokemonLevel),
    quality, potency, shiny, ivAtk: iv, ivSpAtk: iv, ivDef: iv, ivSpDef: iv, ivHp: iv, types: species[2]
  } : null, [species, trainerLevel, pokemonLevel, quality, potency, shiny, iv])
  const ranking = useMemo(() => profile ? rankHunts(data, profile, objective).slice(0, 60) : [], [data, profile, objective])
  const route = useMemo(() => profile ? buildRoute(data, profile, 6) : [], [data, profile])

  const save = () => {
    if (!species) return
    localStorage.setItem(`gridium2:hunt-profile:${accountId}`, JSON.stringify({ trainerLevel, speciesName: species[1], pokemonLevel, quality, potency, shiny, iv }))
    setSpeciesName(species[1]); setConfigured(true)
  }

  const best = ranking[0]
  return <main class="hunt-page">
    <section class="hunt-header poke-card">
      <div class="hunt-title"><span class="hunt-title-icon">⚔</span><div><h1>HUNT INTELLIGENCE</h1><p>Rota calculada com a Pokédex deste servidor · estimativa antes da calibração real</p></div></div>
      <div class="hunt-objectives">
        {([['route','ROTA'],['xp','XP MÁX.'],['safe','SEGURO']] as Array<[HuntObjective,string]>).map(([key,label]) => <button class={objective === key ? 'active' : ''} onClick={() => setObjective(key)} key={key}>{label}</button>)}
      </div>
    </section>

    <section class="hunt-profile poke-card">
      <div class="hunt-profile-head"><strong>POKÉMON EM CAMPO · CONTA {accountId}</strong><span class={configured ? 'profile-ready' : 'profile-warn'}>{configured ? '✓ PERFIL SALVO' : 'CONFIGURE UMA VEZ'}</span></div>
      <div class="hunt-form">
        <label>ESPÉCIE<input list="hunt-species" value={speciesName} onInput={(e) => setSpeciesName((e.currentTarget as HTMLInputElement).value)} placeholder="Ex.: Venusaur" /></label>
        <datalist id="hunt-species">{data.map((row) => <option value={row[1]} key={row[0]} />)}</datalist>
        <label>NV TREINADOR<input type="number" min="1" value={trainerLevel} onInput={(e) => setTrainerLevel(Number((e.currentTarget as HTMLInputElement).value))} /></label>
        <label>NV POKÉMON<input type="number" min="1" value={pokemonLevel} onInput={(e) => setPokemonLevel(Number((e.currentTarget as HTMLInputElement).value))} /></label>
        <label>QUALIDADE<input type="number" min="0.8" max="2" step="0.001" value={quality} onInput={(e) => setQuality(Number((e.currentTarget as HTMLInputElement).value))} /></label>
        <label>POTÊNCIA<select value={potency} onChange={(e) => setPotency(Number((e.currentTarget as HTMLSelectElement).value) as 1|2|3|4|5)}>{[1,2,3,4,5].map((x) => <option value={x} key={x}>P{x}</option>)}</select></label>
        <label>IV MÉDIO<input type="number" min="1" max="32" value={iv} onInput={(e) => setIv(Number((e.currentTarget as HTMLInputElement).value))} /></label>
        <label class="hunt-shiny"><input type="checkbox" checked={shiny} onChange={(e) => setShiny((e.currentTarget as HTMLInputElement).checked)} /> SHINY ×3</label>
        <button class="hunt-save" disabled={!species} onClick={save}>ANALISAR</button>
      </div>
      {!species && speciesName && <small class="hunt-error">Espécie não encontrada na Pokédex deste servidor.</small>}
    </section>

    {profile && best ? <>
      <section class="hunt-summary-grid">
        <Summary label="MELHOR AGORA" value={best.area} sub={`${best.name} · ${best.region} · Nv ${best.level}`} accent />
        <Summary label="XP/H PROJETADO" value={compact(best.trainerXpPerHour)} sub={`${compact(best.xpPerKill)} XP/abate`} />
        <Summary label="ABATES/H" value={Math.round(best.killsPerHour).toLocaleString('pt-BR')} sub={`matchup ×${best.matchup.toFixed(2)}`} />
        <Summary label="SEGURANÇA" value={`${best.safety}/100`} sub={best.safety >= 75 ? 'confortável' : best.safety >= 45 ? 'atenção' : 'alto risco'} />
      </section>

      <section class="hunt-route poke-card">
        <div class="hunt-section-title"><strong>ROTA DE PROGRESSÃO</strong><span>troca automática sugerida quando outra hunt passa a render mais</span></div>
        <div class="route-track">{route.map((stage, index) => <div class={`route-stage ${index === 0 ? 'current' : ''}`} key={`${stage.fromLevel}-${stage.hunt.id}`}><small>{index === 0 ? 'AGORA' : `NV ${stage.fromLevel}`}</small><b>{stage.hunt.area}</b><span>{stage.hunt.name} · {compact(stage.hunt.trainerXpPerHour)} XP/h</span></div>)}</div>
      </section>

      <section class="hunt-ranking poke-card">
        <div class="hunt-section-title"><strong>RANKING CALCULADO</strong><span>{ranking.length} melhores opções · dados estáticos em cache, sem cálculo por frame</span></div>
        <div class="hunt-table-wrap"><table class="hunt-table"><thead><tr><th>#</th><th>ÁREA / ALVO</th><th>REGIÃO</th><th>NÍVEL</th><th>ABATES/H</th><th>XP/ABATE</th><th>XP/H TREINADOR</th><th>XP/H POKÉMON</th><th>SEGURANÇA</th></tr></thead><tbody>
          {ranking.map((row,index) => <tr class={index === 0 ? 'best' : ''} key={row.id}><td>{index+1}</td><td><b>{row.area}</b><small>{row.name} · {row.types.join(' / ')}</small></td><td><span class="region-chip">{row.region}</span></td><td>{row.level.toLocaleString('pt-BR')}</td><td>{Math.round(row.killsPerHour).toLocaleString('pt-BR')}</td><td>{row.xpPerKill.toLocaleString('pt-BR')}</td><td><strong>{compact(row.trainerXpPerHour)}</strong></td><td>{compact(row.pokemonXpPerHour)}</td><td><span class={`safety s${row.safety >= 75 ? 'good' : row.safety >= 45 ? 'mid' : 'bad'}`}>{row.safety}</span></td></tr>)}
        </tbody></table></div>
      </section>
      <p class="hunt-disclaimer">MODELADO = projeção. Caminhada, spawn, desmaios, buffs e comportamento real do servidor podem mudar o resultado. A próxima camada da Hunt Intelligence calibra essas estimativas com telemetria real da própria conta, sem poluir o processo principal.</p>
    </> : <section class="hunt-empty poke-card"><b>Configure o Pokémon para montar a rota.</b><span>O Gridium não inventa seus stats: escolha a espécie e informe os números da conta.</span></section>}
  </main>
}

function Summary({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return <div class={`hunt-summary poke-card ${accent ? 'accent' : ''}`}><small>{label}</small><b>{value}</b><span>{sub}</span></div>
}
function compact(value: number): string {
  const n = Math.round(value)
  if (n >= 1_000_000_000) return `${(n/1_000_000_000).toFixed(1).replace('.',',')} bi`
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1).replace('.',',')} mi`
  if (n >= 1_000) return `${(n/1_000).toFixed(1).replace('.',',')} mil`
  return n.toLocaleString('pt-BR')
}
function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <div class="metric"><span class="metric-icon">{icon}</span><span class="metric-copy"><small>{label}</small><b>{value}</b></span></div>
}
function Control({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return <button class="control" title={title} onClick={onClick}>{label}</button>
}
