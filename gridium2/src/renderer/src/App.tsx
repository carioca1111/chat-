import { useEffect, useMemo, useState } from 'preact/hooks'
import type {
  AccountCommand,
  AccountId,
  GridiumSnapshot,
  LayoutMode,
  PerformanceMode
} from '../../shared/contracts'

const initial: GridiumSnapshot = {
  layout: 4,
  selectedAccount: 1,
  performanceMode: 'auto',
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
  booting: 'INICIANDO',
  loading: 'CARREGANDO',
  ready: 'ONLINE',
  offline: 'OFFLINE',
  crashed: 'REINICIAR'
} as const

const modules = [
  ['◉', 'CONTAS', true],
  ['⚔', 'HUNT', false],
  ['✦', 'SHINY', false],
  ['▣', 'MARKET', false],
  ['⌖', 'SNIPER', false],
  ['▤', 'AUTOMARKET', false],
  ['▥', 'PAINEL', false]
] as const

export function App() {
  const [snapshot, setSnapshot] = useState<GridiumSnapshot>(initial)

  useEffect(() => {
    let alive = true
    void window.gridium2.getSnapshot().then((next) => alive && setSnapshot(next))
    const unsubscribe = window.gridium2.onSnapshot(setSnapshot)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const selected = useMemo(
    () => snapshot.accounts.find((account) => account.id === snapshot.selectedAccount),
    [snapshot.accounts, snapshot.selectedAccount]
  )

  const onlineCount = snapshot.accounts.filter((account) => account.status === 'ready').length
  const ecoCount = snapshot.accounts.filter((account) => account.visualMode === 'eco').length

  const setLayout = (mode: LayoutMode) => void window.gridium2.setLayout(mode)
  const setPerformanceMode = (mode: PerformanceMode) => void window.gridium2.setPerformanceMode(mode)
  const select = (id: AccountId) => void window.gridium2.selectAccount(id)
  const command = (id: AccountId, action: AccountCommand) => void window.gridium2.accountCommand(id, action)

  return (
    <div class="shell">
      <aside class="sidebar poke-frame">
        <div class="brand-panel">
          <div class="brand-ball" aria-hidden="true"><span /></div>
          <div class="brand-copy">
            <strong>GRIDIIUM <em>2</em></strong>
            <span>MULTI-ACCOUNT MANAGER</span>
          </div>
        </div>

        <div class="section-label">
          <span>CONTAS ({onlineCount}/4)</span>
          <span class="tiny-chip">CORE</span>
        </div>

        <div class="accounts">
          {snapshot.accounts.length === 0 ? (
            <div class="skeleton-card poke-card">Preparando as 4 sessões…</div>
          ) : (
            snapshot.accounts.map((account) => (
              <button
                class={`account-card poke-card ${account.id === snapshot.selectedAccount ? 'selected' : ''}`}
                onClick={() => select(account.id)}
                key={account.id}
              >
                <span class="account-orb" aria-hidden="true">{account.id}</span>
                <span class="account-main">
                  <span class="account-line">
                    <b>Conta {account.id}</b>
                    <small class={`account-status ${account.status}`}>
                      <i class={`status-dot ${account.status}`} /> {statusLabel[account.status]}
                    </small>
                  </span>
                  <span class="account-title">{account.title || 'PokeIdle.io'}</span>
                  <span class="account-meta">
                    Sessão isolada
                    {account.visualMode === 'eco' ? ' · ECO' : ' · QUALIDADE'}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        <div class="perf-card poke-card">
          <div class="perf-title">
            <span>DESEMPENHO</span>
            <span class={`mode-badge ${snapshot.performanceMode}`}>{snapshot.performanceMode === 'auto' ? 'AUTO ECO' : 'FULL'}</span>
          </div>
          <div class="perf-grid">
            <Metric icon="⚙" label="CPU" value={`${snapshot.telemetry.cpuPercent.toFixed(1)}%`} />
            <Metric icon="▦" label="RAM" value={`${snapshot.telemetry.memoryMB.toFixed(0)} MB`} />
            <Metric icon="⚡" label="LOOP" value={`${snapshot.telemetry.mainEventLoopMeanMs.toFixed(1)} ms`} />
            <Metric icon="●" label="PROCESSOS" value={`${snapshot.telemetry.processCount}`} />
          </div>
        </div>

        <div class="sidebar-footer">
          <span class="pulse" /> {onlineCount} contas online · {ecoCount} em eco visual
        </div>
      </aside>

      <header class="topbar poke-frame">
        <nav class="module-nav" aria-label="Módulos do Gridium 2">
          {modules.map(([icon, label, enabled]) => (
            <button
              class={`module-button ${enabled ? 'active' : 'locked'}`}
              disabled={!enabled}
              title={enabled ? label : `${label} entra nas próximas versões`}
              key={label}
            >
              <span class="module-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div class="top-tools">
          <div class="layout-picker poke-toggle" aria-label="Layout das contas">
            {([1, 2, 4] as LayoutMode[]).map((mode) => (
              <button class={snapshot.layout === mode ? 'active' : ''} onClick={() => setLayout(mode)} key={mode}>
                {mode === 1 ? '1×1' : mode === 2 ? '1×2' : '2×2'}
              </button>
            ))}
          </div>

          <div class="performance-picker poke-toggle" aria-label="Modo de desempenho">
            <button
              class={snapshot.performanceMode === 'auto' ? 'active' : ''}
              onClick={() => setPerformanceMode('auto')}
              title="Conta selecionada em qualidade total; demais com efeitos visuais reduzidos"
            >
              ⚡ ECO
            </button>
            <button
              class={snapshot.performanceMode === 'full' ? 'active' : ''}
              onClick={() => setPerformanceMode('full')}
              title="Todas as contas em qualidade visual completa"
            >
              FULL
            </button>
          </div>

          <div class="account-controls">
            <Control label="←" title="Voltar" onClick={() => command(snapshot.selectedAccount, 'back')} />
            <Control label="→" title="Avançar" onClick={() => command(snapshot.selectedAccount, 'forward')} />
            <Control label="⌂" title="PokeIdle.io" onClick={() => command(snapshot.selectedAccount, 'home')} />
            <Control label="↻" title="Recarregar" onClick={() => command(snapshot.selectedAccount, 'reload')} />
          </div>
        </div>
      </header>

      <main class="viewport-placeholder poke-frame">
        <div class="viewport-ribbon">
          <span class="ribbon-title">CONTA {snapshot.selectedAccount}</span>
          <span>{selected?.title || 'PokeIdle.io'}</span>
          <span class="ribbon-status"><i class={`status-dot ${selected?.status || 'booting'}`} /> {selected ? statusLabel[selected.status] : 'CARREGANDO'}</span>
        </div>
        <div class="empty-message">As telas nativas do PokeIdle são renderizadas sobre esta área.</div>
      </main>

      <footer class="statusbar poke-frame">
        <span><i class="status-ok" /> GRIDIIUM CORE ATIVO</span>
        <span>CONTA {snapshot.selectedAccount}</span>
        <span>{snapshot.performanceMode === 'auto' ? '⚡ AUTO ECO' : '◆ QUALIDADE TOTAL'}</span>
        <span>LOOP MÁX. {snapshot.telemetry.mainEventLoopMaxMs.toFixed(1)} ms</span>
      </footer>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div class="metric">
      <span class="metric-icon">{icon}</span>
      <span class="metric-copy">
        <small>{label}</small>
        <b>{value}</b>
      </span>
    </div>
  )
}

function Control({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button class="control" title={title} onClick={onClick}>
      {label}
    </button>
  )
}
