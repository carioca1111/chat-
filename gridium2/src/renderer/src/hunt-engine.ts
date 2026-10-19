import type { HuntSpecies } from './hunt-data'

export type HuntObjective = 'route' | 'xp' | 'safe'
export type HuntConfidence = 'ESTIMADO' | 'CALIBRADO'

export interface CombatStatBlock {
  hp?: number
  atk?: number
  def?: number
  spAtk?: number
  spDef?: number
  speed?: number
}

export interface HuntMove {
  name?: string
  type: string
  power: number
  cooldownSeconds: number
  category: 'physical' | 'special'
}

export interface HuntCalibrationSample {
  huntKey: string
  sampleSeconds: number
  kills: number
  pokemonXpGained?: number
  trainerXpGained?: number
  deaths?: number
  heals?: number
  idleSeconds?: number
}

export interface HuntProfile {
  trainerLevel: number
  speciesId: number
  pokemonLevel: number
  quality: number
  potency: 1 | 2 | 3 | 4 | 5
  shiny: boolean
  ivAtk: number
  ivSpAtk: number
  ivDef: number
  ivSpDef: number
  ivHp: number
  ivSpeed?: number
  types: string[]
  baseStats?: number[]
  stats?: CombatStatBlock
  refinement?: CombatStatBlock
  trainerXp?: number
  pokemonXp?: number
  trainerXpMultiplier?: number
  pokemonXpMultiplier?: number
  moves?: HuntMove[]
  tmElemental?: string | number | null
  tmAoe?: boolean
  calibration?: HuntCalibrationSample[]
}

export interface HuntRecommendation {
  key: string
  id: number
  name: string
  types: string[]
  region: string
  area: string
  level: number
  killsPerHour: number
  xpPerKill: number
  pokemonXpPerKill: number
  trainerXpPerHour: number
  pokemonXpPerHour: number
  safety: number
  matchup: number
  score: number
  confidence: HuntConfidence
}

export interface RouteStage {
  fromLevel: number
  fromPokemonLevel: number
  toLevel: number | null
  etaHours: number
  hunt: HuntRecommendation
}

const REGION_UNLOCK: Record<string, number> = { Kanto:1, Outland:150, Johto:200, Hoenn:500, Sinnoh:1000, Unova:5000, Kalos:10000, Galar:25000, Paldea:40000, Alola:75000 }

// Official current PokeIdle terms publish these stat bonuses exactly:
// P1 +0%, P2 +5%, P3 +10%, P4 +25%, P5 +100%; shiny doubles stats.
const POTENCY = [0, 1, 1.05, 1.1, 1.25, 2]
const MIN_CALIBRATION_SECONDS = 120
const MIN_CALIBRATION_KILLS = 10
const ROUTE_SWITCH_GAIN = 0.03
const MAX_RANK_CACHE = 24

const TYPE: Record<string, Partial<Record<string, number>>> = {
  NORMAL:{ROCK:.5,GHOST:0,STEEL:.5}, FIRE:{FIRE:.5,WATER:.5,GRASS:2,ICE:2,BUG:2,ROCK:.5,DRAGON:.5,STEEL:2}, WATER:{FIRE:2,WATER:.5,GRASS:.5,GROUND:2,ROCK:2,DRAGON:.5}, ELECTRIC:{WATER:2,ELECTRIC:.5,GRASS:.5,GROUND:0,FLYING:2,DRAGON:.5}, GRASS:{FIRE:.5,WATER:2,GRASS:.5,POISON:.5,GROUND:2,FLYING:.5,BUG:.5,ROCK:2,DRAGON:.5,STEEL:.5}, ICE:{FIRE:.5,WATER:.5,GRASS:2,ICE:.5,GROUND:2,FLYING:2,DRAGON:2,STEEL:.5}, FIGHTING:{NORMAL:2,ICE:2,POISON:.5,FLYING:.5,PSYCHIC:.5,BUG:.5,ROCK:2,GHOST:0,DARK:2,STEEL:2,FAIRY:.5}, POISON:{GRASS:2,POISON:.5,GROUND:.5,ROCK:.5,GHOST:.5,STEEL:0,FAIRY:2}, GROUND:{FIRE:2,ELECTRIC:2,GRASS:.5,POISON:2,FLYING:0,BUG:.5,ROCK:2,STEEL:2}, FLYING:{ELECTRIC:.5,GRASS:2,FIGHTING:2,BUG:2,ROCK:.5,STEEL:.5}, PSYCHIC:{FIGHTING:2,POISON:2,PSYCHIC:.5,DARK:0,STEEL:.5}, BUG:{FIRE:.5,GRASS:2,FIGHTING:.5,POISON:.5,FLYING:.5,PSYCHIC:2,GHOST:.5,DARK:2,STEEL:.5,FAIRY:.5}, ROCK:{FIRE:2,ICE:2,FIGHTING:.5,GROUND:.5,FLYING:2,BUG:2,STEEL:.5}, GHOST:{NORMAL:0,PSYCHIC:2,GHOST:2,DARK:.5}, DRAGON:{DRAGON:2,STEEL:.5,FAIRY:0}, DARK:{FIGHTING:.5,PSYCHIC:2,GHOST:2,DARK:.5,FAIRY:.5}, STEEL:{FIRE:.5,WATER:.5,ELECTRIC:.5,ICE:2,ROCK:2,STEEL:.5,FAIRY:2}, FAIRY:{FIRE:.5,FIGHTING:2,POISON:.5,DRAGON:2,DARK:2,STEEL:.5}
}
const KNOWN_TYPES = new Set(Object.keys(TYPE))

const clamp = (n:number,lo:number,hi:number):number => Math.min(hi,Math.max(lo,n))
const sane = (n:number | undefined,fallback:number):number => n !== undefined && Number.isFinite(n) ? n : fallback
const normalizeType = (value:unknown):string => String(value ?? '').trim().toUpperCase()

/**
 * XP base por abate observado no PokeIdle atual: nivel² + 12.
 * A curva foi validada empiricamente em campo em 2026-10 (amostra multi-Hunt,
 * níveis 1..150). Não é confundida com xpNivel, que é a curva acumulada.
 */
export function xpPerKill(level:number):number {
  const l=Math.max(1,Math.floor(level))
  return l*l+12
}

/** Absolute XP at the start of a level, matching xpNivel from the server. */
export function xpTotalForLevel(level:number):number {
  const l=Math.max(1,Math.floor(level))
  return Math.round((50/3)*(l*l*l-6*l*l+17*l-12))
}

export function typeEffectiveness(attack:string, defenders:string[]):number {
  const normalized=normalizeType(attack)
  return defenders.reduce((v,t)=>v*(TYPE[normalized]?.[normalizeType(t)]??1),1)
}

/** Hunt amplifies the regular type chart; measured Hunt values include 2.5x and 5.5x. */
export function huntTypeEffectiveness(attack:string, defenders:string[]):number {
  const standard=typeEffectiveness(attack,defenders)
  if (standard===0) return 0
  if (standard<=.25) return 1/6
  if (standard<=.5) return 1/3
  if (standard>=4) return 5.5
  if (standard>=2) return 2.5
  return 1
}

function bestMatchup(playerTypes:string[], enemyTypes:string[]):number {
  return playerTypes.length ? Math.max(...playerTypes.map((t)=>huntTypeEffectiveness(t,enemyTypes))) : 1
}

export function statPowerMultiplier(potency:1|2|3|4|5,shiny:boolean):number {
  return POTENCY[potency]*(shiny?2:1)
}

function potencyMultiplier(profile:HuntProfile):number {
  return statPowerMultiplier(profile.potency,profile.shiny)
}

function scaledPlayerStats(profile:HuntProfile): Required<CombatStatBlock> {
  const server=profile.stats
  if (server && [server.hp,server.atk,server.def,server.spAtk,server.spDef,server.speed].every((v)=>v !== undefined && Number.isFinite(v))) {
    return {
      hp:sane(server.hp,1), atk:sane(server.atk,1), def:sane(server.def,1), spAtk:sane(server.spAtk,1), spDef:sane(server.spDef,1), speed:sane(server.speed,1)
    }
  }
  const base=profile.baseStats??[100,100,100,100,100,100]
  const ref=profile.refinement??{}
  const q=clamp(sane(profile.quality,1),.8,1.8)
  const mul=potencyMultiplier(profile)
  const stat=(baseValue:number,iv:number,expo:number,refine=0):number => Math.max(1,Math.round((baseValue+refine+2*clamp(iv,1,32))*profile.pokemonLevel/100*Math.pow(q,expo)*mul))
  return {
    hp:stat(base[0],profile.ivHp,.95,sane(ref.hp,0)),
    atk:stat(base[1],profile.ivAtk,.8,sane(ref.atk,0)),
    def:stat(base[2],profile.ivDef,.8,sane(ref.def,0)),
    spAtk:stat(base[3],profile.ivSpAtk,.8,sane(ref.spAtk,0)),
    spDef:stat(base[4],profile.ivSpDef,.8,sane(ref.spDef,0)),
    speed:stat(base[5],sane(profile.ivSpeed,16),.95,sane(ref.speed,0))
  }
}

function statsAtPokemonLevel(profile:HuntProfile, level:number):Required<CombatStatBlock> {
  const current=scaledPlayerStats(profile)
  if (level===profile.pokemonLevel) return current
  const ratio=Math.max(1,level)/Math.max(1,profile.pokemonLevel)
  return {
    hp:Math.max(1,Math.round(current.hp*ratio)),
    atk:Math.max(1,Math.round(current.atk*ratio)),
    def:Math.max(1,Math.round(current.def*ratio)),
    spAtk:Math.max(1,Math.round(current.spAtk*ratio)),
    spDef:Math.max(1,Math.round(current.spDef*ratio)),
    speed:Math.max(1,Math.round(current.speed*ratio))
  }
}

function expectedWildStats(enemy:HuntSpecies):Required<CombatStatBlock> {
  const [,,,base,level]=enemy
  // Until the server exposes the exact spawned enemy roll, wild quality/IV/potency
  // remain an explicit central estimate. This is why non-calibrated rows say ESTIMADO.
  const q=1.16
  const potency=1.025
  const iv=16.5
  const stat=(baseValue:number,expo:number):number => Math.max(1,Math.round((baseValue+2*iv)*level/100*Math.pow(q,expo)*potency))
  return { hp:stat(base[0],.95), atk:stat(base[1],.8), def:stat(base[2],.8), spAtk:stat(base[3],.8), spDef:stat(base[4],.8), speed:stat(base[5],.95) }
}

function expectedDamage(level:number,power:number,attack:number,defense:number,stab:number,effectiveness:number):number {
  if (effectiveness<=0) return 0
  const base=((2*level/5+2)*power*Math.max(1,attack)/Math.max(1,defense))/50+2
  return Math.max(1,base*stab*effectiveness*.925)
}

export function effectiveMoveCooldown(baseSeconds:number,ivSpeed:number | undefined):number {
  return Math.max(.1,Math.max(.1,baseSeconds)-clamp(sane(ivSpeed,16),1,32)*.01)
}

function attackInterval(profile:HuntProfile):number {
  return Math.max(.9,2-clamp(sane(profile.ivSpeed,profile.ivAtk),1,32)*.01)
}

function validMove(move:HuntMove):boolean {
  return KNOWN_TYPES.has(normalizeType(move.type)) && Number.isFinite(move.power) && move.power>0 && Number.isFinite(move.cooldownSeconds) && move.cooldownSeconds>0
}

function resolvedMoves(profile:HuntProfile):HuntMove[] {
  const supplied=(profile.moves??[]).filter(validMove).map((move)=>({...move,type:normalizeType(move.type)}))
  const tmType=normalizeType(profile.tmElemental)
  if (typeof profile.tmElemental==='string' && KNOWN_TYPES.has(tmType) && !supplied.some((move)=>move.type===tmType && move.power===2800)) {
    // Elemental TM: measured single-target move power/cooldown. tmAoe is deliberately
    // not multiplied here because wave density/number of targets is not in welcome/estado.
    supplied.push({name:'TM Elemental',type:tmType,power:2800,cooldownSeconds:60,category:'special'})
  }
  return supplied
}

function moveDps(profile:HuntProfile,enemy:HuntSpecies,stats:Required<CombatStatBlock>,move:HuntMove):number {
  const wild=expectedWildStats(enemy)
  const effectiveness=huntTypeEffectiveness(move.type,enemy[2])
  if(effectiveness<=0) return 0
  const stab=profile.types.map(normalizeType).includes(normalizeType(move.type))?1.5:1
  const attack=move.category==='physical'?stats.atk:stats.spAtk
  const defense=move.category==='physical'?wild.def:wild.spDef
  const damage=expectedDamage(profile.pokemonLevel,move.power,attack,defense,stab,effectiveness)
  return damage/effectiveMoveCooldown(move.cooldownSeconds,profile.ivSpeed)
}

function playerDps(profile:HuntProfile, enemy:HuntSpecies, stats:Required<CombatStatBlock>):number {
  const moves=resolvedMoves(profile)
  if(moves.length){
    const dps=moves.reduce((sum,move)=>sum+moveDps(profile,enemy,stats,move),0)
    if(dps>0) return dps
  }

  // welcome/estado does not currently expose the complete equipped move list.
  // Keep a conservative theoretical fallback instead of inventing named moves.
  const matchup=bestMatchup(profile.types,enemy[2])
  if (matchup<=0) return .01
  const wild=expectedWildStats(enemy)
  const basicInterval=attackInterval(profile)
  const physical=expectedDamage(profile.pokemonLevel,30,stats.atk,wild.def,1.5,matchup)/basicInterval
  const special=expectedDamage(profile.pokemonLevel,30,stats.spAtk,wild.spDef,1.5,matchup)/basicInterval
  const skillBudget=profile.pokemonLevel>=60?2:profile.pokemonLevel>=30?1.5:1
  const skillPhysical=expectedDamage(profile.pokemonLevel,100,stats.atk,wild.def,1.5,matchup)/25
  const skillSpecial=expectedDamage(profile.pokemonLevel,100,stats.spAtk,wild.spDef,1.5,matchup)/25
  return Math.max(physical,special)+Math.max(skillPhysical,skillSpecial)*skillBudget
}

function enemyDps(enemy:HuntSpecies, profile:HuntProfile, player:Required<CombatStatBlock>):number {
  const wild=expectedWildStats(enemy)
  const enemyTypes=enemy[2]
  const matchup=enemyTypes.length?Math.max(...enemyTypes.map((type)=>huntTypeEffectiveness(type,profile.types))):1
  if (matchup<=0) return .01
  const physical=expectedDamage(enemy[4],30,wild.atk,player.def,1.5,matchup)
  const special=expectedDamage(enemy[4],30,wild.spAtk,player.spDef,1.5,matchup)
  return Math.max(physical,special)/1.4*1.8
}

function movementOverhead(region:string):number {
  if (region==='Outland') return 7.2
  if (['Unova','Kalos','Galar','Paldea','Alola'].includes(region)) return 5.4
  return 5.9
}

export function huntKey(enemy:HuntSpecies):string {
  const [id,,, ,level,region,area]=enemy
  return `${region}|${area}|${id}|${level}`
}

function calibrationFor(profile:HuntProfile,key:string):HuntCalibrationSample | undefined {
  return profile.calibration?.find((sample)=>sample.huntKey===key && sample.sampleSeconds>=MIN_CALIBRATION_SECONDS && sample.kills>=MIN_CALIBRATION_KILLS)
}

function rankInternal(data:HuntSpecies[],profile:HuntProfile,objective:HuntObjective):HuntRecommendation[] {
  const baseStats=profile.baseStats??data.find((row)=>row[0]===profile.speciesId)?.[3]??[100,100,100,100,100,100]
  const resolved={...profile,baseStats}
  const unlocked=data.filter((row)=>row[4]<=resolved.trainerLevel&&(REGION_UNLOCK[row[5]]??1)<=resolved.trainerLevel)
  const player=statsAtPokemonLevel(resolved,resolved.pokemonLevel)
  const combatHp=Math.max(24,player.hp*12)
  const pokemonMultiplier=Math.max(.05,sane(resolved.pokemonXpMultiplier,1))
  const trainerMultiplier=Math.max(.05,sane(resolved.trainerXpMultiplier,1))

  return unlocked.map((enemy):HuntRecommendation=>{
    const [id,name,types,,level,region,explicitArea]=enemy
    const key=huntKey(enemy)
    const matchup=bestMatchup(resolved.types,types)
    const wild=expectedWildStats(enemy)
    const wildHp=Math.max(24,wild.hp*12)*5
    const outgoing=playerDps(resolved,enemy,player)
    const ttk=clamp(wildHp/Math.max(.01,outgoing),.12,120)
    const incoming=enemyDps(enemy,resolved,player)
    const timeToFaint=combatHp/Math.max(.01,incoming)
    const fightMargin=timeToFaint/Math.max(.2,ttk)
    const theoreticalSafety=clamp(Math.round(fightMargin*45),0,100)
    const cycle=Math.max(.85,movementOverhead(region)+ttk)
    const theoreticalKillsPerHour=Math.min(3600,3600/cycle)
    const perKill=xpPerKill(level)
    const theoreticalPokemonPerKill=perKill*pokemonMultiplier
    const theoreticalTrainerPerKill=perKill*trainerMultiplier
    const calibration=calibrationFor(resolved,key)
    const confidence:HuntConfidence=calibration?'CALIBRADO':'ESTIMADO'
    const killsPerHour=calibration ? calibration.kills/calibration.sampleSeconds*3600 : theoreticalKillsPerHour
    const pokemonPerKill=calibration?.pokemonXpGained !== undefined && calibration.kills>0
      ? calibration.pokemonXpGained/calibration.kills
      : theoreticalPokemonPerKill
    const pokemonXpHour=calibration?.pokemonXpGained !== undefined
      ? calibration.pokemonXpGained/calibration.sampleSeconds*3600
      : killsPerHour*pokemonPerKill
    const trainerXpHour=calibration?.trainerXpGained !== undefined
      ? calibration.trainerXpGained/calibration.sampleSeconds*3600
      : killsPerHour*theoreticalTrainerPerKill
    const observedSafety=calibration && (calibration.deaths??0)>0
      ? clamp(Math.round(100*(1-(calibration.deaths??0)/Math.max(1,calibration.kills+(calibration.deaths??0)))),0,100)
      : 100
    const safety=Math.min(theoreticalSafety,observedSafety)
    const survivalFactor=clamp((fightMargin-.45)/1.45,.08,1)
    const score=objective==='safe'
      ? safety*1_000_000+pokemonXpHour
      : objective==='xp'
        ? pokemonXpHour*survivalFactor
        : pokemonXpHour*survivalFactor*(.92+.08*clamp(matchup,.16,5.5))
    return {key,id,name,types,region,area:explicitArea||name,level,killsPerHour,xpPerKill:perKill,pokemonXpPerKill:pokemonPerKill,trainerXpPerHour:trainerXpHour,pokemonXpPerHour:pokemonXpHour,safety,matchup,score,confidence}
  }).sort((a,b)=>b.score-a.score||b.pokemonXpPerHour-a.pokemonXpPerHour||b.level-a.level)
}

const rankCache=new WeakMap<HuntSpecies[],Map<string,HuntRecommendation[]>>()

function profileCacheKey(profile:HuntProfile,objective:HuntObjective):string {
  return `${objective}|${JSON.stringify(profile)}`
}

export function rankHunts(data:HuntSpecies[],profile:HuntProfile,objective:HuntObjective='route'):HuntRecommendation[] {
  let cache=rankCache.get(data)
  if(!cache){ cache=new Map(); rankCache.set(data,cache) }
  const key=profileCacheKey(profile,objective)
  const existing=cache.get(key)
  if(existing) return existing
  const ranked=rankInternal(data,profile,objective)
  if(cache.size>=MAX_RANK_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(key,ranked)
  return ranked
}

export function shouldSwitchHunt(current:HuntRecommendation,next:HuntRecommendation,minGain=ROUTE_SWITCH_GAIN):boolean {
  if(current.key===next.key) return false
  return next.score>current.score*(1+Math.max(0,minGain))
}

function nextThreshold(level:number):number { return xpTotalForLevel(level+1) }
function initialXp(level:number,value:number|undefined):number {
  const floor=xpTotalForLevel(level)
  const next=nextThreshold(level)
  return clamp(sane(value,floor),floor,next-.0001)
}

export function buildRoute(data:HuntSpecies[],profile:HuntProfile,maxStages=6):RouteStage[] {
  let trainerLevel=Math.max(1,Math.floor(profile.trainerLevel))
  let pokemonLevel=Math.max(1,Math.floor(profile.pokemonLevel))
  let trainerXp=initialXp(trainerLevel,profile.trainerXp)
  let pokemonXp=initialXp(pokemonLevel,profile.pokemonXp)
  let elapsedSeconds=0
  const stages:RouteStage[]=[]
  let currentKey=''

  for(let step=0;step<420;step+=1){
    const projected:HuntProfile={...profile,trainerLevel,pokemonLevel,trainerXp,pokemonXp,stats:statsAtPokemonLevel(profile,pokemonLevel)}
    const rows=rankInternal(data,projected,'route')
    let best=rows[0]
    if(!best) break
    if(currentKey){
      const current=rows.find((row)=>row.key===currentKey)
      if(current && !shouldSwitchHunt(current,best)) best=current
    }
    if(best.key!==currentKey){
      if(stages.length) stages[stages.length-1].toLevel=trainerLevel-1
      stages.push({fromLevel:trainerLevel,fromPokemonLevel:pokemonLevel,toLevel:null,etaHours:elapsedSeconds/3600,hunt:best})
      currentKey=best.key
      if(stages.length>=maxStages) break
    }

    const trainerPerSecond=Math.max(.0001,best.trainerXpPerHour/3600)
    const pokemonPerSecond=Math.max(.0001,best.pokemonXpPerHour/3600)
    const toTrainer=Math.max(.001,(nextThreshold(trainerLevel)-trainerXp)/trainerPerSecond)
    const toPokemon=Math.max(.001,(nextThreshold(pokemonLevel)-pokemonXp)/pokemonPerSecond)
    const dt=Math.min(toTrainer,toPokemon)
    if(!Number.isFinite(dt)||dt>365*24*3600) break
    elapsedSeconds+=dt
    trainerXp+=trainerPerSecond*dt
    pokemonXp+=pokemonPerSecond*dt

    while(trainerXp+1e-5>=nextThreshold(trainerLevel)) trainerLevel+=1
    while(pokemonXp+1e-5>=nextThreshold(pokemonLevel)) pokemonLevel+=1
    if(trainerLevel>profile.trainerLevel+5000||pokemonLevel>profile.pokemonLevel+5000) break
  }
  return stages
}
