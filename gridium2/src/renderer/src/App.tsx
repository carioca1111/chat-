import { useEffect, useMemo, useState } from 'preact/hooks'
import type { AccountCommand, AccountId, AppModule, GridiumSnapshot, LayoutMode, PerformanceMode } from '../../shared/contracts'
import { HuntView } from './HuntView'

const initial: GridiumSnapshot = {
  layout: 4,
  selectedAccount: 1,
  performanceMode: 'auto',
  activeModule: 'accounts',
  accounts: [],
  telemetry: { cpuPercent: 0, memoryMB: 0, mainEventLoopMeanMs: 0, mainEventLoopMaxMs: 0, processCount: 0, capturedAt: Date.now() }
}

const statusLabel = { booting: 'INICIANDO', loading: 'CARREGANDO', ready: 'ONLINE', offline: 'OFFLINE', crashed: 'REINICIAR' } as const
const modules: Array<[string,string,AppModule|null]> = [
  ['◉','CONTAS','accounts'], ['⚔','HUNT','hunt'], ['✦','SHINY',null], ['▣','MARKET',null], ['⌖','SNIPER',null], ['▤','AUTOMARKET',null], ['▥','PAINEL',null]
]

export function App() {
  const [snapshot, setSnapshot] = useState<GridiumSnapshot>(initial)
  useEffect(() => {
    let alive = true
    void window.gridium2.getSnapshot().then((next) => alive && setSnapshot(next))
    const unsubscribe = window.gridium2.onSnapshot(setSnapshot)
    return () => { alive = false; unsubscribe() }
  }, [])

  const selected = useMemo(() => snapshot.accounts.find((x) => x.id === snapshot.selectedAccount), [snapshot.accounts, snapshot.selectedAccount])
  const onlineCount = snapshot.accounts.filter((x) => x.status === 'ready').length
  const ecoCount = snapshot.accounts.filter((x) => x.visualMode === 'eco').length

  const select = (id: AccountId) => void window.gridium2.selectAccount(id)
  const setZoom = (id: AccountId, value: number) => void window.gridium2.setAccountZoom(id, value)
  const setLayout = (mode: LayoutMode) => void window.gridium2.setLayout(mode)
  const setPerformance = (mode: PerformanceMode) => void window.gridium2.setPerformanceMode(mode)
  const command = (id: AccountId, action: AccountCommand) => void window.gridium2.accountCommand(id, action)

  return <div class="shell">
    <aside class="sidebar poke-frame">
      <div class="brand-panel"><div class="brand-ball"><span /></div><div class="brand-copy"><strong>GRIDIIUM <em>2</em></strong><span>POKEIDLE MANAGER</span></div></div>
      <div class="section-label"><span>CONTAS ({onlineCount}/4)</span><span class="tiny-chip">ALPHA 0.3.1</span></div>
      <div class="accounts">
        {snapshot.accounts.length === 0 ? <div class="skeleton-card poke-card">Preparando as 4 sessões…</div> : snapshot.accounts.map((account) => <div class={`account-block ${account.id === snapshot.selectedAccount ? 'selected' : ''}`} key={account.id}>
          <button class={`account-card poke-card ${account.id === snapshot.selectedAccount ? 'selected' : ''}`} onClick={() => select(account.id)}>
            <span class="account-orb">{account.id}</span><span class="account-main">
              <span class="account-line"><b>Conta {account.id}</b><small class={`account-status ${account.status}`}><i class={`status-dot ${account.status}`} /> {statusLabel[account.status]}</small></span>
              <span class="account-title">{account.title || 'PokeIdle.io'}</span>
              <span class="account-meta">{snapshot.activeModule === 'hunt' && account.huntProfile?.speciesName
                ? `${account.huntProfile.speciesName}${account.huntProfile.pokemonLevel ? ` · Nv ${account.huntProfile.pokemonLevel}` : ''} · AUTO`
                : `Sessão isolada${account.visualMode === 'eco' ? ' · ECO' : ' · QUALIDADE'}`}</span>
            </span>
          </button>
          {snapshot.activeModule === 'accounts' && <div class="account-zoom"><span class="zoom-label">AFASTAMENTO</span><button class="zoom-button" onClick={() => setZoom(account.id, account.zoomPercent - 5)} disabled={account.zoomPercent <= 50}>−</button><button class="zoom-value" onClick={() => setZoom(account.id,100)}>{account.zoomPercent}%</button><button class="zoom-button" onClick={() => setZoom(account.id,account.zoomPercent + 5)} disabled={account.zoomPercent >= 140}>+</button></div>}
        </div>)}
      </div>
      <div class="perf-card poke-card"><div class="perf-title"><span>DESEMPENHO</span><span class={`mode-badge ${snapshot.performanceMode}`}>{snapshot.performanceMode === 'auto' ? 'AUTO ECO' : 'FULL'}</span></div><div class="perf-grid"><Metric icon="⚙" label="CPU" value={`${snapshot.telemetry.cpuPercent.toFixed(1)}%`} /><Metric icon="▦" label="RAM" value={`${snapshot.telemetry.memoryMB.toFixed(0)} MB`} /><Metric icon="⚡" label="LOOP" value={`${snapshot.telemetry.mainEventLoopMeanMs.toFixed(1)} ms`} /><Metric icon="●" label="PROCESSOS" value={`${snapshot.telemetry.processCount}`} /></div></div>
      <div class="sidebar-footer"><span class="pulse" /> {onlineCount} contas online · {ecoCount} em eco visual</div>
    </aside>

    <header class="topbar poke-frame">
      <nav class="module-nav">{modules.map(([icon,label,module]) => <button class={`module-button ${module && snapshot.activeModule === module ? 'active' : ''} ${module ? '' : 'locked'}`} disabled={!module} onClick={() => module && void window.gridium2.setModule(module)} title={module ? label : `${label} entra nas próximas versões`} key={label}><span class="module-icon">{icon}</span><span>{label}</span></button>)}</nav>
      <div class="top-tools">
        {snapshot.activeModule === 'accounts' ? <>
          <div class="layout-picker poke-toggle">{([1,2,4] as LayoutMode[]).map((mode) => <button class={snapshot.layout === mode ? 'active' : ''} onClick={() => setLayout(mode)} key={mode}>{mode === 1 ? '1×1' : mode === 2 ? '1×2' : '2×2'}</button>)}</div>
          <div class="performance-picker poke-toggle"><button class={snapshot.performanceMode === 'auto' ? 'active' : ''} onClick={() => setPerformance('auto')}>⚡ ECO</button><button class={snapshot.performanceMode === 'full' ? 'active' : ''} onClick={() => setPerformance('full')}>FULL</button></div>
          <div class="selected-zoom"><span>ZOOM</span><b>{selected?.zoomPercent ?? 100}%</b></div>
          <div class="account-controls"><Control label="←" title="Voltar" onClick={() => command(snapshot.selectedAccount,'back')} /><Control label="→" title="Avançar" onClick={() => command(snapshot.selectedAccount,'forward')} /><Control label="⌂" title="PokeIdle.io" onClick={() => command(snapshot.selectedAccount,'home')} /><Control label="↻" title="Recarregar" onClick={() => command(snapshot.selectedAccount,'reload')} /></div>
        </> : <div class="hunt-top-status"><span>⚔ HUNT INTELLIGENCE</span><b>{selected?.huntProfile?.speciesName ? `${selected.huntProfile.speciesName} · ` : ''}CONTA {snapshot.selectedAccount}</b></div>}
      </div>
    </header>

    {snapshot.activeModule === 'accounts' ? <main class="viewport-placeholder poke-frame"><div class="viewport-ribbon"><span class="ribbon-title">CONTA {snapshot.selectedAccount}</span><span>{selected?.title || 'PokeIdle.io'}</span><span class="ribbon-zoom">ZOOM {selected?.zoomPercent ?? 100}%</span><span class="ribbon-status"><i class={`status-dot ${selected?.status || 'booting'}`} /> {selected ? statusLabel[selected.status] : 'CARREGANDO'}</span></div><div class="empty-message">As telas nativas do PokeIdle são renderizadas sobre esta área.</div></main> : <HuntView accountId={snapshot.selectedAccount} autoScan={selected?.huntProfile} />}

    <footer class="statusbar poke-frame"><span><i class="status-ok" /> GRIDIIUM CORE ATIVO</span><span>CONTA {snapshot.selectedAccount}</span><span>{snapshot.activeModule === 'hunt' ? '⚔ HUNT AUTO · EQUIPADO' : `ZOOM ${selected?.zoomPercent ?? 100}%`}</span><span>{snapshot.performanceMode === 'auto' ? '⚡ AUTO ECO' : '◆ QUALIDADE TOTAL'}</span><span>LOOP MÁX. {snapshot.telemetry.mainEventLoopMaxMs.toFixed(1)} ms</span></footer>
  </div>
}

function Metric({ icon,label,value }: { icon:string; label:string; value:string }) { return <div class="metric"><span class="metric-icon">{icon}</span><span class="metric-copy"><small>{label}</small><b>{value}</b></span></div> }
function Control({ label,title,onClick }: { label:string; title:string; onClick:()=>void }) { return <button class="control" title={title} onClick={onClick}>{label}</button> }
