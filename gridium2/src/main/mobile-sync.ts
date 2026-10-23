import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AccountSnapshot, GridiumSnapshot, MobileSyncSettingsInput, MobileSyncSnapshot, PanelAnalyticsSnapshot } from '../shared/contracts'
import { getMobileHuntSummary } from './mobile-hunt-cache'

const DEFAULT_RELAY = 'https://pokegrid-relay-209e4eb1d9.onrender.com'
const PUSH_INTERVAL_MS = 5_000
const REQUEST_TIMEOUT_MS = 9_000

type Persisted = { version: 1; enabled: boolean; relayUrl: string; encryptedToken?: string }
const DEFAULT_SETTINGS: Persisted = { version: 1, enabled: false, relayUrl: DEFAULT_RELAY }

export class MobileSyncRuntime {
  private readonly settingsPath = join(app.getPath('userData'), 'gridium2-mobile-sync.json')
  private settings: Persisted = { ...DEFAULT_SETTINGS }
  private timer: ReturnType<typeof setInterval> | null = null
  private status: MobileSyncSnapshot['status'] = 'unconfigured'
  private message = 'Configure a chave privada do relay para ativar o Gridium Mobile.'
  private lastPushAt = 0
  private lastError = ''
  private pairCode = ''
  private pairExpiresAt = 0
  private busy = false

  constructor(private readonly snapshotProvider: () => GridiumSnapshot, private readonly onChanged: () => void) {
    this.load(); this.refreshStatus()
  }

  start(): void { if (!this.timer) { this.timer = setInterval(() => void this.tick(), PUSH_INTERVAL_MS); void this.tick() } }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null }

  snapshot(): MobileSyncSnapshot {
    const pairValid = Boolean(this.pairCode && this.pairExpiresAt > Date.now())
    return {
      enabled: this.settings.enabled, relayUrl: this.settings.relayUrl, tokenConfigured: Boolean(this.decryptToken()),
      status: this.status, message: this.message, lastPushAt: this.lastPushAt || undefined,
      lastError: this.lastError || undefined, pairCode: pairValid ? this.pairCode : undefined,
      pairExpiresAt: pairValid ? this.pairExpiresAt : undefined
    }
  }

  updateSettings(input: MobileSyncSettingsInput): MobileSyncSnapshot {
    this.settings = { ...this.settings, enabled: Boolean(input.enabled), relayUrl: normalizeRelay(input.relayUrl) }
    const token = String(input.privateToken || '').trim()
    if (token) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia segura do Windows indisponível para salvar a chave do Mobile Sync.')
      this.settings.encryptedToken = safeStorage.encryptString(token).toString('base64')
    }
    this.persist(); this.lastError = ''; this.pairCode = ''; this.pairExpiresAt = 0; this.refreshStatus(); this.onChanged()
    if (this.settings.enabled) void this.tick()
    return this.snapshot()
  }

  async createPairCode(): Promise<MobileSyncSnapshot> {
    const token = this.decryptToken()
    if (!token) return this.setError('Salve a chave privada do relay antes de gerar o código.')
    this.status = 'syncing'; this.message = 'Gerando código de pareamento…'; this.onChanged()
    try {
      const result = await this.request('/api/v1/pair/start', token, { method: 'POST', body: '{}' }) as Record<string, unknown>
      const code = String(result.code || ''), expiresAt = Number(result.expiresAt) || 0
      if (!/^\d{6}$/.test(code) || expiresAt <= Date.now()) throw new Error('Resposta de pareamento inválida.')
      this.pairCode = code; this.pairExpiresAt = expiresAt; this.status = 'online'
      this.message = 'Código pronto. Digite os 6 números no Gridium Mobile.'; this.lastError = ''
    } catch (error) { return this.setError(`Falha ao gerar código: ${errorMessage(error)}`) }
    this.onChanged(); return this.snapshot()
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.settings.enabled) return
    const token = this.decryptToken()
    if (!token) { this.refreshStatus(); this.onChanged(); return }
    this.busy = true; this.status = 'syncing'
    try {
      await this.request('/api/v1/push', token, { method: 'POST', body: JSON.stringify(buildMobilePayload(this.snapshotProvider())) })
      this.lastPushAt = Date.now(); this.lastError = ''; this.status = 'online'; this.message = 'Gridium Mobile sincronizado.'
    } catch (error) {
      this.status = 'error'; this.lastError = errorMessage(error); this.message = `Mobile Sync: ${this.lastError}`
    } finally { this.busy = false; this.onChanged() }
  }

  private async request(pathname: string, token: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.settings.relayUrl}${pathname}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(String(payload.error || `HTTP ${response.status}`))
    return payload
  }

  private setError(message: string): MobileSyncSnapshot { this.status = 'error'; this.message = message; this.lastError = message; this.onChanged(); return this.snapshot() }
  private refreshStatus(): void {
    if (!this.decryptToken()) { this.status = 'unconfigured'; this.message = 'Configure a chave privada do relay para ativar o Gridium Mobile.' }
    else if (!this.settings.enabled) { this.status = 'idle'; this.message = 'Mobile Sync configurado, mas desligado.' }
    else { this.status = 'idle'; this.message = 'Mobile Sync pronto para sincronizar.' }
  }
  private decryptToken(): string { if (!this.settings.encryptedToken || !safeStorage.isEncryptionAvailable()) return ''; try { return safeStorage.decryptString(Buffer.from(this.settings.encryptedToken, 'base64')) } catch { return '' } }
  private load(): void { try { const p = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as Partial<Persisted>; this.settings = { ...DEFAULT_SETTINGS, ...p, version: 1, relayUrl: normalizeRelay(p.relayUrl || DEFAULT_RELAY) } } catch { this.settings = { ...DEFAULT_SETTINGS } } }
  private persist(): void { writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8') }
}

export function buildMobilePayload(snapshot: GridiumSnapshot): Record<string, unknown> {
  const at = Date.now(), accounts = snapshot.accounts.slice(0, 4)
  const totals = accounts.reduce((o, a) => {
    const p = a.panelAnalytics
    o.capturas += p.capturesTotal; o.capturasHora += p.capturesLastHour; o.xp += p.pokemonXpTotal; o.xpHora += p.pokemonXpLastHour
    o.gold += p.goldEarnedTotal; o.goldHora += p.goldEarnedLastHour; o.marketCoins += p.marketCoinsRevenue; o.marketGems += p.marketGemsRevenue
    o.rmt += p.rmtBrlRevenue; o.shinies += p.shiniesCaught; o.shiniesVistos += p.shiniesSeen || 0; return o
  }, { capturas: 0, capturasHora: 0, xp: 0, xpHora: 0, gold: 0, goldHora: 0, marketCoins: 0, marketGems: 0, rmt: 0, shinies: 0, shiniesVistos: 0 })
  const events = accounts.flatMap((a) => a.panelAnalytics.events.slice(0, 20).map((e) => ({ ...e, accountId: a.id }))).sort((a,b) => b.at-a.at).slice(0,30)
  return {
    version: 20, at, paused: false,
    total: {
      values: { capturas: totals.capturas, xpPokemon: totals.xp, gold: totals.gold, marketCoins: totals.marketCoins, marketGems: totals.marketGems, rmtBrl: totals.rmt, shinies: totals.shinies, shiniesVistos: totals.shiniesVistos },
      rates: { capturas: totals.capturasHora, xpPokemon: totals.xpHora, gold: totals.goldHora },
      ms: Math.max(60_000, ...accounts.map((a) => at-a.panelAnalytics.sessionStartedAt)),
      accountMs: accounts.reduce((s,a) => s+Math.max(0,at-a.panelAnalytics.sessionStartedAt),0), count: accounts.length
    },
    rows: accounts.map((a) => mobileAccountRow(a, snapshot)), forecasts: [], events,
    server: { gridium2: {
      version: snapshot.updater?.currentVersion || app.getVersion(), generatedAt: at, selectedAccount: snapshot.selectedAccount,
      performanceMode: snapshot.performanceMode, telemetry: snapshot.telemetry, updater: snapshot.updater,
      whatsapp: snapshot.whatsapp ? { enabled: snapshot.whatsapp.enabled, reportTime: snapshot.whatsapp.reportTime, alertShiny: snapshot.whatsapp.alertShiny, alertP5: snapshot.whatsapp.alertP5, tokenConfigured: snapshot.whatsapp.tokenConfigured, status: snapshot.whatsapp.status, message: snapshot.whatsapp.message, lastSentAt: snapshot.whatsapp.lastSentAt } : null,
      sentinel: snapshot.sentinel ? { enabled: snapshot.sentinel.enabled, autoRecover: snapshot.sentinel.autoRecover, anomalyDetection: snapshot.sentinel.anomalyDetection, updatedAt: snapshot.sentinel.updatedAt } : null,
      autoMarket: { mode: snapshot.autoMarket.mode, lastTickAt: snapshot.autoMarket.lastTickAt, catalog: snapshot.autoMarket.catalog.slice(0,30) }
    }}
  }
}

function mobileAccountRow(account: AccountSnapshot, snapshot: GridiumSnapshot): Record<string, unknown> {
  const panel = compactPanel(account.panelAnalytics)
  const market = snapshot.autoMarket.accounts.find((x) => x.accountId === account.id)
  const sentinel = snapshot.sentinel?.accounts.find((x) => x.accountId === account.id)
  return {
    slot: account.id-1, status: account.status,
    health: account.status === 'ready' ? 'online' : account.status === 'loading' || account.status === 'booting' ? 'idle' : 'offline',
    lastChange: account.huntProfile?.detectedAt || Date.now(),
    record: { nick: account.huntProfile?.serverNick || account.name || `Conta ${account.id}`, values: {
      capturas: panel.capturesTotal, xpPokemon: panel.pokemonXpTotal, gold: panel.goldEarnedTotal,
      marketCoins: panel.marketCoinsRevenue, marketGems: panel.marketGemsRevenue, rmtBrl: panel.rmtBrlRevenue,
      shinies: panel.shiniesCaught, trainerLevel: account.huntProfile?.trainerLevel, pokemonLevel: account.huntProfile?.pokemonLevel
    }, ms: Math.max(60_000,Date.now()-panel.sessionStartedAt), since: panel.sessionStartedAt, updated: Date.now() },
    gridium2: {
      account: { id: account.id, name: account.name, title: account.title, status: account.status, attached: account.attached, visualMode: account.visualMode, zoomPercent: account.zoomPercent, powerMode: account.powerMode, effectivePowerState: account.effectivePowerState },
      panel,
      hunt: { protocolStatus: account.huntProtocolStatus, profile: account.huntProfile },
      huntIntelligence: getMobileHuntSummary(account.id),
      autoMarket: market ? { connected: market.connected, socketReady: market.socketReady, serverNick: market.serverNick, coins: market.coins, gems: market.gems, lastServerAt: market.lastServerAt, inventory: market.inventory.slice(0,50), rules: market.rules, statuses: market.statuses, pending: market.pending, lastAction: market.lastAction } : null,
      sentinel: sentinel || null
    }
  }
}

function compactPanel(panel: PanelAnalyticsSnapshot): PanelAnalyticsSnapshot { return { ...panel, rareItems: panel.rareItems.slice(0,40), historyMinute: panel.historyMinute.slice(-120), historyHour: panel.historyHour.slice(-72), historyDay: panel.historyDay.slice(-30), events: panel.events.slice(0,30) } }
function normalizeRelay(value: string): string { const raw=String(value||'').trim()||DEFAULT_RELAY; try { const u=new URL(raw); if(u.protocol!=='https:'&&u.hostname!=='localhost'&&u.hostname!=='127.0.0.1')throw new Error('insecure'); return u.toString().replace(/\/$/,'') } catch { return DEFAULT_RELAY } }
function errorMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0,220) }
