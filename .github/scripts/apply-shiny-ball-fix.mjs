import { readFileSync, writeFileSync } from 'node:fs'

function read(path) { return readFileSync(path, 'utf8') }
function write(path, content) { writeFileSync(path, content, 'utf8') }
function replaceOnce(content, from, to, label) {
  const first = content.indexOf(from)
  if (first < 0) throw new Error(`Patch target not found: ${label}`)
  if (content.indexOf(from, first + from.length) >= 0) throw new Error(`Patch target is ambiguous: ${label}`)
  return content.slice(0, first) + to + content.slice(first + from.length)
}
function insertBeforeLast(content, marker, addition, label) {
  const index = content.lastIndexOf(marker)
  if (index < 0) throw new Error(`Insert target not found: ${label}`)
  return content.slice(0, index) + addition + content.slice(index)
}

const huntPath = 'gridium2/src/main/hunt-session-runtime.ts'
let hunt = read(huntPath)

hunt = replaceOnce(hunt,
`function shinySeenBattleEvent(event: JsonRecord): boolean {
  const kind = normalizeKey(text(first(event.k, event.kind, event.type, event.event, event.evento)))
  if (!kind) return false
  const shinyNamed = isShinyKey(kind)
  const encounterKind = /(vist|seen|encontr|spawn|aparec|wild)/.test(kind)
  return (shinyNamed && encounterKind) || (shinyFlag(event) && encounterKind)
}`,
`function shinySeenBattleEvent(event: JsonRecord): boolean {
  const kind = normalizeKey(text(first(event.k, event.kind, event.type, event.event, event.evento)))
  if (!kind) return false
  // Authoritative PokeIdle roll: batalha.ev -> { k: 'bola', shiny: true, sucesso: boolean }.
  if (kind === 'bola' && shinyFlag(event)) return true
  const shinyNamed = isShinyKey(kind)
  const encounterKind = /(vist|seen|encontr|spawn|aparec|wild)/.test(kind)
  return (shinyNamed && encounterKind) || (shinyFlag(event) && encounterKind)
}`,
'hunt shinySeenBattleEvent')

hunt = replaceOnce(hunt,
`  private readonly shinySeenEvents = new Set<string>()
  private captureTimes: number[] = []`,
`  private readonly shinySeenEvents = new Set<string>()
  private recentBattleShinyCaughtAt: number[] = []
  private captureTimes: number[] = []`,
'hunt recent caught queue field')

hunt = replaceOnce(hunt,
`    this.shinySeenEvents.clear()
    this.captureTimes = []`,
`    this.shinySeenEvents.clear()
    this.recentBattleShinyCaughtAt = []
    this.captureTimes = []`,
'hunt clear recent caught queue')

hunt = replaceOnce(hunt,
`  private ingestBattleEvents(packet: JsonRecord, at: number): boolean {
    if (!this.huntSlug || !Array.isArray(packet.ev)) return false
    let added = 0
    for (const raw of packet.ev) {
      if (!isRecord(raw) || !shinySeenBattleEvent(raw)) continue
      const key = battleEventKey(raw)
      if (this.shinySeenEvents.has(key)) continue
      this.shinySeenEvents.add(key)
      while (this.shinySeenEvents.size > 128) {
        const oldest = this.shinySeenEvents.values().next().value as string | undefined
        if (!oldest) break
        this.shinySeenEvents.delete(oldest)
      }
      added++
    }
    if (added <= 0) return false
    this.shiniesSeen += added
    this.updatedAt = at
    return true
  }`,
`  private ingestBattleEvents(packet: JsonRecord, at: number): boolean {
    if (!this.huntSlug || !Array.isArray(packet.ev)) return false
    let seenAdded = 0
    let caughtAdded = 0
    for (const raw of packet.ev) {
      if (!isRecord(raw)) continue
      const kind = normalizeKey(text(first(raw.k, raw.kind, raw.type, raw.event, raw.evento)))
      const shinyBall = kind === 'bola' && shinyFlag(raw)

      if (shinyBall) {
        // Each bola event is one server roll. Do not fingerprint it: two distinct shiny
        // rolls can have byte-identical payloads and both must count.
        seenAdded++
        if (raw.sucesso === true || truthy(raw.sucesso)) {
          caughtAdded++
          this.recentBattleShinyCaughtAt.push(at)
        }
        continue
      }

      if (!shinySeenBattleEvent(raw)) continue
      const key = battleEventKey(raw)
      if (this.shinySeenEvents.has(key)) continue
      this.shinySeenEvents.add(key)
      while (this.shinySeenEvents.size > 128) {
        const oldest = this.shinySeenEvents.values().next().value as string | undefined
        if (!oldest) break
        this.shinySeenEvents.delete(oldest)
      }
      seenAdded++
    }

    if (seenAdded <= 0 && caughtAdded <= 0) return false
    this.shiniesSeen += seenAdded
    this.shiniesCaught += caughtAdded
    if (this.recentBattleShinyCaughtAt.length > 32) this.recentBattleShinyCaughtAt.splice(0, this.recentBattleShinyCaughtAt.length - 32)
    this.updatedAt = at
    return true
  }`,
'hunt battle shiny ingestion')

hunt = replaceOnce(hunt,
`  private registerCapture(row: JsonRecord, at: number): void {
    this.capturesTotal++
    this.captureTimes.push(at)
    this.lastCaptureAt = at
    const p = potency(first(row.potencia, row.potency))
    if (p) this.capturesByPotency[p - 1]++
    if (shinyFlag(row)) this.shiniesCaught++
  }`,
`  private registerCapture(row: JsonRecord, at: number): void {
    this.capturesTotal++
    this.captureTimes.push(at)
    this.lastCaptureAt = at
    const p = potency(first(row.potencia, row.potency))
    if (p) this.capturesByPotency[p - 1]++
    if (shinyFlag(row)) {
      const cutoff = at - 30_000
      while (this.recentBattleShinyCaughtAt.length && this.recentBattleShinyCaughtAt[0] < cutoff) this.recentBattleShinyCaughtAt.shift()
      // The authoritative bola event already counted the capture. Consume its marker
      // when the same Pokemon later appears in pkMud instead of counting twice.
      if (this.recentBattleShinyCaughtAt.length) this.recentBattleShinyCaughtAt.shift()
      else this.shiniesCaught++
    }
  }`,
'hunt register shiny capture')

hunt = replaceOnce(hunt,
`  private prune(at: number): void {
    const cutoff = at - HOUR`,
`  private prune(at: number): void {
    const cutoff = at - HOUR
    const shinyCaptureCutoff = at - 30_000
    while (this.recentBattleShinyCaughtAt.length && this.recentBattleShinyCaughtAt[0] < shinyCaptureCutoff) this.recentBattleShinyCaughtAt.shift()`,
'hunt prune shiny capture markers')

write(huntPath, hunt)

const farmPath = 'gridium2/src/main/farm-gold-analytics-runtime.ts'
let farm = read(farmPath)

farm = replaceOnce(farm,
`type PersistedWithFarmGold = PanelAnalyticsPersistedState & {
  farmGoldVersion?: 1
  farmGoldTotal?: number
  farmGoldMinute?: GoldHistory[]`,
`type PersistedWithFarmGold = PanelAnalyticsPersistedState & {
  farmGoldVersion?: 1
  farmGoldTotal?: number
  battleShiniesSeen?: number
  battleShiniesCaught?: number
  farmGoldMinute?: GoldHistory[]`,
'farm persisted shiny fields')

farm = replaceOnce(farm,
`const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : ''
const isGoldCurrency`,
`const text = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : ''
const truthy = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true' || value === 'sim' || value === 'yes' || value === 'shiny'
const isGoldCurrency`,
'farm truthy helper')

farm = replaceOnce(farm,
`  private farmGoldTotal = 0
  private readonly farmMinute`,
`  private farmGoldTotal = 0
  private battleShiniesSeen = 0
  private battleShiniesCaught = 0
  private readonly farmMinute`,
'farm shiny counters')

farm = replaceOnce(farm,
`    this.restoreFarmGold(options.initial)
  }`,
`    this.restoreFarmGold(options.initial)
    this.restoreShinyCounters(options.initial)
  }`,
'farm constructor restore shiny')

farm = replaceOnce(farm,
`    this.farmGoldTotal = 0
    this.farmMinute.clear()`,
`    this.farmGoldTotal = 0
    this.battleShiniesSeen = 0
    this.battleShiniesCaught = 0
    this.farmMinute.clear()`,
'farm reset shiny')

farm = replaceOnce(farm,
`  ingestPacket(packet: unknown, at = Date.now()): boolean {
    this.observeMarketPacket(packet, at)
    return this.inner.ingestPacket(packet, at)
  }`,
`  ingestPacket(packet: unknown, at = Date.now()): boolean {
    const shinyChanged = this.observeShinyPacket(packet)
    this.observeMarketPacket(packet, at)
    const innerChanged = this.inner.ingestPacket(packet, at)
    if (shinyChanged && !innerChanged) this.onPersist?.()
    return innerChanged || shinyChanged
  }`,
'farm ingest shiny packet')

farm = replaceOnce(farm,
`    return {
      ...snapshot,
      goldEarnedTotal: this.farmGoldTotal,`,
`    return {
      ...snapshot,
      shiniesSeen: Math.max(snapshot.shiniesSeen ?? 0, this.battleShiniesSeen),
      shiniesCaught: Math.max(snapshot.shiniesCaught, this.battleShiniesCaught),
      goldEarnedTotal: this.farmGoldTotal,`,
'farm snapshot shiny override')

farm = replaceOnce(farm,
`    persisted.farmGoldVersion = 1
    persisted.farmGoldTotal = this.farmGoldTotal
    persisted.farmGoldMinute`,
`    persisted.farmGoldVersion = 1
    persisted.farmGoldTotal = this.farmGoldTotal
    persisted.battleShiniesSeen = this.battleShiniesSeen
    persisted.battleShiniesCaught = this.battleShiniesCaught
    persisted.farmGoldMinute`,
'farm persist shiny counters')

farm = replaceOnce(farm,
`  private observeMarketPacket(packet: unknown, at: number): void {`,
`  private observeShinyPacket(packet: unknown): boolean {
    if (!isRecord(packet) || String(packet.t || '') !== 'batalha' || !Array.isArray(packet.ev)) return false
    let seen = 0
    let caught = 0
    for (const rawEvent of packet.ev) {
      if (!isRecord(rawEvent) || String(rawEvent.k || '') !== 'bola' || !truthy(rawEvent.shiny)) continue
      seen++
      if (rawEvent.sucesso === true || truthy(rawEvent.sucesso)) caught++
    }
    if (seen <= 0) return false
    this.battleShiniesSeen += seen
    this.battleShiniesCaught += caught
    return true
  }

  private observeMarketPacket(packet: unknown, at: number): void {`,
'farm authoritative shiny observer')

farm = replaceOnce(farm,
`  private restoreFarmGold(initial?: Partial<PanelAnalyticsPersistedState> | null): void {`,
`  private restoreShinyCounters(initial?: Partial<PanelAnalyticsPersistedState> | null): void {
    if (!initial || typeof initial !== 'object') return
    const stored = initial as Partial<PersistedWithFarmGold>
    this.battleShiniesSeen = Math.max(0, Math.floor(finite(stored.battleShiniesSeen) ?? 0))
    this.battleShiniesCaught = Math.max(0, Math.floor(finite(stored.battleShiniesCaught) ?? 0))
  }

  private restoreFarmGold(initial?: Partial<PanelAnalyticsPersistedState> | null): void {`,
'farm restore shiny counters')

write(farmPath, farm)

const huntTestPath = 'gridium2/tests/hunt-session-runtime.test.ts'
let huntTest = read(huntTestPath)
huntTest = insertBeforeLast(huntTest, '\n})', `

  it('counts the real PokeIdle bola shiny roll and does not double-count pkMud', () => {
    const runtime = new HuntSessionRuntime()
    const now = Date.now()

    runtime.ingest({ t:'welcome', estado:{ id:5, huntSlug:'forest', pokemons:[{ id:1, xp:0 }] } }, now)
    runtime.ingest({ t:'batalha', ev:[
      { k:'bola', slot:0, ballId:3, shiny:true, sucesso:false },
      { k:'fugiu', nome:'Charmander' }
    ] }, now + 1_000)

    let snapshot = runtime.snapshot(now + 1_000)
    expect(snapshot.shiniesSeen).toBe(1)
    expect(snapshot.shiniesCaught).toBe(0)

    runtime.ingest({ t:'batalha', ev:[
      { k:'bola', slot:0, ballId:3, shiny:true, sucesso:true },
      { k:'capturado', pokemon:{ id:2, speciesId:4, nome:'Charmander', shiny:true } }
    ] }, now + 2_000)

    snapshot = runtime.snapshot(now + 2_000)
    expect(snapshot.shiniesSeen).toBe(2)
    expect(snapshot.shiniesCaught).toBe(1)

    runtime.ingest({ t:'estado', estado:{ huntSlug:'forest', pkMud:[{ id:2, xp:0, potencia:3, shiny:true }] } }, now + 2_100)
    snapshot = runtime.snapshot(now + 2_100)
    expect(snapshot.capturesTotal).toBe(1)
    expect(snapshot.shiniesSeen).toBe(2)
    expect(snapshot.shiniesCaught).toBe(1)
  })`, 'hunt real bola regression')
write(huntTestPath, huntTest)

const farmTestPath = 'gridium2/tests/farm-gold-analytics.test.ts'
let farmTest = read(farmTestPath)
farmTest = insertBeforeLast(farmTest, '\n})', `

  it('counts shiny seen/caught from the real PokeIdle bola event and persists it', () => {
    const tracker = new FarmGoldAnalyticsTracker()
    const now = Date.now()

    tracker.ingestPacket({ t:'batalha', ev:[
      { k:'bola', slot:0, ballId:3, shiny:true, sucesso:false },
      { k:'fugiu', nome:'Charmander' }
    ] }, now)
    tracker.ingestPacket({ t:'batalha', ev:[
      { k:'bola', slot:0, ballId:3, shiny:true, sucesso:true },
      { k:'capturado', pokemon:{ speciesId:4, nome:'Charmander', shiny:true } }
    ] }, now + 1_000)

    let snapshot = tracker.snapshot(now + 1_000)
    expect(snapshot.shiniesSeen).toBe(2)
    expect(snapshot.shiniesCaught).toBe(1)

    const persisted = tracker.persisted(now + 1_000) as unknown as Record<string, unknown>
    expect(persisted.battleShiniesSeen).toBe(2)
    expect(persisted.battleShiniesCaught).toBe(1)

    const restored = new FarmGoldAnalyticsTracker({ initial: persisted as never })
    snapshot = restored.snapshot(now + 2_000)
    expect(snapshot.shiniesSeen).toBe(2)
    expect(snapshot.shiniesCaught).toBe(1)
  })`, 'farm real bola regression')
write(farmTestPath, farmTest)

console.log('Applied authoritative PokeIdle shiny bola-event fix.')
