import type { HuntProfileScan, HuntStatBlock } from '../shared/contracts'

type JsonRecord = Record<string, unknown>

export interface ServerIngestResult {
  accepted: boolean
  changed: boolean
  profile: HuntProfileScan | null
}

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const firstDefined = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null)
const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}
const toPositiveId = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const text = String(value)
  return text && text !== '0' ? text : undefined
}
const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true' || value === 'sim' || value === 'yes') return true
  if (value === 0 || value === '0' || value === 'false' || value === 'não' || value === 'nao' || value === 'no') return false
  return undefined
}
const safeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text && text.length <= 80 ? text : undefined
}
const safePrimitive = (value: unknown): string | number | null | undefined => {
  if (value === null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return safeString(value)
}
const asPotency = (value: unknown): 1|2|3|4|5|undefined => {
  const number = toFiniteNumber(typeof value === 'string' ? value.replace(/^P/i, '') : value)
  return number && [1,2,3,4,5].includes(number) ? number as 1|2|3|4|5 : undefined
}

function statBlockOf(value: unknown): HuntStatBlock | undefined {
  if (!isRecord(value)) return undefined
  const block: HuntStatBlock = {
    hp: toFiniteNumber(value.hp),
    atk: toFiniteNumber(value.atk),
    def: toFiniteNumber(value.def),
    spAtk: toFiniteNumber(firstDefined(value.spAtk, value.spatk, value.sp_atk)),
    spDef: toFiniteNumber(firstDefined(value.spDef, value.spdef, value.sp_def)),
    speed: toFiniteNumber(firstDefined(value.speed, value.spd))
  }
  return Object.values(block).some((entry) => entry !== undefined) ? block : undefined
}

function speciesIdOf(pokemon: JsonRecord): number | undefined {
  const nestedSpecies = isRecord(pokemon.species) ? pokemon.species : isRecord(pokemon.especie) ? pokemon.especie : undefined
  return toFiniteNumber(firstDefined(
    pokemon.speciesId,
    pokemon.especieId,
    pokemon.pokemonId,
    pokemon.pokeId,
    pokemon.dexId,
    pokemon.pokedexId,
    nestedSpecies?.id
  ))
}

function speciesNameOf(pokemon: JsonRecord): string | undefined {
  const nestedSpecies = isRecord(pokemon.species) ? pokemon.species : isRecord(pokemon.especie) ? pokemon.especie : undefined
  // Generic `name`/`nome` is deliberately not used here because on the server it can be a nickname.
  return safeString(firstDefined(
    pokemon.speciesName,
    pokemon.nomeEspecie,
    pokemon.especieNome,
    nestedSpecies?.name,
    nestedSpecies?.nome
  ))
}

function ivTotalOf(pokemon: JsonRecord): number | undefined {
  const direct = toFiniteNumber(firstDefined(pokemon.ivTotal, pokemon.totalIv, pokemon.iv_total))
  if (direct !== undefined) return direct
  const ivs = pokemon.ivs
  if (Array.isArray(ivs)) {
    const values = ivs.map(toFiniteNumber).filter((value): value is number => value !== undefined)
    if (values.length) return values.reduce((sum, value) => sum + value, 0)
  }
  if (isRecord(ivs)) {
    const values = Object.values(ivs).map(toFiniteNumber).filter((value): value is number => value !== undefined)
    if (values.length) return values.reduce((sum, value) => sum + value, 0)
  }
  return undefined
}

function profileSignature(profile: HuntProfileScan | null): string {
  if (!profile) return 'null'
  // Absolute XP changes every kill. Deliberately exclude it so the UI/route is not rebuilt every frame/kill.
  return JSON.stringify({
    trainerLevel: profile.trainerLevel,
    trainerXpMultiplier: profile.trainerXpMultiplier,
    activePokemonId: profile.activePokemonId,
    speciesId: profile.speciesId,
    speciesName: profile.speciesName,
    pokemonLevel: profile.pokemonLevel,
    pokemonXpMultiplier: profile.pokemonXpMultiplier,
    quality: profile.quality,
    potency: profile.potency,
    ivTotal: profile.ivTotal,
    ivAverage: profile.ivAverage,
    ivs: profile.ivs,
    stats: profile.stats,
    refinement: profile.refinement,
    maxHp: profile.maxHp,
    shiny: profile.shiny,
    huntSlug: profile.huntSlug,
    tmElemental: profile.tmElemental,
    tmAoe: profile.tmAoe,
    serverAccountId: profile.serverAccountId,
    serverNick: profile.serverNick
  })
}

export class PokeIdleServerState {
  private readonly pokemons = new Map<string, JsonRecord>()
  private activeId?: string
  private trainerLevel?: number
  private trainerXp?: number
  private trainerXpLevelStart?: number
  private trainerXpNext?: number
  private trainerXpMultiplier = 1
  private pokemonXpMultiplier = 1
  private huntSlug?: string
  private serverAccountId?: string
  private serverNick?: string
  private current: HuntProfileScan | null = null

  reset(): boolean {
    const hadData = this.current !== null || this.activeId !== undefined || this.pokemons.size > 0
    this.pokemons.clear()
    this.activeId = undefined
    this.trainerLevel = undefined
    this.trainerXp = undefined
    this.trainerXpLevelStart = undefined
    this.trainerXpNext = undefined
    this.trainerXpMultiplier = 1
    this.pokemonXpMultiplier = 1
    this.huntSlug = undefined
    this.serverAccountId = undefined
    this.serverNick = undefined
    this.current = null
    return hadData
  }

  profile(): HuntProfileScan | null {
    return this.current
  }

  ingest(packet: unknown, at = Date.now()): ServerIngestResult {
    if (!isRecord(packet)) return { accepted: false, changed: false, profile: this.current }
    const type = String(packet.t || '')
    if (type !== 'welcome' && type !== 'estado') return { accepted: false, changed: false, profile: this.current }
    const estado = isRecord(packet.estado) ? packet.estado : null
    if (!estado) return { accepted: false, changed: false, profile: this.current }

    const previousSignature = profileSignature(this.current)
    const nextServerAccountId = toPositiveId(firstDefined(estado.id, estado.accountId, estado.userId))
    const accountChanged = Boolean(nextServerAccountId && this.serverAccountId && nextServerAccountId !== this.serverAccountId)
    const fullState = type === 'welcome' || estado.cheio === true || accountChanged

    if (fullState) this.pokemons.clear()
    if (accountChanged) {
      this.activeId = undefined
      this.trainerLevel = undefined
      this.trainerXp = undefined
      this.trainerXpLevelStart = undefined
      this.trainerXpNext = undefined
      this.trainerXpMultiplier = 1
      this.pokemonXpMultiplier = 1
      this.huntSlug = undefined
      this.serverNick = undefined
    }

    if (nextServerAccountId) this.serverAccountId = nextServerAccountId
    const nick = safeString(firstDefined(estado.nick, estado.nickname, estado.usuario))
    if (nick) this.serverNick = nick
    const trainerLevel = toFiniteNumber(firstDefined(estado.trainerLevel, estado.nivelTreinador, estado.level, estado.nivel, estado.lvl))
    if (trainerLevel !== undefined) this.trainerLevel = trainerLevel

    const trainerXp = toFiniteNumber(estado.xp)
    const trainerXpLevelStart = toFiniteNumber(firstDefined(estado.xpNivel, estado.xpLevelStart))
    const trainerXpNext = toFiniteNumber(firstDefined(estado.xpProximo, estado.xpNext))
    if (trainerXp !== undefined) this.trainerXp = trainerXp
    if (trainerXpLevelStart !== undefined) this.trainerXpLevelStart = trainerXpLevelStart
    if (trainerXpNext !== undefined) this.trainerXpNext = trainerXpNext

    const bonusXp = isRecord(estado.bonusXp) ? estado.bonusXp : undefined
    const trainerMultiplier = toFiniteNumber(firstDefined(bonusXp?.tr, bonusXp?.trainer, estado.xpTreinadorMultiplicador))
    const pokemonMultiplier = toFiniteNumber(firstDefined(bonusXp?.pk, bonusXp?.pokemon, estado.xpPokemonMultiplicador))
    if (trainerMultiplier !== undefined && trainerMultiplier > 0) this.trainerXpMultiplier = trainerMultiplier
    if (pokemonMultiplier !== undefined && pokemonMultiplier > 0) this.pokemonXpMultiplier = pokemonMultiplier

    const huntSlug = safeString(firstDefined(estado.huntSlug, estado.hunt))
    if (huntSlug) this.huntSlug = huntSlug

    const applyPokemonRows = (rows: unknown): void => {
      if (!Array.isArray(rows)) return
      for (const row of rows) {
        if (!isRecord(row)) continue
        const id = toPositiveId(row.id)
        if (!id) continue
        const previous = this.pokemons.get(id) || {}
        this.pokemons.set(id, { ...previous, ...row })
      }
    }
    applyPokemonRows(estado.pokemons)
    applyPokemonRows(estado.pkMud)

    if (Object.prototype.hasOwnProperty.call(estado, 'activeId')) {
      this.activeId = toPositiveId(estado.activeId)
    }

    this.current = this.buildProfile(at)
    const changed = previousSignature !== profileSignature(this.current)
    return { accepted: true, changed, profile: this.current }
  }

  private buildProfile(at: number): HuntProfileScan | null {
    // Strict rule: no activeId from the server means no Hunt profile.
    if (!this.activeId) return null
    const pokemon = this.pokemons.get(this.activeId)
    // Never fall back to another Pokémon if the active record has not arrived yet.
    if (!pokemon) return null

    const ivTotal = ivTotalOf(pokemon)
    const ivAverageDirect = toFiniteNumber(firstDefined(pokemon.ivAverage, pokemon.ivMedio, pokemon.mediaIv))
    const ivAverage = ivAverageDirect ?? (ivTotal !== undefined ? Number((ivTotal / 6).toFixed(2)) : undefined)

    return {
      trainerLevel: this.trainerLevel,
      trainerXp: this.trainerXp,
      trainerXpLevelStart: this.trainerXpLevelStart,
      trainerXpNext: this.trainerXpNext,
      trainerXpMultiplier: this.trainerXpMultiplier,
      activePokemonId: this.activeId,
      speciesId: speciesIdOf(pokemon),
      speciesName: speciesNameOf(pokemon),
      pokemonLevel: toFiniteNumber(firstDefined(pokemon.level, pokemon.nivel, pokemon.lvl)),
      pokemonXp: toFiniteNumber(pokemon.xp),
      pokemonXpLevelStart: toFiniteNumber(firstDefined(pokemon.xpNivel, pokemon.xpLevelStart)),
      pokemonXpNext: toFiniteNumber(firstDefined(pokemon.xpProximo, pokemon.xpNext)),
      pokemonXpMultiplier: this.pokemonXpMultiplier,
      quality: toFiniteNumber(firstDefined(pokemon.qualidade, pokemon.quality)),
      potency: asPotency(firstDefined(pokemon.potencia, pokemon.potency)),
      ivTotal,
      ivAverage,
      ivs: statBlockOf(pokemon.ivs),
      stats: statBlockOf(pokemon.stats),
      refinement: statBlockOf(firstDefined(pokemon.refino, pokemon.refinement)),
      maxHp: toFiniteNumber(pokemon.maxHp),
      shiny: toBoolean(firstDefined(pokemon.shiny, pokemon.isShiny)),
      huntSlug: this.huntSlug,
      tmElemental: safePrimitive(pokemon.tmElemental),
      tmAoe: toBoolean(pokemon.tmAoe),
      serverAccountId: this.serverAccountId,
      serverNick: this.serverNick,
      source: 'server',
      detectedAt: at
    }
  }
}
