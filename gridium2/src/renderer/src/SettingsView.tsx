import { useEffect, useState } from 'preact/hooks'
import type {
  AccountId,
  AccountPowerMode,
  GridiumSnapshot,
  PowerAutomationKey,
  SentinelSnapshot,
  UpdateSnapshot,
  WhatsAppSettingsInput,
  WhatsAppSnapshot
} from '../../shared/contracts'
import { MobileSyncSettings } from './MobileSyncSettings'
import './sentinel.css'

const modeLabel: Record<AccountPowerMode, string> = {
  auto: 'AUTO', on: 'LIGADA', black: 'PRETA', suspended: 'SUSPENSA'
}
const EMPTY_UPDATE: UpdateSnapshot = { currentVersion: '—', status: 'idle', progress: 0, message: 'Atualizador iniciando…' }
const EMPTY_WHATSAPP: WhatsAppSnapshot = {
  enabled: false, recipient: '', phoneNumberId: '', reportTime: '00:05', templateName: 'gridium_daily_report',
  alertTemplateName: 'gridium_alert', languageCode: 'pt_BR', alertShiny: false, alertP5: false,
  tokenConfigured: false, status: 'unconfigured', message: 'WhatsApp não configurado.'
}
const EMPTY_SENTINEL: SentinelSnapshot = {
  enabled: true, autoRecover: true, anomalyDetection: true, whatsappAlerts: false, accounts: [], learning: [], updatedAt: 0
}

export function SettingsView({ snapshot }: { snapshot: GridiumSnapshot }) {
  const setMode = (id: AccountId, mode: AccountPowerMode) => void window.gridium2.setAccountPowerMode(id, mode)
  const setAll = (mode: AccountPowerMode) => void window.gridium2.setAllAccountsPowerMode(mode)
  const setAutomation = (key: PowerAutomationKey, enabled: boolean) => void window.gridium2.setPowerAutomation(key, enabled)
  const setKeepDisplayAwake = (enabled: boolean) => void window.gridium2.setKeepDisplayAwake(enabled)
  const update = snapshot.updater ?? EMPTY_UPDATE
  const whatsapp = snapshot.whatsapp ?? EMPTY_WHATSAPP
  const sentinel = snapshot.sentinel ?? EMPTY_SENTINEL
  const checking = update.status === 'checking'
  const downloading = update.status === 'downloading'
  const [waBusy, setWaBusy] = useState('')
  const [recoverBusy, setRecoverBusy] = useState<AccountId | null>(null)
  const [waForm, setWaForm] = useState<WhatsAppSettingsInput>({
    enabled: whatsapp.enabled, recipient: whatsapp.recipient, phoneNumberId: whatsapp.phoneNumberId,
    reportTime: whatsapp.reportTime, templateName: whatsapp.templateName, alertTemplateName: whatsapp.alertTemplateName,
    languageCode: whatsapp.languageCode, alertShiny: whatsapp.alertShiny, alertP5: whatsapp.alertP5, accessToken: ''
  })

  useEffect(() => {
    setWaForm((current) => ({
      ...current, enabled: whatsapp.enabled, recipient: whatsapp.recipient, phoneNumberId: whatsapp.phoneNumberId,
      reportTime: whatsapp.reportTime, templateName: whatsapp.templateName, alertTemplateName: whatsapp.alertTemplateName,
      languageCode: whatsapp.languageCode, alertShiny: whatsapp.alertShiny, alertP5: whatsapp.alertP5, accessToken: ''
    }))
  }, [whatsapp.enabled, whatsapp.recipient, whatsapp.phoneNumberId, whatsapp.reportTime, whatsapp.templateName, whatsapp.alertTemplateName, whatsapp.languageCode, whatsapp.alertShiny, whatsapp.alertP5])

  const patchWa = <K extends keyof WhatsAppSettingsInput>(key: K, value: WhatsAppSettingsInput[K]) => setWaForm((current) => ({ ...current, [key]: value }))
  const saveWhatsApp = async () => { setWaBusy('save'); try { await window.gridium2.saveWhatsAppSettings(waForm) } finally { setWaBusy('') } }
  const testWhatsApp = async () => { setWaBusy('test'); try { await window.gridium2.sendWhatsAppTest() } finally { setWaBusy('') } }
  const reportNow = async () => { setWaBusy('report'); try { await window.gridium2.sendWhatsAppReportNow() } finally { setWaBusy('') } }
  const setSentinel = (patch: Partial<Pick<SentinelSnapshot, 'enabled' | 'autoRecover' | 'anomalyDetection'>>) => void window.gridium2.saveSentinelSettings({
    enabled: patch.enabled ?? sentinel.enabled,
    autoRecover: patch.autoRecover ?? sentinel.autoRecover,
    anomalyDetection: patch.anomalyDetection ?? sentinel.anomalyDetection,
    whatsappAlerts: sentinel.whatsappAlerts
  })
  const recover = async (id: AccountId) => { setRecoverBusy(id); try { await window.gridium2.recoverAccountNow(id) } finally { setRecoverBusy(null) } }

  return <main class="settings-shell poke-frame">
    <div class="settings-head">
      <div><span class="settings-kicker">⚙ CENTRO DE CONTROLE</span><h1>CONFIGURAÇÕES</h1><p>Sentinel, Mobile Sync, desempenho, WhatsApp e atualizações do Gridium.</p></div>
      <button class="settings-close" onClick={() => void window.gridium2.setModule('accounts')}>✕ FECHAR</button>
    </div>
    <div class="settings-layout">
      <nav class="settings-nav poke-card">
        <button class="active"><span>🛡</span><b>Sentinel</b><small>Saúde e recuperação</small></button>
        <button><span>📱</span><b>Mobile</b><small>Pareamento seguro</small></button>
        <button><span>☏</span><b>WhatsApp</b><small>Daily Report</small></button>
        <button disabled><span>▥</span><b>Diagnóstico</b><small>Em breve</small></button>
      </nav>
      <section class="settings-content">
        <div class="settings-section poke-card sentinel-section">
          <div class="settings-section-title"><div><span>🛡 GRIDIUM SENTINEL</span><small>Recuperação técnica + detector de anomalias + Hunt Learning</small></div><span class={`sentinel-master ${sentinel.enabled ? 'on' : 'off'}`}>{sentinel.enabled ? 'PROTEGENDO' : 'DESLIGADO'}</span></div>
          <div class="settings-switches sentinel-switches">
            <SettingSwitch title="Ativar Gridium Sentinel" description="Supervisiona as quatro contas sem polling de DOM." checked={sentinel.enabled} onChange={(value) => setSentinel({ enabled: value })} />
            <SettingSwitch title="Recuperação automática" description="Recarrega somente quando há falha técnica forte." checked={sentinel.autoRecover} onChange={(value) => setSentinel({ autoRecover: value })} />
            <SettingSwitch title="Detector de anomalias" description="Compara XP/h, Capturas/h e Gold/h com o padrão aprendido." checked={sentinel.anomalyDetection} onChange={(value) => setSentinel({ anomalyDetection: value })} />
          </div>
          <div class="sentinel-account-list">
            {([1,2,3,4] as AccountId[]).map((id) => {
              const row = sentinel.accounts.find((item) => item.accountId === id)
              const learning = row?.huntLearning
              const account = snapshot.accounts.find((item) => item.id === id)
              const state = row?.state ?? 'learning'
              return <div class={`sentinel-row state-${state}`} key={id}>
                <div class="sentinel-health"><span class="sentinel-dot" /><div><b>CONTA {id}</b><small>{sentinelStateLabel(state)}</small></div><strong>{row?.healthScore ?? 100}</strong></div>
                <div class="sentinel-copy"><b>{row?.issue ?? 'Aguardando dados…'}</b>{row?.anomaly ? <small>{metricLabel(row.anomaly.metric)} atual {compact(row.anomaly.currentPerHour)} · padrão {compact(row.anomaly.baselinePerHour)} · {Math.abs(row.anomaly.deltaPercent).toFixed(0)}% abaixo</small> : <small>{row?.lastServerAt ? `Servidor visto ${relative(row.lastServerAt)}` : 'Aguardando telemetria do servidor'}</small>}</div>
                <div class="sentinel-learning"><small>HUNT LEARNING</small><b>{learning?.huntSlug || account?.huntProfile?.huntSlug || '—'}</b><span>{learning && learning.minutesObserved > 0 ? `${compact(learning.observedXpPerHour)} XP/h · confiança ${learning.confidence}%` : 'coletando histórico real…'}</span></div>
                <button class="sentinel-recover" disabled={recoverBusy !== null || account?.effectivePowerState === 'suspended'} onClick={() => void recover(id)}>{recoverBusy === id ? 'RECUPERANDO…' : '↻ RECUPERAR AGORA'}</button>
              </div>
            })}
          </div>
          <div class="sentinel-note">Queda de desempenho gera diagnóstico, não reload automático. Recovery fica reservado a falhas técnicas.</div>
        </div>

        <MobileSyncSettings sync={snapshot.mobileSync} />

        <div class="settings-section poke-card whatsapp-section">
          <div class="settings-section-title"><div><span>WHATSAPP DAILY REPORT</span><small>Relatório das 4 contas · horário de Brasília · Meta WhatsApp Cloud API</small></div><span class={`wa-status ${whatsapp.status}`}>{whatsapp.status === 'sent' ? 'ENVIADO' : whatsapp.status === 'sending' ? 'ENVIANDO' : whatsapp.enabled ? 'ATIVO' : 'DESLIGADO'}</span></div>
          <div class="wa-grid">
            <label><span>NÚMERO DESTINO</span><input value={waForm.recipient} onInput={(event) => patchWa('recipient', event.currentTarget.value)} placeholder="Ex.: 5521999999999" /></label>
            <label><span>HORÁRIO DIÁRIO</span><input type="time" value={waForm.reportTime} onInput={(event) => patchWa('reportTime', event.currentTarget.value)} /></label>
            <label><span>PHONE NUMBER ID</span><input value={waForm.phoneNumberId} onInput={(event) => patchWa('phoneNumberId', event.currentTarget.value)} placeholder="ID do número na Meta" /></label>
            <label><span>IDIOMA DO TEMPLATE</span><input value={waForm.languageCode} onInput={(event) => patchWa('languageCode', event.currentTarget.value)} placeholder="pt_BR" /></label>
            <label class="wa-wide"><span>ACCESS TOKEN {whatsapp.tokenConfigured ? '· JÁ SALVO' : ''}</span><input type="password" value={waForm.accessToken || ''} onInput={(event) => patchWa('accessToken', event.currentTarget.value)} placeholder={whatsapp.tokenConfigured ? 'Deixe vazio para manter o token salvo' : 'Cole o token permanente da Meta'} /></label>
            <label><span>TEMPLATE DAILY</span><input value={waForm.templateName} onInput={(event) => patchWa('templateName', event.currentTarget.value)} /></label>
            <label><span>TEMPLATE ALERTAS</span><input value={waForm.alertTemplateName} onInput={(event) => patchWa('alertTemplateName', event.currentTarget.value)} /></label>
          </div>
          <div class="settings-switches wa-switches">
            <SettingSwitch title="Ativar Daily Report" description={`Enviar automaticamente todos os dias às ${waForm.reportTime || '00:05'} no horário de Brasília.`} checked={waForm.enabled} onChange={(value) => patchWa('enabled', value)} />
            <SettingSwitch title="Alerta de Shiny capturado" description="Mensagem quando uma conta confirmar a captura de shiny." checked={waForm.alertShiny} onChange={(value) => patchWa('alertShiny', value)} />
            <SettingSwitch title="Alerta de P5 capturado" description="Mensagem quando uma captura confirmada chegar como P5." checked={waForm.alertP5} onChange={(value) => patchWa('alertP5', value)} />
          </div>
          <div class="wa-actions"><button disabled={Boolean(waBusy)} onClick={() => void saveWhatsApp()}>{waBusy === 'save' ? 'SALVANDO…' : '✓ SALVAR WHATSAPP'}</button><button disabled={Boolean(waBusy) || !whatsapp.tokenConfigured} onClick={() => void testWhatsApp()}>{waBusy === 'test' ? 'ENVIANDO…' : '☏ TESTAR WHATSAPP'}</button><button disabled={Boolean(waBusy) || !whatsapp.tokenConfigured} onClick={() => void reportNow()}>{waBusy === 'report' ? 'ENVIANDO…' : '▤ ENVIAR RELATÓRIO AGORA'}</button></div>
          <div class={`wa-message ${whatsapp.status}`}>{whatsapp.message}{whatsapp.lastSentAt ? ` · último envio ${new Date(whatsapp.lastSentAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}</div>
          <div class="wa-template-help"><b>TEMPLATES PARA APROVAR NA META</b><span><strong>{waForm.templateName || 'gridium_daily_report'}</strong>: <code>📊 Gridium Daily Report{'\n'}{'{{1}}'}</code></span><span><strong>{waForm.alertTemplateName || 'gridium_alert'}</strong>: <code>🚨 Gridium Alert{'\n'}{'{{1}}'}</code></span><small>Mensagens automáticas fora da janela de 24h exigem template aprovado.</small></div>
        </div>

        <div class="settings-section poke-card">
          <div class="settings-section-title"><div><span>ATUALIZAÇÕES DO GRIDIUM</span><small>Versão instalada: {update.currentVersion}</small></div></div>
          <div class="global-power-actions"><button disabled={checking || downloading} onClick={() => void window.gridium2.checkForUpdates()}>{checking ? '⌛ VERIFICANDO…' : '↻ VERIFICAR ATUALIZAÇÃO'}</button>{update.status === 'available' && <button onClick={() => void window.gridium2.downloadUpdate()}>⬇ BAIXAR {update.availableVersion}</button>}{downloading && <button disabled>⬇ BAIXANDO {update.progress}%</button>}{update.status === 'ready' && <button onClick={() => void window.gridium2.installUpdate()}>✓ INSTALAR E REINICIAR</button>}</div>
          <div style={{ marginTop: '8px' }}><small>{update.message}</small>{downloading && <progress max={100} value={update.progress} style={{ width: '100%', marginTop: '6px' }} />}</div>
        </div>

        <div class="settings-section poke-card"><div class="settings-section-title"><div><span>CONTROLE RÁPIDO</span><small>Aplica nas quatro contas</small></div></div><div class="global-power-actions"><button onClick={() => setAll('auto')}>⚡ TODAS EM AUTO</button><button onClick={() => setAll('on')}>🟢 LIGAR TODAS</button><button class="black-action" onClick={() => setAll('black')}>⚫ APAGAR TELAS</button><button class="suspend-action" onClick={() => setAll('suspended')}>⏸ SUSPENDER TODAS</button></div></div>

        <div class="settings-section poke-card">
          <div class="settings-section-title"><div><span>ESTADO POR CONTA</span><small>Tela preta mantém o jogo ativo; suspender congela a página</small></div></div>
          <div class="account-power-list">{snapshot.accounts.map((account) => <div class="power-row" key={account.id}><div class="power-account-copy"><span class={`power-light ${account.effectivePowerState}`} /><div><b>CONTA {account.id}</b><small>{powerDescription(account.effectivePowerState, account.suspendSupported)}</small></div></div><div class="power-mode-buttons">{(['auto','on','black','suspended'] as AccountPowerMode[]).map((mode) => <button key={mode} class={`${account.powerMode === mode ? 'active' : ''} mode-${mode}`} onClick={() => setMode(account.id, mode)}>{modeLabel[mode]}</button>)}</div></div>)}</div>
        </div>

        <div class="settings-section poke-card"><div class="settings-section-title"><div><span>ENERGIA DO PC</span><small>Comportamento do monitor enquanto o Gridium está aberto</small></div></div><div class="settings-switches"><SettingSwitch title="Manter tela do PC ligada" description="Impede o Windows de desligar o monitor enquanto o Gridium estiver aberto." checked={snapshot.keepDisplayAwake} onChange={setKeepDisplayAwake} /></div></div>

        <div class="settings-section poke-card"><div class="settings-section-title"><div><span>AUTOMAÇÃO</span><small>Usada apenas quando uma conta está em AUTO</small></div></div><div class="settings-switches"><SettingSwitch title="Tela preta nas contas fora de foco" description="Em layouts com várias contas, mantém só a selecionada desenhando." checked={snapshot.powerAutomation.blackUnfocused} onChange={(value) => setAutomation('blackUnfocused', value)} /><SettingSwitch title="Tela preta ao minimizar" description="O jogo continua ativo sem manter as telas desenhando." checked={snapshot.powerAutomation.blackWhenMinimized} onChange={(value) => setAutomation('blackWhenMinimized', value)} /><SettingSwitch title="Ligar tela ao selecionar" description="Ao escolher uma conta em AUTO, ela volta para tela ligada." checked={snapshot.powerAutomation.wakeOnSelect} onChange={(value) => setAutomation('wakeOnSelect', value)} /></div></div>

        <div class="settings-warning"><b>⚠ DIFERENÇA IMPORTANTE</b><span><strong>TELA PRETA</strong> remove apenas a renderização visível. <strong>SUSPENDER</strong> tenta congelar o lifecycle do Chromium.</span></div>
      </section>
    </div>
  </main>
}

function powerDescription(state: GridiumSnapshot['accounts'][number]['effectivePowerState'], suspendSupported: boolean): string {
  if (state === 'on') return 'Tela ligada · jogo visível quando estiver no layout'
  if (state === 'black') return 'Tela preta · renderer continua ativo'
  return suspendSupported ? 'Suspensa · lifecycle congelado' : 'Suspensão parcial · Chromium não aceitou freeze'
}
function sentinelStateLabel(state: string): string { if (state === 'healthy') return 'SAUDÁVEL'; if (state === 'anomaly') return 'ANOMALIA'; if (state === 'recovering') return 'RECUPERANDO'; if (state === 'offline') return 'FALHA'; if (state === 'paused') return 'PAUSADO'; return 'APRENDENDO' }
function metricLabel(metric: string): string { if (metric === 'captures') return 'Capturas/h'; if (metric === 'gold') return 'Gold/h'; return 'XP/h' }
function compact(value: number): string { if (!Number.isFinite(value)) return '0'; const abs = Math.abs(value); if (abs >= 1e9) return `${(value / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`; if (abs >= 1e6) return `${(value / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`; if (abs >= 1e3) return `${(value / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`; return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }
function relative(at: number): string { const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000)); if (seconds < 60) return `há ${seconds}s`; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `há ${minutes}min`; return `há ${Math.floor(minutes / 60)}h` }
function SettingSwitch({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) { return <label class="setting-switch-row"><span><b>{title}</b><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange((event.currentTarget as HTMLInputElement).checked)} /><i /></label> }