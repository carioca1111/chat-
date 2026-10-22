import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AccountId,
  AccountSnapshot,
  HuntLearningSnapshot,
  PanelHistoryBucket,
  SentinelAccountSnapshot,
  SentinelMetricSnapshot,
  SentinelSettingsInput,
  SentinelSnapshot
} from '../shared/contracts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const CHECK_INTERVAL_MS = 30_000
const STALE_SERVER_MS = 4 * MINUTE
const READY_GRACE_MS = 5 * MINUTE
const LOADING_STUCK_MS = 3 * MINUTE
const RECOVERY_COOLDOWN_MS = 5 * MINUTE
const RECOVERY_GRACE_MS = 90_000
const RECOVERY_WINDOW_MS = 30 * MINUTE
const MAX_RECOVERIES_PER_WINDOW = 3
const LEARNING_PERSIST_MS = 5 * MINUTE
const CURRENT_WINDOW_MS = 15 * MINUTE
const BASELINE_WINDOW_MS = 6 * HOUR

interface PersistedSettings {
  version: 1
  enabled: boolean
  autoRecover: boolean
  anomalyDetection: boolean
  whatsappAlerts: boolean
}

interface HuntLearningRecord {
  accountId: AccountId
  key: string
  huntSlug: string
  speciesId?: number
  speciesName?: string
  xp: number
  observedMs: number
  samples: number
  lastSeenAt: number
}

interface PersistedLearning {
  version: 1
  records: HuntLearningRecord[]
}

interface RuntimeAccountState {
  snapshot: SentinelAccountSnapshot
  recoveryTimes: number[]
  recoveringUntil: number
  failureAlerted: boolean
}

interface LastLearningSample {
  at: number
  xpTotal: number
  key: string
}

interface PerformanceRates {
  xp: number
  captures: number
  gold: number
}

const DEFAULT_SETTINGS: PersistedSettings = {
  version: 1,
  enabled: true,
  autoRecover: true,
  anomalyDetection: true,
  whatsappAlerts: true
}

export interface SentinelRuntimeOptions {
  accountsProvider: () => AccountSnapshot[]
  recoverAccount: (accountId: AccountId) => Promise<boolean>
  onChanged: () => void
  sendAlert?: (text: string) => Promise<void>
}

export class SentinelRuntime {
  private readonly settingsPath = join(app.getPath('userData'), 'gridium2-sentinel.json')
  private readonly learningPath = join(app.getPath('userData'), 'gridium2-hunt-learning.json')
  private settings: PersistedSettings = { ...DEFAULT_SETTINGS }
  private readonly states = new Map<AccountId, RuntimeAccountState>()
  private readonly learning = new Map<string, HuntLearningRecord>()
  private readonly lastLearning = new Map<AccountId, LastLearningSample>()
  private readonly recoverInFlight = new Set<AccountId>()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastLearningPersistAt = 0
  private learningDirty = false

  constructor(private readonly options: SentinelRuntimeOptions) {
    this.load()
    for (const id of [1, 2, 3, 4] as AccountId[]) {
      this.states.set(id, {
        snapshot: emptyAccountSnapshot(id),
        recoveryTimes: [],
        recoveringUntil: 0,
        failureAlerted: false
      })
    }
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.persistLearning(true)
  }

  snapshot(): SentinelSnapshot {
    const accounts = ([1, 2, 3, 4] as AccountId[]).map((id) => ({ ...(this.states.get(id)?.snapshot ?? emptyAccountSnapshot(id)) }))
    return {
      enabled: this.settings.enabled,
      autoRecover: this.settings.autoRecover,
      anomalyDetection: this.settings.anomalyDetection,
      whatsappAlerts: this.settings.whatsappAlerts,
      accounts,
      learning: accounts.map((account) => account.huntLearning).filter((row): row is HuntLearningSnapshot => Boolean(row)),
      updatedAt: Date.now()
    }
  }

  updateSettings(input: SentinelSettingsInput): SentinelSnapshot {
    this.settings = {
      version: 1,
      enabled: Boolean(input.enabled),
      autoRecover: Boolean(input.autoRecover),
      anomalyDetection: Boolean(input.anomalyDetection),
      whatsappAlerts: Boolean(input.whatsappAlerts)
    }
    writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8')
    this.options.onChanged()
    void this.tick()
    return this.snapshot()
  }

  async recoverNow(accountId: AccountId): Promise<boolean> {
    if (this.recoverInFlight.has(accountId)) return false
    const state = this.states.get(accountId)
    if (!state) return false
    return await this.beginRecovery(accountId, state, Date.now(), true)
  }

  private async tick(): Promise<void> {
    const now = Date.now()
    const accounts = this.options.accountsProvider()
    let changed = false

    for (const account of accounts) {
      this.collectHuntLearning(account, now)
      const state = this.states.get(account.id) ?? {
        snapshot: emptyAccountSnapshot(account.id),
        recoveryTimes: [],
        recoveringUntil: 0,
        failureAlerted: false
      }
      this.states.set(account.id, state)
      state.recoveryTimes = state.recoveryTimes.filter((at) => at >= now - RECOVERY_WINDOW_MS)

      const previous = state.snapshot
      let next = this.evaluateAccount(account, state, now)

      if (this.settings.enabled && next.recoveryNeeded && this.settings.autoRecover && !this.recoverInFlight.has(account.id)) {
        const lastRecovery = state.recoveryTimes.at(-1) ?? 0
        const canRecover = state.recoveryTimes.length < MAX_RECOVERIES_PER_WINDOW && now - lastRecovery >= RECOVERY_COOLDOWN_MS
        if (canRecover) {
          void this.beginRecovery(account.id, state, now, false)
          next = { ...next, state: 'recovering', healthScore: Math.max(45, next.healthScore), issue: 'Recuperação automática em andamento…' }
        } else if (state.recoveryTimes.length >= MAX_RECOVERIES_PER_WINDOW) {
          next = { ...next, state: 'offline', healthScore: Math.min(20, next.healthScore), issue: 'Falha persistente · limite de recuperação atingido' }
          if (!state.failureAlerted) {
            state.failureAlerted = true
            void this.alert(`🚨 GRIDIIUM SENTINEL\nConta ${account.id} continua com falha após ${MAX_RECOVERIES_PER_WINDOW} tentativas automáticas.\nIntervenção manual recomendada.`)
          }
        }
      }

      if (state.recoveringUntil > now && next.state !== 'healthy') {
        next = { ...next, state: 'recovering', issue: 'Aguardando a conta estabilizar após recuperação…' }
      }

      if (previous.state === 'recovering' && next.state === 'healthy') {
        state.failureAlerted = false
        void this.alert(`✅ GRIDIIUM SENTINEL\nConta ${account.id} recuperada automaticamente e recebendo dados do servidor novamente.`)
      }

      if (!sameSentinelAccount(previous, next)) changed = true
      state.snapshot = next
    }

    this.persistLearning(false, now)
    if (changed) this.options.onChanged()
  }

  private evaluateAccount(account: AccountSnapshot, runtime: RuntimeAccountState, now: number): SentinelAccountSnapshot {
    const huntLearning = this.learningSnapshotFor(account)
    if (!this.settings.enabled) {
      return {
        accountId: account.id,
        state: 'paused',
        healthScore: 100,
        issue: 'Sentinel desligado',
        lastServerAt: account.lastServerAt,
        lastRecoveryAt: runtime.recoveryTimes.at(-1),
        recoveryAttempts: runtime.recoveryTimes.length,
        anomaly: null,
        huntLearning,
        recoveryNeeded: false
      }
    }

    if (account.effectivePowerState === 'suspended') {
      return {
        accountId: account.id,
        state: 'paused',
        healthScore: 100,
        issue: 'Conta suspensa manualmente',
        lastServerAt: account.lastServerAt,
        lastRecoveryAt: runtime.recoveryTimes.at(-1),
        recoveryAttempts: runtime.recoveryTimes.length,
        anomaly: null,
        huntLearning,
        recoveryNeeded: false
      }
    }

    const technical = technicalFault(account, now)
    if (technical) {
      return {
        accountId: account.id,
        state: technical.state,
        healthScore: technical.score,
        issue: technical.issue,
        lastServerAt: account.lastServerAt,
        lastRecoveryAt: runtime.recoveryTimes.at(-1),
        recoveryAttempts: runtime.recoveryTimes.length,
        anomaly: null,
        huntLearning,
        recoveryNeeded: technical.recoveryNeeded
      }
    }

    const anomaly = this.settings.anomalyDetection ? analyzePerformance(account, now, huntLearning) : null
    const enoughHistory = hasEnoughBaseline(account.panelAnalytics.historyMinute, now) || Boolean(huntLearning && huntLearning.confidence >= 40)
    if (anomaly) {
      return {
        accountId: account.id,
        state: 'anomaly',
        healthScore: anomaly.severity === 'critical' ? 45 : 70,
        issue: `${metricLabel(anomaly.metric)} ${Math.abs(anomaly.deltaPercent).toFixed(0)}% abaixo do padrão`,
        lastServerAt: account.lastServerAt,
        lastRecoveryAt: runtime.recoveryTimes.at(-1),
        recoveryAttempts: runtime.recoveryTimes.length,
        anomaly,
        huntLearning,
        recoveryNeeded: false
      }
    }

    return {
      accountId: account.id,
      state: enoughHistory ? 'healthy' : 'learning',
      healthScore: 100,
      issue: enoughHistory ? 'Operação normal' : 'Aprendendo o padrão da conta…',
      lastServerAt: account.lastServerAt,
      lastRecoveryAt: runtime.recoveryTimes.at(-1),
      recoveryAttempts: runtime.recoveryTimes.length,
      anomaly: null,
      huntLearning,
      recoveryNeeded: false
    }
  }

  private async beginRecovery(accountId: AccountId, state: RuntimeAccountState, now: number, manual: boolean): Promise<boolean> {
    if (this.recoverInFlight.has(accountId)) return false
    this.recoverInFlight.add(accountId)
    state.recoveryTimes.push(now)
    state.recoveringUntil = now + RECOVERY_GRACE_MS
    state.snapshot = {
      ...state.snapshot,
      state: 'recovering',
      issue: manual ? 'Recuperação manual em andamento…' : 'Recuperação automática em andamento…',
      recoveryAttempts: state.recoveryTimes.length,
      lastRecoveryAt: now
    }
    this.options.onChanged()
    try {
      const ok = await this.options.recoverAccount(accountId)
      if (!ok && manual) void this.alert(`🚨 GRIDIIUM SENTINEL\nNão foi possível iniciar a recuperação manual da Conta ${accountId}.`)
      return ok
    } finally {
      this.recoverInFlight.delete(accountId)
    }
  }

  private collectHuntLearning(account: AccountSnapshot, now: number): void {
    const profile = account.huntProfile
    if (!profile?.huntSlug || (!profile.speciesId && !profile.speciesName) || account.status !== 'ready') {
      this.lastLearning.delete(account.id)
      return
    }
    const key = huntKey(account)
    if (!key) return
    const xpTotal = account.panelAnalytics.pokemonXpTotal
    const previous = this.lastLearning.get(account.id)
    this.lastLearning.set(account.id, { at: now, xpTotal, key })
    if (!previous || previous.key !== key) return
    const elapsed = now - previous.at
    const gained = xpTotal - previous.xpTotal
    if (elapsed < 10_000 || elapsed > 120_000 || gained < 0 || gained > 1e12) return

    const existing = this.learning.get(key) ?? {
      accountId: account.id,
      key,
      huntSlug: profile.huntSlug,
      speciesId: profile.speciesId,
      speciesName: profile.speciesName,
      xp: 0,
      observedMs: 0,
      samples: 0,
      lastSeenAt: now
    }
    existing.xp += gained
    existing.observedMs += elapsed
    existing.samples++
    existing.lastSeenAt = now
    this.learning.set(key, existing)
    this.learningDirty = true
  }

  private learningSnapshotFor(account: AccountSnapshot): HuntLearningSnapshot | undefined {
    const key = huntKey(account)
    if (!key) return undefined
    const record = this.learning.get(key)
    if (!record || record.observedMs <= 0) return {
      accountId: account.id,
      huntSlug: account.huntProfile?.huntSlug ?? '',
      speciesId: account.huntProfile?.speciesId,
      speciesName: account.huntProfile?.speciesName,
      observedXpPerHour: 0,
      minutesObserved: 0,
      samples: 0,
      confidence: 0
    }
    const minutes = record.observedMs / MINUTE
    return {
      accountId: account.id,
      huntSlug: record.huntSlug,
      speciesId: record.speciesId,
      speciesName: record.speciesName,
      observedXpPerHour: record.xp / (record.observedMs / HOUR),
      minutesObserved: minutes,
      samples: record.samples,
      confidence: Math.min(100, Math.round((minutes / 120) * 100))
    }
  }

  private async alert(text: string): Promise<void> {
    if (!this.settings.whatsappAlerts || !this.options.sendAlert) return
    try { await this.options.sendAlert(text) } catch { /* reporter exposes its own error */ }
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as Partial<PersistedSettings>
      this.settings = {
        version: 1,
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
        autoRecover: typeof parsed.autoRecover === 'boolean' ? parsed.autoRecover : DEFAULT_SETTINGS.autoRecover,
        anomalyDetection: typeof parsed.anomalyDetection === 'boolean' ? parsed.anomalyDetection : DEFAULT_SETTINGS.anomalyDetection,
        whatsappAlerts: typeof parsed.whatsappAlerts === 'boolean' ? parsed.whatsappAlerts : DEFAULT_SETTINGS.whatsappAlerts
      }
    } catch { this.settings = { ...DEFAULT_SETTINGS } }
    try {
      const parsed = JSON.parse(readFileSync(this.learningPath, 'utf8')) as Partial<PersistedLearning>
      if (Array.isArray(parsed.records)) {
        for (const row of parsed.records) {
          if (!row || typeof row !== 'object' || !row.key || !Number.isFinite(row.observedMs) || row.observedMs <= 0) continue
          this.learning.set(row.key, { ...row })
        }
      }
    } catch { /* first run */ }
  }

  private persistLearning(force: boolean, now = Date.now()): void {
    if (!this.learningDirty || (!force && now - this.lastLearningPersistAt < LEARNING_PERSIST_MS)) return
    const records = [...this.learning.values()]
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, 200)
    try {
      writeFileSync(this.learningPath, JSON.stringify({ version: 1, records }, null, 2), 'utf8')
      this.learningDirty = false
      this.lastLearningPersistAt = now
    } catch { /* best effort persistence */ }
  }
}

function technicalFault(account: AccountSnapshot, now: number): { state: SentinelAccountSnapshot['state']; score: number; issue: string; recoveryNeeded: boolean } | null {
  if (account.status === 'crashed') return { state: 'offline', score: 5, issue: 'Renderer da conta caiu', recoveryNeeded: true }
  if (account.status === 'offline') return { state: 'offline', score: 10, issue: 'Conta offline', recoveryNeeded: now - account.statusSince > 10_000 }
  if (account.status === 'loading' && now - account.statusSince > LOADING_STUCK_MS) return { state: 'offline', score: 20, issue: 'Carregamento travado há mais de 3 min', recoveryNeeded: true }
  if (account.status !== 'ready') return { state: 'learning', score: 85, issue: 'Aguardando a conta ficar pronta', recoveryNeeded: false }
  if (!account.lastServerAt && now - account.statusSince > READY_GRACE_MS) return { state: 'offline', score: 25, issue: 'Sem dados do servidor após 5 min', recoveryNeeded: true }
  if (account.lastServerAt && now - account.lastServerAt > STALE_SERVER_MS) return { state: 'offline', score: 20, issue: 'Servidor sem enviar pacotes há mais de 4 min', recoveryNeeded: true }
  return null
}

export function analyzePerformance(account: AccountSnapshot, now: number, huntLearning?: HuntLearningSnapshot): SentinelMetricSnapshot | null {
  const current = rateForRange(account.panelAnalytics.historyMinute, now - CURRENT_WINDOW_MS, now, CURRENT_WINDOW_MS)
  const baseline = baselineRates(account.panelAnalytics.historyMinute, now)

  if (huntLearning && huntLearning.confidence >= 40 && huntLearning.observedXpPerHour > 0) baseline.xp = huntLearning.observedXpPerHour

  const candidates: SentinelMetricSnapshot[] = []
  addAnomaly(candidates, 'xp', current.xp, baseline.xp, 1_000)
  addAnomaly(candidates, 'captures', current.captures, baseline.captures, 4)
  addAnomaly(candidates, 'gold', current.gold, baseline.gold, 100)
  if (!candidates.length) return null
  return candidates.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.deltaPercent - b.deltaPercent)[0]
}

function addAnomaly(out: SentinelMetricSnapshot[], metric: SentinelMetricSnapshot['metric'], current: number, baseline: number, minimumBaseline: number): void {
  if (!Number.isFinite(baseline) || baseline < minimumBaseline) return
  const ratio = baseline > 0 ? current / baseline : 1
  if (ratio >= 0.55) return
  const deltaPercent = (ratio - 1) * 100
  out.push({ metric, currentPerHour: current, baselinePerHour: baseline, deltaPercent, severity: ratio < 0.2 ? 'critical' : 'warning' })
}

function baselineRates(history: PanelHistoryBucket[], now: number): PerformanceRates {
  const end = now - CURRENT_WINDOW_MS
  const start = now - BASELINE_WINDOW_MS
  const windows = new Map<number, { xp: number; captures: number; gold: number }>()
  for (const bucket of history) {
    if (bucket.at < start || bucket.at >= end) continue
    const key = Math.floor((bucket.at - start) / CURRENT_WINDOW_MS)
    const row = windows.get(key) ?? { xp: 0, captures: 0, gold: 0 }
    row.xp += Math.max(0, bucket.pokemonXp)
    row.captures += Math.max(0, bucket.captures)
    row.gold += Math.max(0, bucket.goldEarned)
    windows.set(key, row)
  }
  const rows = [...windows.values()]
  if (rows.length < 6) return { xp: 0, captures: 0, gold: 0 }
  return {
    xp: median(rows.map((row) => row.xp * 4)),
    captures: median(rows.map((row) => row.captures * 4)),
    gold: median(rows.map((row) => row.gold * 4))
  }
}

function rateForRange(history: PanelHistoryBucket[], start: number, end: number, durationMs: number): PerformanceRates {
  const total = history.reduce((out, bucket) => {
    if (bucket.at < start || bucket.at > end) return out
    out.xp += Math.max(0, bucket.pokemonXp)
    out.captures += Math.max(0, bucket.captures)
    out.gold += Math.max(0, bucket.goldEarned)
    return out
  }, { xp: 0, captures: 0, gold: 0 })
  const multiplier = HOUR / durationMs
  return { xp: total.xp * multiplier, captures: total.captures * multiplier, gold: total.gold * multiplier }
}

function hasEnoughBaseline(history: PanelHistoryBucket[], now: number): boolean {
  return history.some((bucket) => bucket.at >= now - BASELINE_WINDOW_MS && bucket.at < now - 2 * HOUR)
}

function huntKey(account: AccountSnapshot): string {
  const profile = account.huntProfile
  if (!profile?.huntSlug) return ''
  const species = profile.speciesId ? `id:${profile.speciesId}` : profile.speciesName ? `name:${profile.speciesName.toLowerCase()}` : ''
  if (!species) return ''
  return `${account.id}|${species}|${profile.huntSlug}`
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function severityRank(value: SentinelMetricSnapshot['severity']): number {
  return value === 'critical' ? 2 : 1
}

function metricLabel(metric: SentinelMetricSnapshot['metric']): string {
  if (metric === 'xp') return 'XP/h'
  if (metric === 'captures') return 'Capturas/h'
  return 'Gold/h'
}

function emptyAccountSnapshot(accountId: AccountId): SentinelAccountSnapshot {
  return {
    accountId,
    state: 'learning',
    healthScore: 100,
    issue: 'Aguardando dados…',
    lastServerAt: null,
    recoveryAttempts: 0,
    anomaly: null,
    recoveryNeeded: false
  }
}

function sameSentinelAccount(a: SentinelAccountSnapshot, b: SentinelAccountSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
