import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AccountId,
  AccountSnapshot,
  PanelAnalyticsSnapshot,
  WhatsAppSettingsInput,
  WhatsAppSnapshot
} from '../shared/contracts'

const GRAPH_VERSION = 'v26.0'
const TIME_ZONE = 'America/Sao_Paulo'
const CHECK_INTERVAL_MS = 30_000
const MAX_REPORT_TEXT = 950

type BaselineMap = Partial<Record<AccountId, AccountBaseline>>

interface AccountBaseline {
  capturesTotal: number
  capturesByPotency: [number, number, number, number, number]
  note35Plus: number
  shiniesCaught: number
  pokemonXpTotal: number
  goldEarnedTotal: number
  rareItems: Record<string, number>
}

interface PersistedSettings {
  version: 1
  enabled: boolean
  recipient: string
  phoneNumberId: string
  reportTime: string
  templateName: string
  alertTemplateName: string
  languageCode: string
  alertShiny: boolean
  alertP5: boolean
  encryptedToken?: string
}

interface PersistedState {
  version: 1
  baselineCapturedAt: number
  baseline: BaselineMap
  lastDailyDate?: string
  lastSentAt?: number
  lastMessageId?: string
}

const DEFAULT_SETTINGS: PersistedSettings = {
  version: 1,
  enabled: false,
  recipient: '',
  phoneNumberId: '',
  reportTime: '00:05',
  templateName: 'gridium_daily_report',
  alertTemplateName: 'gridium_alert',
  languageCode: 'pt_BR',
  alertShiny: false,
  alertP5: false
}

export class WhatsAppReporter {
  private readonly settingsPath = join(app.getPath('userData'), 'gridium2-whatsapp.json')
  private readonly statePath = join(app.getPath('userData'), 'gridium2-whatsapp-report-state.json')
  private settings: PersistedSettings = { ...DEFAULT_SETTINGS }
  private state: PersistedState = { version: 1, baselineCapturedAt: Date.now(), baseline: {} }
  private timer: ReturnType<typeof setInterval> | null = null
  private status: WhatsAppSnapshot['status'] = 'idle'
  private message = 'WhatsApp não configurado.'
  private lastError = ''
  private alertBootstrapped = false
  private readonly seenEvents = new Set<string>()
  private sendInFlight = false

  constructor(
    private readonly accountsProvider: () => AccountSnapshot[],
    private readonly onChanged: () => void
  ) {
    this.load()
    this.refreshStatus()
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  snapshot(): WhatsAppSnapshot {
    return {
      enabled: this.settings.enabled,
      recipient: this.settings.recipient,
      phoneNumberId: this.settings.phoneNumberId,
      reportTime: this.settings.reportTime,
      templateName: this.settings.templateName,
      alertTemplateName: this.settings.alertTemplateName,
      languageCode: this.settings.languageCode,
      alertShiny: this.settings.alertShiny,
      alertP5: this.settings.alertP5,
      tokenConfigured: Boolean(this.decryptToken()),
      status: this.status,
      message: this.message,
      lastSentAt: this.state.lastSentAt,
      lastMessageId: this.state.lastMessageId,
      lastError: this.lastError || undefined
    }
  }

  updateSettings(input: WhatsAppSettingsInput): WhatsAppSnapshot {
    const wasEnabled = this.settings.enabled
    this.settings = {
      ...this.settings,
      enabled: Boolean(input.enabled),
      recipient: digits(input.recipient),
      phoneNumberId: digits(input.phoneNumberId),
      reportTime: normalizeTime(input.reportTime),
      templateName: normalizeTemplate(input.templateName, 'gridium_daily_report'),
      alertTemplateName: normalizeTemplate(input.alertTemplateName, 'gridium_alert'),
      languageCode: normalizeLanguage(input.languageCode),
      alertShiny: Boolean(input.alertShiny),
      alertP5: Boolean(input.alertP5)
    }

    const token = String(input.accessToken || '').trim()
    if (token) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia segura do Windows indisponível para salvar o token.')
      this.settings.encryptedToken = safeStorage.encryptString(token).toString('base64')
    }

    this.persistSettings()
    if (this.settings.enabled && (!wasEnabled || Object.keys(this.state.baseline).length === 0)) {
      this.captureBaseline(this.accountsProvider())
    }
    this.lastError = ''
    this.refreshStatus()
    this.onChanged()
    void this.tick()
    return this.snapshot()
  }

  async sendTest(): Promise<WhatsAppSnapshot> {
    await this.sendTemplate(
      this.settings.templateName,
      '✅ Gridium conectado ao WhatsApp. Este é um teste do canal de Daily Report.'
    )
    return this.snapshot()
  }

  async sendReportNow(): Promise<WhatsAppSnapshot> {
    const accounts = this.accountsProvider()
    const text = this.buildDailyReport(accounts, false)
    await this.sendTemplate(this.settings.templateName, text)
    return this.snapshot()
  }

  observe(accounts: AccountSnapshot[]): void {
    const keys: string[] = []
    for (const account of accounts) {
      for (const event of account.panelAnalytics.events) {
        const key = `${account.id}:${event.at}:${event.accountEvent}:${event.label}:${event.detail}`
        keys.push(key)
        if (!this.alertBootstrapped || this.seenEvents.has(key)) continue
        this.seenEvents.add(key)
        if (!this.settings.enabled || !this.isConfigured()) continue
        if (event.accountEvent === 'shiny-caught' && this.settings.alertShiny) {
          void this.sendAlert(`✨ SHINY CAPTURADO\nConta ${account.id} · ${event.label}\n${event.detail}`)
        } else if (/\bP5\b/i.test(event.detail) && this.settings.alertP5) {
          void this.sendAlert(`💎 P5 CAPTURADO\nConta ${account.id} · ${event.label}\n${event.detail}`)
        }
      }
    }
    if (!this.alertBootstrapped) {
      for (const key of keys) this.seenEvents.add(key)
      this.alertBootstrapped = true
    }
    if (this.seenEvents.size > 500) {
      const recent = [...this.seenEvents].slice(-250)
      this.seenEvents.clear()
      for (const key of recent) this.seenEvents.add(key)
    }
  }

  private async tick(): Promise<void> {
    if (!this.settings.enabled || !this.isConfigured() || this.sendInFlight) return
    const now = Date.now()
    const local = brasiliaParts(now)
    if (local.time < this.settings.reportTime || this.state.lastDailyDate === local.date) return
    const accounts = this.accountsProvider()
    if (!accounts.length) return

    if (!Object.keys(this.state.baseline).length) {
      this.captureBaseline(accounts)
      return
    }

    try {
      const text = this.buildDailyReport(accounts, true)
      await this.sendTemplate(this.settings.templateName, text)
      this.state.lastDailyDate = local.date
      this.captureBaseline(accounts, false)
      this.persistState()
    } catch {
      // sendTemplate already records the visible error; retry on the next tick.
    }
  }

  private async sendAlert(text: string): Promise<void> {
    try {
      await this.sendTemplate(this.settings.alertTemplateName, text)
    } catch {
      // Alert failure is exposed in Settings and does not interrupt the app.
    }
  }

  private async sendTemplate(templateName: string, text: string): Promise<void> {
    if (this.sendInFlight) throw new Error('Já existe um envio do WhatsApp em andamento.')
    const token = this.decryptToken()
    if (!token || !this.settings.phoneNumberId || !this.settings.recipient) {
      this.setError('WhatsApp incompleto: configure token, Phone Number ID e número destino.')
      throw new Error(this.lastError)
    }

    this.sendInFlight = true
    this.status = 'sending'
    this.message = 'Enviando mensagem pelo WhatsApp…'
    this.lastError = ''
    this.onChanged()

    try {
      const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(this.settings.phoneNumberId)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: this.settings.recipient,
          type: 'template',
          template: {
            name: templateName,
            language: { code: this.settings.languageCode },
            components: [{
              type: 'body',
              parameters: [{ type: 'text', text: text.slice(0, MAX_REPORT_TEXT) }]
            }]
          }
        }),
        signal: AbortSignal.timeout(20_000)
      })
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok) {
        const error = (payload.error && typeof payload.error === 'object') ? payload.error as Record<string, unknown> : {}
        const detail = String(error.message || `HTTP ${response.status}`)
        throw new Error(detail)
      }
      const messages = Array.isArray(payload.messages) ? payload.messages : []
      const first = messages[0] && typeof messages[0] === 'object' ? messages[0] as Record<string, unknown> : null
      this.state.lastSentAt = Date.now()
      this.state.lastMessageId = first?.id ? String(first.id) : undefined
      this.persistState()
      this.status = 'sent'
      this.message = 'Mensagem enviada com sucesso.'
      this.lastError = ''
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.setError(`Falha no WhatsApp: ${detail}`)
      throw error
    } finally {
      this.sendInFlight = false
      this.onChanged()
    }
  }

  private buildDailyReport(accounts: AccountSnapshot[], scheduled: boolean): string {
    const baselineAt = this.state.baselineCapturedAt || Date.now()
    const deltas = accounts.map((account) => ({ account, delta: diffAnalytics(account.panelAnalytics, this.state.baseline[account.id]) }))
    const total = deltas.reduce((out, row) => addDelta(out, row.delta), emptyDelta())
    const bestXp = [...deltas].sort((a, b) => b.delta.pokemonXp - a.delta.pokemonXp)[0]
    const bestCaptures = [...deltas].sort((a, b) => b.delta.captures - a.delta.captures)[0]
    const bestGold = [...deltas].sort((a, b) => b.delta.gold - a.delta.gold)[0]
    const rare = aggregateRare(deltas.map((row) => row.delta.rareItems)).slice(0, 4)
    const p = total.potency
    const endAt = Date.now()
    const periodHours = Math.max(0.1, (endAt - baselineAt) / 3_600_000)

    const lines = [
      '━━━━━━━━━━━━━━━━━━━━',
      '📊 *GRIDIUM — DAILY REPORT*',
      `📅 ${formatDate(endAt)} · 🇧🇷 Brasília`,
      '',
      '⚔️ *DESEMPENHO*',
      `• XP Pokémon ganho: *${compact(total.pokemonXp)}*`,
      `• Melhor XP: *Conta ${bestXp?.account.id ?? '—'} — ${compact(bestXp?.delta.pokemonXp ?? 0)}*`,
      '',
      '🎯 *CAPTURAS*',
      `• Pokémon capturados: *${integer(total.captures)}*`,
      `• P1 ${integer(p[0])} · P2 ${integer(p[1])} · P3 ${integer(p[2])} · P4 ${integer(p[3])} · P5 ${integer(p[4])}`,
      `• Nota ≥ 3,5: *${integer(total.note35Plus)}*`,
      `• Mais capturas: *Conta ${bestCaptures?.account.id ?? '—'} — ${integer(bestCaptures?.delta.captures ?? 0)}*`,
      '',
      '✨ *SHINIES*',
      `• Shinies capturados: *${integer(total.shiniesCaught)}*`,
      '',
      '💎 *DROPS RAROS*',
      `• Total confirmado: *${integer(total.rareTotal)}*`,
      ...(rare.length ? rare.map((item) => `• ${item.name}: ${integer(item.quantity)}`) : ['• Nenhum drop raro confirmado']),
      '',
      '💰 *ECONOMIA*',
      `• Gold ganho: *${compact(total.gold)}*`,
      `• Melhor Gold: *Conta ${bestGold?.account.id ?? '—'} — ${compact(bestGold?.delta.gold ?? 0)}*`,
      '',
      '🏆 *RESUMO DAS CONTAS*',
      ...deltas.map(({ account, delta }) => `• C${account.id}: ${integer(delta.captures)} capt. · ${compact(delta.pokemonXp)} XP · ${compact(delta.gold)} Gold`),
      '',
      `📌 ${scheduled ? 'Relatório automático' : 'Relatório solicitado'} · ${periodHours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h monitoradas`,
      '━━━━━━━━━━━━━━━━━━━━'
    ]
    return lines.join('\n').slice(0, MAX_REPORT_TEXT)
  }

  private captureBaseline(accounts: AccountSnapshot[], persist = true): void {
    const baseline: BaselineMap = {}
    for (const account of accounts) baseline[account.id] = baselineOf(account.panelAnalytics)
    this.state.baseline = baseline
    this.state.baselineCapturedAt = Date.now()
    if (persist) this.persistState()
  }

  private isConfigured(): boolean {
    return Boolean(this.decryptToken() && this.settings.phoneNumberId && this.settings.recipient && this.settings.templateName)
  }

  private refreshStatus(): void {
    if (!this.isConfigured()) {
      this.status = 'unconfigured'
      this.message = 'Configure a WhatsApp Cloud API para ativar o Daily Report.'
    } else if (!this.settings.enabled) {
      this.status = 'idle'
      this.message = 'WhatsApp configurado, mas o Daily Report está desligado.'
    } else {
      this.status = 'idle'
      this.message = `Daily Report ativo · envio às ${this.settings.reportTime} (Brasília).`
    }
  }

  private setError(message: string): void {
    this.status = 'error'
    this.lastError = message
    this.message = message
  }

  private decryptToken(): string {
    const encrypted = this.settings.encryptedToken
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return ''
    try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')) } catch { return '' }
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as Partial<PersistedSettings>
      this.settings = { ...DEFAULT_SETTINGS, ...parsed, version: 1 }
    } catch { this.settings = { ...DEFAULT_SETTINGS } }
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as Partial<PersistedState>
      this.state = {
        version: 1,
        baselineCapturedAt: Number(parsed.baselineCapturedAt) || Date.now(),
        baseline: parsed.baseline && typeof parsed.baseline === 'object' ? parsed.baseline : {},
        lastDailyDate: parsed.lastDailyDate,
        lastSentAt: Number(parsed.lastSentAt) || undefined,
        lastMessageId: parsed.lastMessageId
      }
    } catch {
      this.state = { version: 1, baselineCapturedAt: Date.now(), baseline: {} }
    }
  }

  private persistSettings(): void {
    writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8')
  }

  private persistState(): void {
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8')
  }
}

interface AnalyticsDelta {
  captures: number
  potency: [number, number, number, number, number]
  note35Plus: number
  shiniesCaught: number
  pokemonXp: number
  gold: number
  rareTotal: number
  rareItems: Array<{ id: string; name: string; quantity: number }>
}

function emptyDelta(): AnalyticsDelta {
  return { captures: 0, potency: [0,0,0,0,0], note35Plus: 0, shiniesCaught: 0, pokemonXp: 0, gold: 0, rareTotal: 0, rareItems: [] }
}

function baselineOf(row: PanelAnalyticsSnapshot): AccountBaseline {
  return {
    capturesTotal: row.capturesTotal,
    capturesByPotency: [...row.capturesByPotency],
    note35Plus: row.note35Plus,
    shiniesCaught: row.shiniesCaught,
    pokemonXpTotal: row.pokemonXpTotal,
    goldEarnedTotal: row.goldEarnedTotal,
    rareItems: Object.fromEntries(row.rareItems.map((item) => [item.itemId, item.quantity]))
  }
}

function diffAnalytics(row: PanelAnalyticsSnapshot, baseline?: AccountBaseline): AnalyticsDelta {
  const base = baseline ?? { capturesTotal: 0, capturesByPotency: [0,0,0,0,0] as [number,number,number,number,number], note35Plus: 0, shiniesCaught: 0, pokemonXpTotal: 0, goldEarnedTotal: 0, rareItems: {} }
  const rareItems = row.rareItems.map((item) => ({ id: item.itemId, name: item.name, quantity: positiveDelta(item.quantity, base.rareItems[item.itemId] ?? 0) })).filter((item) => item.quantity > 0)
  return {
    captures: positiveDelta(row.capturesTotal, base.capturesTotal),
    potency: row.capturesByPotency.map((value, index) => positiveDelta(value, base.capturesByPotency[index] ?? 0)) as [number,number,number,number,number],
    note35Plus: positiveDelta(row.note35Plus, base.note35Plus),
    shiniesCaught: positiveDelta(row.shiniesCaught, base.shiniesCaught),
    pokemonXp: positiveDelta(row.pokemonXpTotal, base.pokemonXpTotal),
    gold: positiveDelta(row.goldEarnedTotal, base.goldEarnedTotal),
    rareTotal: rareItems.reduce((sum, item) => sum + item.quantity, 0),
    rareItems
  }
}

function positiveDelta(current: number, previous: number): number {
  if (!Number.isFinite(current)) return 0
  if (!Number.isFinite(previous) || current < previous) return Math.max(0, current)
  return Math.max(0, current - previous)
}

function addDelta(a: AnalyticsDelta, b: AnalyticsDelta): AnalyticsDelta {
  const rare = aggregateRare([a.rareItems, b.rareItems])
  return {
    captures: a.captures + b.captures,
    potency: a.potency.map((value, index) => value + b.potency[index]) as [number,number,number,number,number],
    note35Plus: a.note35Plus + b.note35Plus,
    shiniesCaught: a.shiniesCaught + b.shiniesCaught,
    pokemonXp: a.pokemonXp + b.pokemonXp,
    gold: a.gold + b.gold,
    rareTotal: rare.reduce((sum, item) => sum + item.quantity, 0),
    rareItems: rare
  }
}

function aggregateRare(groups: AnalyticsDelta['rareItems'][]): AnalyticsDelta['rareItems'] {
  const map = new Map<string, { id: string; name: string; quantity: number }>()
  for (const group of groups) for (const item of group) {
    const current = map.get(item.id)
    map.set(item.id, { ...item, quantity: item.quantity + (current?.quantity ?? 0) })
  }
  return [...map.values()].sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
}

function digits(value: string): string { return String(value || '').replace(/\D/g, '').slice(0, 24) }
function normalizeTemplate(value: string, fallback: string): string {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 120)
  return normalized || fallback
}
function normalizeLanguage(value: string): string {
  const normalized = String(value || '').trim().replace(/[^A-Za-z_]/g, '').slice(0, 12)
  return normalized || 'pt_BR'
}
function normalizeTime(value: string): string {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/)
  if (!match) return '00:05'
  const hour = Math.min(23, Math.max(0, Number(match[1])))
  const minute = Math.min(59, Math.max(0, Number(match[2])))
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
}
function brasiliaParts(at: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(at))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}
function formatDate(at: number): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(at))
}
function integer(value: number): string { return Math.round(value).toLocaleString('pt-BR') }
function compact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return integer(value)
}
