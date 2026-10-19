import type { HuntSpecies } from './hunt-data'

export type HuntObjective = 'route' | 'xp' | 'safe'

export interface CombatStatBlock {
  hp?: number
  atk?: number
  def?: number
  spAtk?: number
  spDef?: number
  speed?: number
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
}

export interface HuntRecommendation {
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
  confidence: 'ROTA_V2'
}

export interface RouteStage {
  fromLevel: number
  fromPokemonLevel: number
  toLevel: number | null
  etaHours: number
  hunt: HuntRecommendation
}

const REGION_UNLOCK: Record<string, number> = { Kanto:1, Outland:150, Johto:200, Hoenn:500, Sinnoh:1000, Unova:5000, Kalos:10000, Galar:25000, Paldea:40000, Alola:75000 }
const POTENCY = [0, 1, 1.05, 1.1, 1.25, 2]
const TYPE: Record<string, Partial<Record<string, number>>> = {
  NORMAL:{ROCK:.5,GHOST:0,STEEL:.5}, FIRE:{FIRE:.5,WATER:.5,GRASS:2,ICE:2,BUG:2,ROCK:.5,DRAGON:.5,STEEL:2}, WATER:{FIRE:2,WATER:.5,GRASS:.5,GROUND:2,ROCK:2,DRAGON:.5}, ELECTRIC:{WATER:2,ELECTRIC:.5,GRASS:.5,GROUND:0,FLYING:2,DRAGON:.5}, GRASS:{FIRE:.5,WATER:2,GRASS:.5,POISON:.5,GROUND:2,FLYING:.5,BUG:.5,ROCK:2,DRAGON:.5,STEEL:.5}, ICE:{FIRE:.5,WATER:.5,GRASS:2,ICE:.5,GROUND:2,FLYING:2,DRAGON:2,STEEL:.5}, FIGHTING:{NORMAL:2,ICE:2,POISON:.5,FLYING:.5,PSYCHIC:.5,BUG:.5,ROCK:2,GHOST:0,DARK:2,STEEL:2,FAIRY:.5}, POISON:{GRASS:2,POISON:.5,GROUND:.5,ROCK:.5,GHOST:.5,STEEL:0,FAIRY:2}, GROUND:{FIRE:2,ELECTRIC:2,GRASS:.5,POISON:2,FLYING:0,BUG:.5,ROCK:2,STEEL:2}, FLYING:{ELECTRIC:.5,GRASS:2,FIGHTING:2,BUG:2,ROCK:.5,STEEL:.5}, PSYCHIC:{FIGHTING:2,POISON:2,PSYCHIC:.5,DARK:0,STEEL:.5}, BUG:{FIRE:.5,GRASS:2,FIGHTING:.5,POISON:.5,FLYING:.5,PSYCHIC:2,GHOST:.5,DARK:2,STEEL:.5,FAIRY:.5}, ROCK:{FIRE:2,ICE:2,FIGHTING:.5,GROUND:.5,FLYING:2,BUG:2,STEEL:.5}, GHOST:{NORMAL:0,PSYCHIC:2,GHOST:2,DARK:.5}, DRAGON:{DRAGON:2,STEEL:.5,FAIRY:0}, DARK:{FIGHTING:.5,PSYCHIC:2,GHOST:2,DARK:.5,FAIRY:.5}, STEEL:{FIRE:.5,WATER:.5,ELECTRIC:.5,ICE:2,ROCK:2,STEEL:.5,FAIRY:2}, FAIRY:{FIRE:.5,FIGHTING:2,POISON:.5,DRAGON:2,DARK:2,STEEL:.5}
}

const clamp = (n:number,lo:number,hi:number):number => Math.min(hi,Math.max(lo,n))
const sane = (n:number | undefined,fallback:number):number => n !== undefined && Number.isFinite(n) ? n : fallback

/** Base XP confirmed by the PokeIdle battle packet: a Lv10 Shellder pays 68 = .6*10²+8. */
export function xpPerKill(level:number):number {
  const l=Math.max(1,Math.floor(level))
  return Math.round(.6*l*l+8)
}

/** Absolute XP at the start of a level, matching xpNivel from the server. */
export function xpTotalForLevel(level:number):number {
  const l=Math.max(1,Math.floor(level))
  return Math.round((50/3)*(l*l*l-6*l*l+17*l-12))
}

export function typeEffectiveness(attack:string, defenders:string[]):number {
  return defenders.reduce((v,t)=>v*(TYPE[attack]?.[t]??1),1)
}

/** Hunt uses an amplified chart on top of the normal Pokémon effectiveness. */
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

function potencyMultiplier(profile:HuntProfile):number {
  return POTENCY[profile.potency]*(profile.shiny?3:1)
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
  // Wilds roll capture-like quality/IV/potency. These central values model the middle of that distribution.
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

function attackInterval(profile:HuntProfile):number {
  return Math.max(.9,2-clamp(sane(profile.ivSpeed,profile.ivAtk),1,32)*.01)
}

function playerDps(profile:HuntProfile, enemy:HuntSpecies, stats:Required<CombatStatBlock>):number {
  const matchup=bestMatchup(profile.types,enemy[2])
  if (matchup<=0) return .01
  const wild=expectedWildStats(enemy)
  const basicInterval=attackInterval(profile)
  const physical=expectedDamage(profile.pokemonLevel,30,stats.atk,wild.def,1.5,matchup)/basicInterval
  const special=expectedDamage(profile.pokemonLevel,30,stats.spAtk,wild.spDef,1.5,matchup)/basicInterval
  // Skills are not rendered in the UI; this sustained budget approximates their contribution between basic attacks.
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
    const matchup=bestMatchup(resolved.types,types)
    const wild=expectedWildStats(enemy)
    const wildHp=Math.max(24,wild.hp*12)*5
    const outgoing=playerDps(resolved,enemy,player)
    const ttk=clamp(wildHp/Math.max(.01,outgoing),.12,120)
    const incoming=enemyDps(enemy,resolved,player)
    const timeToFaint=combatHp/Math.max(.01,incoming)
    const fightMargin=timeToFaint/Math.max(.2,ttk)
    const safety=clamp(Math.round(fightMargin*45),0,100)
    const cycle=Math.max(.85,movementOverhead(region)+ttk)
    const killsPerHour=Math.min(3600,3600/cycle)
    const perKill=xpPerKill(level)
    const pokemonPerKill=perKill*pokemonMultiplier
    const pokemonXpHour=killsPerHour*pokemonPerKill
    const trainerXpHour=killsPerHour*perKill*trainerMultiplier
    const survivalFactor=clamp((fightMargin-.45)/1.45,.08,1)
    const score=objective==='safe'
      ? safety*1_000_000+pokemonXpHour
      : objective==='xp'
        ? pokemonXpHour*survivalFactor
        : pokemonXpHour*survivalFactor*(.92+.08*clamp(matchup,.16,5.5))
    return {id,name,types,region,area:explicitArea||name,level,killsPerHour,xpPerKill:perKill,pokemonXpPerKill:pokemonPerKill,trainerXpPerHour:trainerXpHour,pokemonXpPerHour:pokemonXpHour,safety,matchup,score,confidence:'ROTA_V2'}
  }).sort((a,b)=>b.score-a.score||b.pokemonXpPerHour-a.pokemonXpPerHour||b.level-a.level)
}

export function rankHunts(data:HuntSpecies[],profile:HuntProfile,objective:HuntObjective='route'):HuntRecommendation[] {
  return rankInternal(data,profile,objective)
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
  let lastId=-1

  for(let step=0;step<420;step+=1){
    const projected:HuntProfile={...profile,trainerLevel,pokemonLevel,trainerXp,pokemonXp,stats:statsAtPokemonLevel(profile,pokemonLevel)}
    const best=rankInternal(data,projected,'route')[0]
    if(!best) break
    if(best.id!==lastId){
      if(stages.length) stages[stages.length-1].toLevel=trainerLevel-1
      stages.push({fromLevel:trainerLevel,fromPokemonLevel:pokemonLevel,toLevel:null,etaHours:elapsedSeconds/3600,hunt:best})
      lastId=best.id
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
