import { useEffect, useMemo, useState } from 'preact/hooks'
import type { AccountCommand, AccountId, AppModule, GridiumSnapshot, LayoutMode, PerformanceMode } from '../../shared/contracts'
import { HuntAssistPanel } from './HuntAssistPanel'
import { HuntView } from './HuntView'
import { PanelView } from './PanelView'
import { SettingsView } from './SettingsView'

const initial: GridiumSnapshot = {
  layout: 4,
  selectedAccount: 1,
  performanceMode: 'auto',
  activeModule: 'accounts',
  keepDisplayAwake: true,
  powerAutomation: { blackUnfocused: false, blackWhenMinimized: true, wakeOnSelect: true },
  accounts: [],
  telemetry: { cpuPercent: 0, memoryMB: 0, mainEventLoopMeanMs: 0, mainEventLoopMaxMs: 0, processCount: 0, capturedAt: Date.now() }
}

const statusLabel = { booting: 'INICIANDO', loading: 'CARREGANDO', ready: 'ONLINE', offline: 'OFFLINE', crashed: 'REINICIAR' } as const
type HuntSurface = 'route' | 'control'
type NavEntry = { icon: string; label: string; module: AppModule | null; huntSurface?: HuntSurface }
const modules: NavEntry[] = [
  { icon: '◉', label: 'CONTAS', module: 'accounts' },
  { icon: '⚔', label: 'HUNT', module: 'hunt', huntSurface: 'route' },
  { icon: '◆', label: 'HUNT CTRL', module: 'hunt', huntSurface: 'control' },
  { icon: '✦', label: 'SHINY', module: null },
  { icon: '▣', label: 'MARKET', module: null },
  { icon: '⌖', label: 'SNIPER', module: null },
  { icon: '▥', label: 'PAINEL', module: 'panel' }
]

export function App() {
  const [snapshot, setSnapshot] = useState<GridiumSnapshot>(initial)
  const [huntSurface, setHuntSurface] = useState<HuntSurface>('route')
  useEffect(() => {
    let alive = true
    void window.gridium2.getSnapshot().then((next) => alive && setSnapshot(next))
    const unsubscribe = window.gridium2.onSnapshot(setSnapshot)
    return () => { alive = false; unsubscribe() }
  }, [])

  const selected = useMemo(() => snapshot.accounts.find((x) => x.id === snapshot.selectedAccount), [snapshot.accounts, snapshot.selectedAccount])
  const onlineCount = snapshot.accounts.filter((x) => x.status === 'ready').length
  const blackCount = snapshot.accounts.filter((x) => x.effectivePowerState === 'black').length
  const suspendedCount = snapshot.accounts.filter((x) => x.effectivePowerState === 'suspended').length

  const select = (id: AccountId) => void window.gridium2.selectAccount(id)
  const setZoom = (id: AccountId, value: number) => void window.gridium2.setAccountZoom(id, value)
  const setLayout = (mode: LayoutMode) => void window.gridium2.setLayout(mode)
  const setPerformance = (mode: PerformanceMode) => void window.gridium2.setPerformanceMode(mode)
  const command = (id: AccountId, action: AccountCommand) => void window.gridium2.accountCommand(id, action)
  const openModule = (entry: NavEntry): void => {
    if (!entry.module) return
    if (entry.module === 'hunt') setHuntSurface(entry.huntSurface ?? 'route')
    void window.gridium2.setModule(entry.module)
  }

  return <div class="shell">
    <aside class="sidebar poke-frame">
      <div class="brand-panel"><div class="brand-ball"><span /></div><div class="brand-copy"><strong>GRIDIIUM <em>2</em></strong><span>POKEIDLE MANAGER</span></div></div>
      <div class="section-label"><span>CONTAS ({onlineCount}/4)</span><span class="tiny-chip">ALPHA 1.3.3</span></div>
      <div class="accounts">
        {snapshot.accounts.length === 0 ? <div class="skeleton-card poke-card">Preparando as 4 sessões…</div> : snapshot.accounts.map((account) => <div class={`account-block ${account.id === snapshot.selectedAccount ? 'selected' : ''}`} key={account.id}>
          <button class={`account-card poke-card ${account.id === snapshot.selectedAccount ? 'selected' : ''}`} onClick={() => select(account.id)}>
            <span class="account-orb">{account.id}</span><span class="account-main">
              <span class="account-line"><b>Conta {account.id}</b><small class={`account-status ${account.status}`}><i class={`status-dot ${account.status}`} /> {statusLabel[account.status]}</small></span>
              <span class="account-title">{account.title || 'PokeIdle.io'}</span>
              <span class="account-meta">{snapshot.activeModule === 'hunt' ? huntAccountMeta(account) : accountPowerMeta(account)}</span>
            </span>
          </button>
          {snapshot.activeModule === 'accounts' && <div class="account-zoom"><span class="zoom-label">AFASTAMENTO</span><button class="zoom-button" onClick={() => setZoom(account.id, account.zoomPercent - 5)} disabled={account.zoomPercent <= 50}>−</button><button class="zoom-value" onClick={() => setZoom(account.id,100)}>{account.zoomPercent}%</button><button class="zoom-button" onClick={() => setZoom(account.id,account.zoomPercent + 5)} disabled={account.zoomPercent >= 140}>+</button></div>}
        </div>)}
      </div>
      <div class="perf-card poke-card"><div class="perf-title"><span>DESEMPENHO</span><span class={`mode-badge ${snapshot.performanceMode}`}>{snapshot.performanceMode === 'auto' ? 'AUTO ECO' : 'FULL'}</span></div><div class="perf-grid"><Metric icon="⚙" label="CPU" value={`${snapshot.telemetry.cpuPercent.toFixed(1)}%`} /><Metric icon="▦" label="RAM" value={`${snapshot.telemetry.memoryMB.toFixed(0)} MB`} /><Metric icon="⚡" label="LOOP" value={`${snapshot.telemetry.mainEventLoopMeanMs.toFixed(1)} ms`} /><Metric icon="●" label="PROCESSOS" value={`${snapshot.telemetry.processCount}`} /></div></div>
      <div class="sidebar-footer"><span class="pulse" /> {onlineCount} online · {blackCount} tela preta · {suspendedCount} suspensas</div>
    </aside>

    <header class="topbar poke-frame">
      <nav class="module-nav">{modules.map((entry) => {
        const active = Boolean(entry.module && snapshot.activeModule === entry.module && (entry.module !== 'hunt' || huntSurface === (entry.huntSurface ?? 'route')))
        return <button class={`module-button ${active ? 'active' : ''} ${entry.module ? '' : 'locked'}`} disabled={!entry.module} onClick={() => openModule(entry)} title={entry.module ? entry.label : `${entry.label} entra nas próximas versões`} key={entry.label}><span class="module-icon">{entry.icon}</span><span>{entry.label}</span></button>
      })}</nav>
      <div class="top-tools">
        {snapshot.activeModule === 'accounts' ? <>
          <div class="layout-picker poke-toggle">{([1,2,4] as LayoutMode[]).map((mode) => <button class={snapshot.layout === mode ? 'active' : ''} onClick={() => setLayout(mode)} key={mode}>{mode === 1 ? '1×1' : mode === 2 ? '1×2' : '2×2'}</button>)}</div>
          <div class="performance-picker poke-toggle"><button class={snapshot.performanceMode === 'auto' ? 'active' : ''} onClick={() => setPerformance('auto')}>⚡ ECO</button><button class={snapshot.performanceMode === 'full' ? 'active' : ''} onClick={() => setPerformance('full')}>FULL</button></div>
          <div class="account-controls"><Control label="←" title="Voltar" onClick={() => command(snapshot.selectedAccount,'back')} /><Control label="→" title="Avançar" onClick={() => command(snapshot.selectedAccount,'forward')} /><Control label="⌂" title="PokeIdle.io" onClick={() => command(snapshot.selectedAccount,'home')} /><Control label="↻" title="Recarregar" onClick={() => command(snapshot.selectedAccount,'reload')} /><Control label="⚙" title="Configurações" onClick={() => void window.gridium2.setModule('settings')} /></div>
        </> : snapshot.activeModule === 'hunt' && huntSurface === 'control' ? <div class="hunt-top-status"><span>◆ HUNT CONTROL</span><b>CONTA {snapshot.selectedAccount} · {selected?.huntProtocolStatus === 'live' ? 'SESSÃO AO VIVO' : selected?.huntProtocolStatus === 'unavailable' ? 'PROTOCOLO INDISPONÍVEL' : 'AGUARDANDO SERVIDOR'}</b><Control label="⚙" title="Configurações" onClick={() => void window.gridium2.setModule('settings')} /></div> : snapshot.activeModule === 'hunt' ? <div class="hunt-top-status"><span>⚔ HUNT INTELLIGENCE</span><b>CONTA {snapshot.selectedAccount} · {selected?.huntProtocolStatus === 'live' ? 'SERVIDOR AO VIVO' : selected?.huntProtocolStatus === 'unavailable' ? 'PROTOCOLO INDISPONÍVEL' : 'AGUARDANDO SERVIDOR'}</b><Control label="⚙" title="Configurações" onClick={() => void window.gridium2.setModule('settings')} /></div> : snapshot.activeModule === 'panel' ? <div class="hunt-top-status"><span>▥ PAINEL ANALYTICS</span><b>4 CONTAS · DADOS DO SERVIDOR</b><Control label="⚙" title="Configurações" onClick={() => void window.gridium2.setModule('settings')} /></div> : <div class="settings-top-status"><span>⚙ CONFIGURAÇÕES</span><b>CONTROLE DE CONTA</b></div>}
      </div>
    </header>

    {snapshot.activeModule === 'accounts'
      ? <main class="viewport-placeholder poke-frame"><PowerGrid snapshot={snapshot} /><div class="viewport-ribbon"><span class="ribbon-title">CONTA {snapshot.selectedAccount}</span><span>{selected?.title || 'PokeIdle.io'}</span><span class="ribbon-zoom">ZOOM {selected?.zoomPercent ?? 100}%</span><span class="ribbon-status"><i class={`status-dot ${selected?.status || 'booting'}`} /> {selected ? statusLabel[selected.status] : 'CARREGANDO'}</span></div></main>
      : snapshot.activeModule === 'hunt'
        ? huntSurface === 'control'
          ? <HuntAssistPanel snapshot={snapshot} />
          : <HuntView accountId={snapshot.selectedAccount} serverProfile={selected?.huntProfile} protocolStatus={selected?.huntProtocolStatus ?? 'waiting'} />
        : snapshot.activeModule === 'panel'
          ? <PanelView snapshot={snapshot} />
          : <SettingsView snapshot={snapshot} />}

    <footer class="statusbar poke-frame"><span><i class="status-ok" /> GRIDIIUM CORE ATIVO</span><span>CONTA {snapshot.selectedAccount}</span><span>{snapshot.activeModule === 'hunt' && huntSurface === 'control' ? '◆ HUNT CONTROL · SESSÃO' : snapshot.activeModule === 'hunt' ? '⚔ HUNT · ROTA' : snapshot.activeModule === 'panel' ? '▥ PAINEL · ANALYTICS DO SERVIDOR' : snapshot.activeModule === 'settings' ? '⚙ CONFIGURAÇÕES' : `ZOOM ${selected?.zoomPercent ?? 100}%`}</span><span>{selected ? powerFooter(selected.effectivePowerState) : 'CARREGANDO'}</span><span>LOOP MÁX. {snapshot.telemetry.mainEventLoopMaxMs.toFixed(1)} ms</span></footer>
  </div>
}

function PowerGrid({ snapshot }: { snapshot: GridiumSnapshot }) {
  const ids = visibleAccountIds(snapshot.layout, snapshot.selectedAccount)
  return <div class={`power-grid layout-${snapshot.layout}`}>{ids.map((id) => {
    const account = snapshot.accounts.find((item) => item.id === id)
    if (!account) return <div class="power-cell waiting" key={id}>CONTA {id}</div>
    const state = account.effectivePowerState
    return <div class={`power-cell ${state}`} key={id}>
      {state === 'black' && <div class="power-placeholder"><strong>⚫ TELA PRETA</strong><b>CONTA {id} · JOGO RODANDO</b><span>Renderer sem desenho visível.</span><button onClick={() => void window.gridium2.setAccountPowerMode(id, 'on')}>🟢 LIGAR TELA</button></div>}
      {state === 'suspended' && <div class="power-placeholder suspended-copy"><strong>⏸ CONTA SUSPENSA</strong><b>CONTA {id} · PROCESSAMENTO PAUSADO</b><span>{account.suspendSupported ? 'Lifecycle do Chromium congelado.' : 'Freeze indisponível; usando throttling máximo.'}</span><button onClick={() => void window.gridium2.setAccountPowerMode(id, 'on')}>▶ RETOMAR</button></div>}
    </div>
  })}</div>
}

function visibleAccountIds(layout: LayoutMode, selected: AccountId): AccountId[] {
  if (layout === 1) return [selected]
  if (layout === 4) return [1,2,3,4]
  const ids: AccountId[] = [1,2,3,4]
  const index = ids.indexOf(selected)
  return [...ids.slice(index), ...ids.slice(0,index)].slice(0,2)
}

function huntAccountMeta(account: GridiumSnapshot['accounts'][number]): string {
  if (account.huntProtocolStatus === 'unavailable') return 'Servidor · indisponível'
  if (account.huntProtocolStatus !== 'live') return 'Servidor · aguardando estado'
  const profile = account.huntProfile
  if (!profile) return 'Servidor ao vivo · aguardando activeId'
  const identity = profile.speciesName || (profile.speciesId !== undefined ? `Espécie #${profile.speciesId}` : `Active #${profile.activePokemonId ?? '?'}`)
  const captures = account.huntSession.capturesTotal
  return `${identity}${profile.pokemonLevel !== undefined ? ` · Nv ${profile.pokemonLevel}` : ''} · ${captures.toLocaleString('pt-BR')} cap`
}

function accountPowerMeta(account: GridiumSnapshot['accounts'][number]): string {
  const state = account.effectivePowerState === 'on' ? 'TELA LIGADA' : account.effectivePowerState === 'black' ? 'TELA PRETA · RODANDO' : 'SUSPENSA'
  return `${state} · ${account.powerMode === 'auto' ? 'AUTO' : 'MANUAL'}`
}

function powerFooter(state: GridiumSnapshot['accounts'][number]['effectivePowerState']): string {
  if (state === 'black') return '⚫ TELA PRETA · JOGO RODANDO'
  if (state === 'suspended') return '⏸ CONTA SUSPENSA'
  return '🟢 TELA LIGADA'
}

function Metric({ icon,label,value }: { icon:string; label:string; value:string }) { return <div class="metric"><span class="metric-icon">{icon}</span><span class="metric-copy"><small>{label}</small><b>{value}</b></span></div> }
function Control({ label,title,onClick }: { label:string; title:string; onClick:()=>void }) { return <button class="control" title={title} onClick={onClick}>{label}</button> }
