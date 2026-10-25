import type { AccountId, HuntStatBlock, PokemonWorthSnapshot } from '../shared/contracts'
import type { AccountRuntime } from './account-runtime'

type JsonRecord = Record<string, unknown>
type RuntimeSlot = { serverState: unknown }
type RuntimeWithSlots = { accounts: Map<AccountId, RuntimeSlot> }
type StateWithPokemonMap = { pokemons: Map<string, JsonRecord>; activeId?: string }

const isRecord = (value: unknown): value is JsonRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const firstDefined = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null)
const finite = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}
const safeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const result = value.trim()
  return result && result.length <= 100 ? result : undefined
}
const bool = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true' || value === 'sim' || value === 'yes') return true
  if (value === 0 || value === '0' || value === 'false' || value === 'não' || value === 'nao' || value === 'no') return false
  return undefined
}
const potency = (value: unknown): 1|2|3|4|5|undefined => {
  const parsed = finite(typeof value === 'string' ? value.replace(/^P/i, '') : value)
  return parsed && [1,2,3,4,5].includes(parsed) ? parsed as 1|2|3|4|5 : undefined
}

function statBlock(value: unknown): HuntStatBlock | undefined {
  if (!isRecord(value)) return undefined
  const out: HuntStatBlock = {
    hp: finite(value.hp),
    atk: finite(value.atk),
    def: finite(value.def),
    spAtk: finite(firstDefined(value.spAtk, value.spatk, value.sp_atk)),
    spDef: finite(firstDefined(value.spDef, value.spdef, value.sp_def)),
    speed: finite(firstDefined(value.speed, value.spd))
  }
  return Object.values(out).some((item) => item !== undefined) ? out : undefined
}

function speciesRecord(row: JsonRecord): JsonRecord | undefined {
  return isRecord(row.species) ? row.species : isRecord(row.especie) ? row.especie : undefined
}

function speciesId(row: JsonRecord): number | undefined {
  const species = speciesRecord(row)
  return finite(firstDefined(row.speciesId, row.especieId, row.pokemonId, row.pokeId, row.dexId, row.pokedexId, species?.id))
}

function speciesName(row: JsonRecord): string | undefined {
  const species = speciesRecord(row)
  return safeText(firstDefined(row.speciesName, row.nomeEspecie, row.especieNome, species?.name, species?.nome))
}

function ivTotal(row: JsonRecord, ivs?: HuntStatBlock): number | undefined {
  const direct = finite(firstDefined(row.ivTotal, row.totalIv, row.iv_total))
  if (direct !== undefined) return direct
  if (!ivs) return undefined
  const values = [ivs.hp, ivs.atk, ivs.def, ivs.spAtk, ivs.spDef, ivs.speed].filter((item): item is number => item !== undefined)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined
}

function typesOf(row: JsonRecord): string[] | undefined {
  const species = speciesRecord(row)
  const raw = firstDefined(row.types, row.tipos, species?.types, species?.tipos)
  if (!Array.isArray(raw)) return undefined
  const values = raw.map((item) => {
    if (typeof item === 'string') return item.trim().toUpperCase()
    if (isRecord(item)) return safeText(firstDefined(item.name, item.nome, item.type, item.tipo))?.toUpperCase() || ''
    return ''
  }).filter(Boolean).slice(0, 3)
  return values.length ? values : undefined
}

export function pokemonWorthFromServerRow(instanceId: string, row: JsonRecord, accountId?: AccountId): PokemonWorthSnapshot {
  const species = speciesRecord(row)
  const ivs = statBlock(row.ivs)
  const stats = statBlock(row.stats)
  const baseStats = statBlock(firstDefined(row.baseStats, row.statsBase, row.base_stats, species?.baseStats, species?.base_stats, species?.stats))
  const refinement = statBlock(firstDefined(row.refino, row.refinement))
  const maxHp = finite(firstDefined(row.maxHp, row.hpMax, row.max_hp))
  return {
    instanceId,
    accountId,
    speciesId: speciesId(row),
    speciesName: speciesName(row),
    nickname: safeText(firstDefined(row.nickname, row.apelido, row.name, row.nome)),
    level: finite(firstDefined(row.level, row.nivel, row.lvl)),
    quality: finite(firstDefined(row.qualidade, row.quality)),
    potency: potency(firstDefined(row.potencia, row.potency)),
    ivTotal: ivTotal(row, ivs),
    ivs,
    stats,
    baseStats,
    refinement,
    shiny: bool(firstDefined(row.shiny, row.isShiny)),
    legendary: bool(firstDefined(row.legendary, row.isLegendary, row.lendario, row.mythical, row.isMythical, species?.legendary, species?.mythical)),
    types: typesOf(row),
    combatHp: maxHp !== undefined ? maxHp : stats?.hp !== undefined ? Math.round(stats.hp * 12) : undefined,
    source: 'account'
  }
}

/**
 * Roster is intentionally read only on an explicit "Vale a pena" request.
 * It is not added to the 100 ms app snapshot stream, which keeps Hunt/Panel traffic unchanged.
 */
export function searchPokemonRoster(runtime: AccountRuntime | null, accountId: AccountId, query = '', limit = 120): PokemonWorthSnapshot[] {
  if (!runtime) return []
  const slots = (runtime as unknown as RuntimeWithSlots).accounts
  const slot = slots?.get(accountId)
  if (!slot) return []
  const state = slot.serverState as StateWithPokemonMap
  const map = state?.pokemons
  if (!(map instanceof Map)) return []

  const needle = query.trim().toLowerCase()
  const scored: Array<{ pokemon: PokemonWorthSnapshot; active: boolean }> = []
  for (const [id, row] of map) {
    const pokemon = pokemonWorthFromServerRow(id, row, accountId)
    const haystack = `${pokemon.speciesName || ''} ${pokemon.nickname || ''} ${pokemon.speciesId ?? ''} ${pokemon.instanceId}`.toLowerCase()
    if (needle && !haystack.includes(needle)) continue
    scored.push({ pokemon, active: id === state.activeId })
  }

  scored.sort((a, b) =>
    Number(b.active) - Number(a.active)
    || (b.pokemon.level ?? 0) - (a.pokemon.level ?? 0)
    || (b.pokemon.potency ?? 0) - (a.pokemon.potency ?? 0)
    || (b.pokemon.quality ?? 0) - (a.pokemon.quality ?? 0)
    || (a.pokemon.speciesName || '').localeCompare(b.pokemon.speciesName || '')
  )
  return scored.slice(0, Math.max(1, Math.min(250, limit))).map((item) => item.pokemon)
}
