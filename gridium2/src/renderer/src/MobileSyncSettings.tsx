import { useEffect, useState } from 'preact/hooks'
import type { MobileSyncSettingsInput, MobileSyncSnapshot } from '../../shared/contracts'

const DEFAULT_SYNC: MobileSyncSnapshot = {
  enabled: false,
  relayUrl: 'https://pokegrid-relay-209e4eb1d9.onrender.com',
  tokenConfigured: false,
  status: 'unconfigured',
  message: 'Mobile Sync não configurado.'
}

export function MobileSyncSettings({ sync = DEFAULT_SYNC }: { sync?: MobileSyncSnapshot }) {
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState<MobileSyncSettingsInput>({
    enabled: sync.enabled,
    relayUrl: sync.relayUrl,
    privateToken: ''
  })

  useEffect(() => {
    setForm((current) => ({ ...current, enabled: sync.enabled, relayUrl: sync.relayUrl, privateToken: '' }))
  }, [sync.enabled, sync.relayUrl, sync.tokenConfigured])

  const save = async () => {
    setBusy('save')
    try { await window.gridium2.saveMobileSyncSettings(form) } finally { setBusy('') }
  }

  const pair = async () => {
    setBusy('pair')
    try { await window.gridium2.createMobilePairCode() } finally { setBusy('') }
  }

  const code = sync.pairCode || ''
  const expires = sync.pairExpiresAt && sync.pairExpiresAt > Date.now()
    ? Math.max(1, Math.ceil((sync.pairExpiresAt - Date.now()) / 60_000))
    : 0

  return <div class="settings-section poke-card whatsapp-section">
    <div class="settings-section-title">
      <div><span>📱 GRIDIUM MOBILE SYNC</span><small>Painel somente leitura · 4 contas · dados sanitizados · pareamento por código</small></div>
      <span class={`wa-status ${sync.status === 'online' ? 'sent' : sync.status === 'error' ? 'error' : 'idle'}`}>
        {sync.status === 'online' ? 'ONLINE' : sync.status === 'syncing' ? 'SINCRONIZANDO' : sync.enabled ? 'ATIVO' : 'DESLIGADO'}
      </span>
    </div>

    <div class="wa-grid">
      <label class="wa-wide"><span>URL DO RELAY</span><input value={form.relayUrl} onInput={(event) => setForm((current) => ({ ...current, relayUrl: event.currentTarget.value }))} placeholder="https://pokegrid-relay-...onrender.com" /></label>
      <label class="wa-wide"><span>CHAVE PRIVADA {sync.tokenConfigured ? '· JÁ SALVA E CRIPTOGRAFADA' : ''}</span><input type="password" value={form.privateToken || ''} onInput={(event) => setForm((current) => ({ ...current, privateToken: event.currentTarget.value }))} placeholder={sync.tokenConfigured ? 'Deixe vazio para manter a chave atual' : 'Cole POKEGRID_TOKEN do relay'} /></label>
    </div>

    <div class="settings-switches wa-switches">
      <label class="setting-switch-row"><span><b>Ativar Mobile Sync</b><small>Envia a cada poucos segundos apenas os dados do painel. Não transmite a tela e não envia cookies/login do jogo.</small></span><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.currentTarget.checked }))} /><i /></label>
    </div>

    <div class="wa-actions">
      <button disabled={Boolean(busy)} onClick={() => void save()}>{busy === 'save' ? 'SALVANDO…' : '✓ SALVAR MOBILE SYNC'}</button>
      <button disabled={Boolean(busy) || !sync.tokenConfigured} onClick={() => void pair()}>{busy === 'pair' ? 'GERANDO…' : '▦ GERAR CÓDIGO DE 6 DÍGITOS'}</button>
    </div>

    {code && <div style={{ marginTop: '14px', textAlign: 'center' }}>
      <small style={{ display: 'block', opacity: .7 }}>DIGITE ESTE CÓDIGO NO APK · EXPIRA EM ~{expires} MIN</small>
      <strong style={{ display: 'block', fontSize: '34px', letterSpacing: '10px', marginTop: '8px' }}>{code}</strong>
    </div>}

    <div class={`wa-message ${sync.status === 'online' ? 'sent' : sync.status}`}>{sync.message}{sync.lastPushAt ? ` · último envio ${new Date(sync.lastPushAt).toLocaleTimeString('pt-BR')}` : ''}</div>
    <div class="wa-template-help">
      <b>O QUE VAI PARA O CELULAR</b>
      <span>Contas, Pokémon ativo, níveis, Painel Analytics, XP, Gold de farm, capturas, P1–P5, shinies, drops, Market/RMT, AutoMarket, Sentinel, Hunt Learning, desempenho, atualizador e status do WhatsApp.</span>
      <small>A chave privada do relay, token do WhatsApp, cookies e credenciais do PokeIdle nunca são incluídos no snapshot do telefone.</small>
    </div>
  </div>
}