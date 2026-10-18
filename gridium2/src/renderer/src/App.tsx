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
  booting: 'Iniciando',
  loading: 'Carregando',
  ready: 'Online',
  offline: 'Offline',
  crashed: 'Reinício necessário'
} as const

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

  const setLayout = (mode: LayoutMode) => void window.gridium2.setLayout(mode)
  const setPerformanceMode = (mode: PerformanceMode) => void window.gridium2.setPerformanceMode(mode)
  const select = (id: AccountId) => void window.gridium2.selectAccount(id)
  const command = (id: AccountId, action: AccountCommand) => void window.gridium2.accountCommand(id, action)

  return (
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">G2</div>
          <div>
            <strong>Gridium 2</strong>
            <span>Alpha 0.1.2 · Performance</span>
          </div>
        </div>

        <div class="nav-title">CONTAS</div>
        <div class="accounts">
          {snapshot.accounts.length === 0 ? (
            <div class="skeleton-card">Preparando as 4 sessões…</div>
          ) : (
            snapshot.accounts.map((account) => (
              <button
                class={`account-card ${account.id === snapshot.selectedAccount ? 'selected' : ''}`}
                onClick={() => select(account.id)}
                key={account.id}
              >
                <span class={`status-dot ${account.status}`} />
                <span class="account-main">
                  <b>{account.name}</b>
                  <small>
                    {statusLabel[account.status]}
                    {account.visualMode === 'eco' ? ' · ECO' : ''}
                  </small>
                </span>
                <span class="account-number">0{account.id}</span>
              </button>
            ))
          )}
        </div>

        <div class="perf-card">
          <div class="perf-title">TELEMETRIA LOCAL</div>
          <div class="perf-grid">
            <Metric label="CPU" value={`${snapshot.telemetry.cpuPercent.toFixed(1)}%`} />
            <Metric label="RAM" value={`${snapshot.telemetry.memoryMB.toFixed(0)} MB`} />
            <Metric label="Loop médio" value={`${snapshot.telemetry.mainEventLoopMeanMs.toFixed(1)} ms`} />
            <Metric label="Processos" value={`${snapshot.telemetry.processCount}`} />
          </div>
        </div>

        <div class="sidebar-footer">
          <span class="pulse" /> Auto Eco visual {snapshot.performanceMode === 'auto' ? 'ativo' : 'desligado'}
        </div>
      </aside>

      <header class="topbar">
        <div class="top-title">
          <strong>PokeIdle.io</strong>
          <span>{selected?.title || '4 sessões persistentes e isoladas'}</span>
        </div>

        <div class="layout-picker" aria-label="Layout das contas">
          {([1, 2, 4] as LayoutMode[]).map((mode) => (
            <button class={snapshot.layout === mode ? 'active' : ''} onClick={() => setLayout(mode)} key={mode}>
              {mode === 1 ? '1 tela' : mode === 2 ? '2 telas' : '4 telas'}
            </button>
          ))}
        </div>

        <div class="layout-picker performance-picker" aria-label="Modo de desempenho">
          <button
            class={snapshot.performanceMode === 'auto' ? 'active' : ''}
            onClick={() => setPerformanceMode('auto')}
            title="Mantém a conta selecionada em qualidade total e reduz apenas efeitos visuais das demais"
          >
            ⚡ Auto Eco
          </button>
          <button
            class={snapshot.performanceMode === 'full' ? 'active' : ''}
            onClick={() => setPerformanceMode('full')}
            title="Desativa a otimização visual do Gridium"
          >
            Qualidade
          </button>
        </div>

        <div class="account-controls">
          <Control label="←" title="Voltar" onClick={() => command(snapshot.selectedAccount, 'back')} />
          <Control label="→" title="Avançar" onClick={() => command(snapshot.selectedAccount, 'forward')} />
          <Control label="⌂" title="PokeIdle.io" onClick={() => command(snapshot.selectedAccount, 'home')} />
          <Control label="↻" title="Recarregar" onClick={() => command(snapshot.selectedAccount, 'reload')} />
        </div>
      </header>

      <main class="viewport-placeholder">
        <div class="empty-message">As telas do jogo são renderizadas nativamente nesta área.</div>
      </main>

      <footer class="statusbar">
        <span><i class="status-ok" /> Gridium Core ativo</span>
        <span>Conta selecionada: {snapshot.selectedAccount}</span>
        <span>Modo: {snapshot.performanceMode === 'auto' ? 'Auto Eco' : 'Qualidade total'}</span>
        <span>Event loop máx.: {snapshot.telemetry.mainEventLoopMaxMs.toFixed(1)} ms</span>
      </footer>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div class="metric">
      <span>{label}</span>
      <b>{value}</b>
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
