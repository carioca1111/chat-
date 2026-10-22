import type { AccountId, AccountPowerMode, GridiumSnapshot, PowerAutomationKey, UpdateSnapshot } from '../../shared/contracts'

const modeLabel: Record<AccountPowerMode, string> = {
  auto: 'AUTO',
  on: 'LIGADA',
  black: 'PRETA',
  suspended: 'SUSPENSA'
}

const EMPTY_UPDATE: UpdateSnapshot = {
  currentVersion: '—',
  status: 'idle',
  progress: 0,
  message: 'Atualizador iniciando…'
}

export function SettingsView({ snapshot }: { snapshot: GridiumSnapshot }) {
  const setMode = (id: AccountId, mode: AccountPowerMode) => void window.gridium2.setAccountPowerMode(id, mode)
  const setAll = (mode: AccountPowerMode) => void window.gridium2.setAllAccountsPowerMode(mode)
  const setAutomation = (key: PowerAutomationKey, enabled: boolean) => void window.gridium2.setPowerAutomation(key, enabled)
  const setKeepDisplayAwake = (enabled: boolean) => void window.gridium2.setKeepDisplayAwake(enabled)
  const update = snapshot.updater ?? EMPTY_UPDATE
  const checking = update.status === 'checking'
  const downloading = update.status === 'downloading'

  return <main class="settings-shell poke-frame">
    <div class="settings-head">
      <div>
        <span class="settings-kicker">⚙ CENTRO DE CONTROLE</span>
        <h1>CONFIGURAÇÕES</h1>
        <p>Controle de tela, execução, economia e atualizações do Gridium.</p>
      </div>
      <button class="settings-close" onClick={() => void window.gridium2.setModule('accounts')}>✕ FECHAR</button>
    </div>

    <div class="settings-layout">
      <nav class="settings-nav poke-card">
        <button class="active"><span>⚡</span><b>Desempenho</b><small>Tela e execução</small></button>
        <button disabled><span>◉</span><b>Contas</b><small>Em breve</small></button>
        <button disabled><span>▣</span><b>Interface</b><small>Em breve</small></button>
        <button disabled><span>▥</span><b>Diagnóstico</b><small>Em breve</small></button>
      </nav>

      <section class="settings-content">
        <div class="settings-section poke-card">
          <div class="settings-section-title">
            <div><span>ATUALIZAÇÕES DO GRIDIUM</span><small>Versão instalada: {update.currentVersion}</small></div>
          </div>
          <div class="global-power-actions">
            <button disabled={checking || downloading} onClick={() => void window.gridium2.checkForUpdates()}>
              {checking ? '⌛ VERIFICANDO…' : '↻ VERIFICAR ATUALIZAÇÃO'}
            </button>
            {update.status === 'available' && <button onClick={() => void window.gridium2.downloadUpdate()}>⬇ BAIXAR {update.availableVersion}</button>}
            {downloading && <button disabled>⬇ BAIXANDO {update.progress}%</button>}
            {update.status === 'ready' && <button onClick={() => void window.gridium2.installUpdate()}>✓ INSTALAR E REINICIAR</button>}
          </div>
          <div style={{ marginTop: '8px' }}>
            <small>{update.message}</small>
            {downloading && <progress max={100} value={update.progress} style={{ width: '100%', marginTop: '6px' }} />}
          </div>
        </div>

        <div class="settings-section poke-card">
          <div class="settings-section-title">
            <div><span>CONTROLE RÁPIDO</span><small>Aplica nas quatro contas</small></div>
          </div>
          <div class="global-power-actions">
            <button onClick={() => setAll('auto')}>⚡ TODAS EM AUTO</button>
            <button onClick={() => setAll('on')}>🟢 LIGAR TODAS</button>
            <button class="black-action" onClick={() => setAll('black')}>⚫ APAGAR TELAS</button>
            <button class="suspend-action" onClick={() => setAll('suspended')}>⏸ SUSPENDER TODAS</button>
          </div>
        </div>

        <div class="settings-section poke-card">
          <div class="settings-section-title">
            <div><span>ESTADO POR CONTA</span><small>Tela preta mantém o jogo ativo; suspender congela a página</small></div>
          </div>
          <div class="account-power-list">
            {snapshot.accounts.map((account) => <div class="power-row" key={account.id}>
              <div class="power-account-copy">
                <span class={`power-light ${account.effectivePowerState}`} />
                <div><b>CONTA {account.id}</b><small>{powerDescription(account.effectivePowerState, account.suspendSupported)}</small></div>
              </div>
              <div class="power-mode-buttons">
                {(['auto','on','black','suspended'] as AccountPowerMode[]).map((mode) => <button
                  key={mode}
                  class={`${account.powerMode === mode ? 'active' : ''} mode-${mode}`}
                  onClick={() => setMode(account.id, mode)}
                >{modeLabel[mode]}</button>)}
              </div>
            </div>)}
          </div>
        </div>

        <div class="settings-section poke-card">
          <div class="settings-section-title">
            <div><span>ENERGIA DO PC</span><small>Comportamento do monitor enquanto o Gridium está aberto</small></div>
          </div>
          <div class="settings-switches">
            <SettingSwitch
              title="Manter tela do PC ligada"
              description="Impede o Windows de desligar o monitor enquanto o Gridium estiver aberto. Ao fechar o app, o bloqueio é removido e o Windows volta ao normal."
              checked={snapshot.keepDisplayAwake}
              onChange={setKeepDisplayAwake}
            />
          </div>
        </div>

        <div class="settings-section poke-card">
          <div class="settings-section-title">
            <div><span>AUTOMAÇÃO</span><small>Usada apenas quando uma conta está em AUTO</small></div>
          </div>
          <div class="settings-switches">
            <SettingSwitch
              title="Tela preta nas contas fora de foco"
              description="Em layouts com várias contas, mantém só a selecionada desenhando."
              checked={snapshot.powerAutomation.blackUnfocused}
              onChange={(value) => setAutomation('blackUnfocused', value)}
            />
            <SettingSwitch
              title="Tela preta ao minimizar"
              description="O jogo continua ativo, mas o Gridium não mantém as telas desenhando."
              checked={snapshot.powerAutomation.blackWhenMinimized}
              onChange={(value) => setAutomation('blackWhenMinimized', value)}
            />
            <SettingSwitch
              title="Ligar tela ao selecionar"
              description="Ao escolher uma conta em AUTO, ela volta imediatamente para tela ligada."
              checked={snapshot.powerAutomation.wakeOnSelect}
              onChange={(value) => setAutomation('wakeOnSelect', value)}
            />
          </div>
        </div>

        <div class="settings-warning">
          <b>⚠ DIFERENÇA IMPORTANTE</b>
          <span><strong>TELA PRETA</strong> remove apenas a renderização visível e desativa o throttling daquela conta para manter o JavaScript rodando. <strong>SUSPENDER</strong> tenta congelar o lifecycle do Chromium; timers e lógica da página podem parar até você retomar.</span>
        </div>
      </section>
    </div>
  </main>
}

function powerDescription(state: GridiumSnapshot['accounts'][number]['effectivePowerState'], suspendSupported: boolean): string {
  if (state === 'on') return 'Tela ligada · jogo visível quando estiver no layout'
  if (state === 'black') return 'Tela preta · renderer continua ativo'
  return suspendSupported ? 'Suspensa · lifecycle congelado' : 'Suspensão parcial · Chromium não aceitou freeze'
}

function SettingSwitch({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label class="setting-switch-row">
    <span><b>{title}</b><small>{description}</small></span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange((event.currentTarget as HTMLInputElement).checked)} />
    <i />
  </label>
}
