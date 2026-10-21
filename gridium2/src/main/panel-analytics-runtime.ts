import type { PanelAnalyticsSnapshot, PanelEventSnapshot, PanelRareItemSnapshot } from '../shared/contracts'

type JsonRecord = Record<string, unknown>

const INVENTORY_KEYS = ['items', 'itens', 'inventory', 'inventario', 'mochila', 'bag', 'consumables', 'consumiveis']
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const MAX_EVENTS = 24

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const first = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null)
const finite = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}
const text = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 80) : ''
const truthy = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true'
const potency = (value: unknown): 1|2|3|4|5|undefined => {
  const parsed = finite(typeof value === 'string' ? value.replace(/^P/i, '') : value)
  return parsed && [1,2,3,4,5].includes(parsed) ? parsed as 1|2|3|4|5 : undefined
}

interface InventoryRow { id: string; name: string; quantity: number }

function pokemonId(row: JsonRecord): string {
  const id = first(row.id, row.pokemonInstanceId, row.uid)
  return id === undefined || id === null ? '' : String(id)
}

function pokemonName(row: JsonRecord): string {
  const species = isRecord(row.species) ? row.species : isRecord(row.especie) ? row.especie : undefined
  return text(first(row.speciesName, row.nomeEspecie, row.especieNome, species?.name, species?.nome)) || `Pokémon #${pokemonId(row) || '?'}`
}

function inventoryRows(estado: JsonRecord): InventoryRow[] {
  const rows = new Map<string, InventoryRow>()
  const add = (idRaw: unknown, value: unknown, fallbackName = ''): void => {
    const id = idRaw === undefined || idRaw === null ? '' : String(idRaw)
    if (!id) return
    if (typeof value === 'number' || typeof value === 'string') {
      const quantity = finite(value)
      if (quantity !== undefined && quantity >= 0) rows.set(id, { id, name: fallbackName || `Item #${id}`, quantity: Math.floor(quantity) })
      return
    }
    if (!isRecord(value)) return
    const quantity = finite(first(value.qtd, value.quantidade, value.qty, value.count, value.amount, value.total, value.estoque))
    if (quantity === undefined || quantity < 0) return
    const name = text(first(value.nome, value.name, value.itemNome, value.label)) || fallbackName || `Item #${id}`
    rows.set(id, { id, name, quantity: Math.floor(quantity) })
  }

  for (const key of INVENTORY_KEYS) {
    const container = estado[key]
    if (Array.isArray(container)) {
      for (const row of container) if (isRecord(row)) add(first(row.itemId, row.id, row.item_id), row)
    } else if (isRecord(container)) {
      for (const [mapKey, value] of Object.entries(container)) {
        if (isRecord(value)) add(first(value.itemId, value.id, value.item_id, mapKey), value, /^\d+$/.test(mapKey) ? '' : mapKey)
        else add(mapKey, value, /^\d+$/.test(mapKey) ? '' : mapKey)
      }
    }
  }
  return [...rows.values()]
}

export function isRareItemName(name: string): boolean {
  const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return /(boss\s*token|\btm\b|rare|raro|stone|pedra|fossil|ticket|shard|fragment|caixa|box|especial|special|egg|ovo)/i.test(normalized)
}

export class PanelAnalyticsTracker {
  private sessionStartedAt = Date.now()
  private readonly knownPokemonIds = new Set<string>()
  private readonly inventory = new Map<string, InventoryRow>()
  private readonly rareItems = new Map<string, PanelRareItemSnapshot>()
  private capturesByPotency = [0,0,0,0,0]
  private qualityBands = [0,0,0,0,0]
  private capturesTotal = 0
  private shiniesCaught = 0
  private shiniesSeen: number | null = null
  private captureTimes: number[] = []
  private events: PanelEventSnapshot[] = []
  private revision = 0

  reset(at = Date.now()): void {
    this.sessionStartedAt = at
    this.knownPokemonIds.clear()
    this.inventory.clear()
    this.rareItems.clear()
    this.capturesByPotency = [0,0,0,0,0]
    this.qualityBands = [0,0,0,0,0]
    this.capturesTotal = 0
    this.shiniesCaught = 0
    this.shiniesSeen = null
    this.captureTimes = []
    this.events = []
    this.revision++
  }

  ingestState(estado: JsonRecord, fullState: boolean, at = Date.now()): boolean {
    let changed = false
    const seenValue = finite(first(estado.shiniesSeen, estado.shinySeen, estado.shinysVistos, estado.shiniesVistos))
    if (seenValue !== undefined && seenValue >= 0 && seenValue !== this.shiniesSeen) {
      this.shiniesSeen = Math.floor(seenValue)
      changed = true
    }

    const rows: JsonRecord[] = []
    for (const key of ['pokemons','pkMud']) {
      const value = estado[key]
      if (Array.isArray(value)) for (const row of value) if (isRecord(row)) rows.push(row)
    }

    if (fullState) {
      this.knownPokemonIds.clear()
      for (const row of rows) {
        const id = pokemonId(row)
        if (id) this.knownPokemonIds.add(id)
      }
      this.inventory.clear()
      for (const row of inventoryRows(estado)) this.inventory.set(row.id, row)
      if (changed) this.revision++
      return changed
    }

    for (const row of rows) {
      const id = pokemonId(row)
      if (!id) continue
      const isNew = !this.knownPokemonIds.has(id)
      this.knownPokemonIds.add(id)
      if (!isNew) continue
      this.registerCapture(row, at)
      changed = true
    }

    for (const row of inventoryRows(estado)) {
      const previous = this.inventory.get(row.id)
      this.inventory.set(row.id, row)
      if (!previous || row.quantity <= previous.quantity) continue
      const gained = row.quantity - previous.quantity
      if (!isRareItemName(row.name)) continue
      const current = this.rareItems.get(row.id)
      this.rareItems.set(row.id, { itemId: row.id, name: row.name, quantity: (current?.quantity ?? 0) + gained })
      this.pushEvent({ at, accountEvent: 'rare-item', label: `${row.name} +${gained}`, detail: 'Aumento confirmado no inventário do servidor' })
      changed = true
    }

    if (changed) this.revision++
    return changed
  }

  snapshot(at = Date.now()): PanelAnalyticsSnapshot {
    const cutoff = at - DAY
    this.captureTimes = this.captureTimes.filter((time) => time >= cutoff)
    const capturesLastHour = this.captureTimes.filter((time) => time >= at - HOUR).length
    return {
      revision: this.revision,
      sessionStartedAt: this.sessionStartedAt,
      capturesTotal: this.capturesTotal,
      capturesLastHour,
      capturesByPotency: [...this.capturesByPotency] as [number,number,number,number,number],
      qualityBands: [...this.qualityBands] as [number,number,number,number,number],
      quality35Plus: this.qualityBands.slice(1).reduce((sum, value) => sum + value, 0),
      shiniesSeen: this.shiniesSeen,
      shiniesCaught: this.shiniesCaught,
      rareItems: [...this.rareItems.values()].sort((a,b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).slice(0, 8),
      rareItemsTotal: [...this.rareItems.values()].reduce((sum, item) => sum + item.quantity, 0),
      lastCaptureAt: this.captureTimes.at(-1) ?? null,
      events: this.events.slice(0, 16)
    }
  }

  private registerCapture(row: JsonRecord, at: number): void {
    this.capturesTotal++
    this.captureTimes.push(at)
    const p = potency(first(row.potencia, row.potency))
    if (p) this.capturesByPotency[p - 1]++
    const quality = finite(first(row.qualidade, row.quality, row.nota, row.score))
    if (quality !== undefined) {
      if (quality >= 5) this.qualityBands[4]++
      else if (quality >= 4.5) this.qualityBands[3]++
      else if (quality >= 4) this.qualityBands[2]++
      else if (quality >= 3.5) this.qualityBands[1]++
      else if (quality >= 3) this.qualityBands[0]++
    }
    const shiny = truthy(first(row.shiny, row.isShiny))
    if (shiny) this.shiniesCaught++
    const details = [p ? `P${p}` : '', quality !== undefined ? `nota ${quality.toFixed(2).replace('.', ',')}` : '', shiny ? 'SHINY' : ''].filter(Boolean).join(' · ')
    this.pushEvent({ at, accountEvent: shiny ? 'shiny-caught' : 'capture', label: pokemonName(row), detail: details || 'Captura confirmada pelo servidor' })
  }

  private pushEvent(event: PanelEventSnapshot): void {
    this.events.unshift(event)
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS
  }
}
