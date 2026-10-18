import type { HuntSpecies } from './hunt-data'

export type HuntObjective = 'route' | 'xp' | 'safe'

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
  types: string[]
  baseStats: number[]
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
  trainerXpPerHour: number
  pokemonXpPerHour: number
  safety: number
  matchup: number
  score: number
  confidence: 'MODELADO'
}

export interface RouteStage {
  fromLevel: number
  toLevel: number | null
  hunt: HuntRecommendation
}

const REGION_UNLOCK: Record<string, number> = { Kanto:1, Outland:150, Johto:200, Hoenn:500, Sinnoh:1000, Unova:5000, Kalos:10000, Galar:25000, Paldea:40000, Alola:75000 }
const POTENCY = [0, 1, 1.05, 1.1, 1.25, 2]
const TYPE: Record<string, Partial<Record<string, number>>> = {
  NORMAL:{ROCK:.5,GHOST:0,STEEL:.5}, FIRE:{FIRE:.5,WATER:.5,GRASS:2,ICE:2,BUG:2,ROCK:.5,DRAGON:.5,STEEL:2}, WATER:{FIRE:2,WATER:.5,GRASS:.5,GROUND:2,ROCK:2,DRAGON:.5}, ELECTRIC:{WATER:2,ELECTRIC:.5,GRASS:.5,GROUND:0,FLYING:2,DRAGON:.5}, GRASS:{FIRE:.5,WATER:2,GRASS:.5,POISON:.5,GROUND:2,FLYING:.5,BUG:.5,ROCK:2,DRAGON:.5,STEEL:.5}, ICE:{FIRE:.5,WATER:.5,GRASS:2,ICE:.5,GROUND:2,FLYING:2,DRAGON:2,STEEL:.5}, FIGHTING:{NORMAL:2,ICE:2,POISON:.5,FLYING:.5,PSYCHIC:.5,BUG:.5,ROCK:2,GHOST:0,DARK:2,STEEL:2,FAIRY:.5}, POISON:{GRASS:2,POISON:.5,GROUND:.5,ROCK:.5,GHOST:.5,STEEL:0,FAIRY:2}, GROUND:{FIRE:2,ELECTRIC:2,GRASS:.5,POISON:2,FLYING:0,BUG:.5,ROCK:2,STEEL:2}, FLYING:{ELECTRIC:.5,GRASS:2,FIGHTING:2,BUG:2,ROCK:.5,STEEL:.5}, PSYCHIC:{FIGHTING:2,POISON:2,PSYCHIC:.5,DARK:0,STEEL:.5}, BUG:{FIRE:.5,GRASS:2,FIGHTING:.5,POISON:.5,FLYING:.5,PSYCHIC:2,GHOST:.5,DARK:2,STEEL:.5,FAIRY:.5}, ROCK:{FIRE:2,ICE:2,FIGHTING:.5,GROUND:.5,FLYING:2,BUG:2,STEEL:.5}, GHOST:{NORMAL:0,PSYCHIC:2,GHOST:2,DARK:.5}, DRAGON:{DRAGON:2,STEEL:.5,FAIRY:0}, DARK:{FIGHTING:.5,PSYCHIC:2,GHOST:2,DARK:.5,FAIRY:.5}, STEEL:{FIRE:.5,WATER:.5,ELECTRIC:.5,ICE:2,ROCK:2,STEEL:.5,FAIRY:2}, FAIRY:{FIRE:.5,FIGHTING:2,POISON:.5,DRAGON:2,DARK:2,STEEL:.5}
}

const clamp = (n:number,lo:number,hi:number):number => Math.min(hi,Math.max(lo,n))
const sane = (n:number,fallback:number):number => Number.isFinite(n) ? n : fallback

export function xpPerKill(level:number):number {
  const l=Math.max(1,Math.floor(level))
  return Math.round(.6*l*l+8)
}
export function typeEffectiveness(attack:string, defenders:string[]):number { return defenders.reduce((v,t)=>v*(TYPE[attack]?.[t]??1),1) }
function bestMatchup(playerTypes:string[], enemyTypes:string[]):number { return playerTypes.length ? Math.max(...playerTypes.map((t)=>typeEffectiveness(t,enemyTypes))) : 1 }
function enemyPressure(enemy:HuntSpecies, playerTypes:string[]):number {
  const [,,enemyTypes,stats,level]=enemy
  const offense=Math.max(stats[1],stats[3])*Math.max(1,level)/100
  const effectiveness=enemyTypes.length ? Math.max(...enemyTypes.map((t)=>typeEffectiveness(t,playerTypes))) : 1
  return offense*effectiveness*1.8
}
function playerPower(profile:HuntProfile, matchup:number):number {
  const q=clamp(sane(profile.quality,1),.8,2)
  const baseAtk=sane(profile.baseStats[1],100)
  const baseSpAtk=sane(profile.baseStats[3],100)
  const atk=(baseAtk+2*clamp(profile.ivAtk,1,32))*profile.pokemonLevel/100*Math.pow(q,.8)
  const spa=(baseSpAtk+2*clamp(profile.ivSpAtk,1,32))*profile.pokemonLevel/100*Math.pow(q,.8)
  const birth=POTENCY[profile.potency]*(profile.shiny?3:1)
  return Math.max(atk,spa)*birth*1.5*matchup
}
function durability(profile:HuntProfile):number {
  const q=clamp(sane(profile.quality,1),.8,2)
  const hp=(sane(profile.baseStats[0],100)+2*clamp(profile.ivHp,1,32))*profile.pokemonLevel/100*Math.pow(q,.95)
  const def=(sane(profile.baseStats[2],100)+2*clamp(profile.ivDef,1,32))*profile.pokemonLevel/100*Math.pow(q,.8)
  const spDef=(sane(profile.baseStats[4],100)+2*clamp(profile.ivSpDef,1,32))*profile.pokemonLevel/100*Math.pow(q,.8)
  return Math.max(1,hp*(1+Math.max(def,spDef)/180))
}

export function rankHunts(data:HuntSpecies[], profile:HuntProfile, objective:HuntObjective='route'):HuntRecommendation[] {
  const unlocked=data.filter((row)=>row[4]<=profile.trainerLevel&&(REGION_UNLOCK[row[5]]??1)<=profile.trainerLevel)
  const tank=durability(profile)
  const rows=unlocked.map((enemy):HuntRecommendation=>{
    const [id,name,types,stats,level,region,explicitArea]=enemy
    const matchup=bestMatchup(profile.types,types)
    const power=playerPower(profile,matchup)
    const enemyHp=Math.max(1,(stats[0]+32)*level/100*5)
    const ttk=clamp(enemyHp/Math.max(1,power),.18,45)
    const incoming=enemyPressure(enemy,profile.types)
    const timeToDanger=incoming>0?tank/incoming*1.4:99
    const safety=clamp(Math.round((timeToDanger/Math.max(.3,ttk))*42),0,100)
    const cycle=Math.max(.8,5.2+ttk)
    const killsPerHour=Math.min(3600,3600/cycle)
    const perKill=xpPerKill(level)
    const xpHour=killsPerHour*perKill
    const safeFactor=.35+.65*(safety/100)
    const score=objective==='safe' ? safety*1_000_000+xpHour : objective==='xp' ? xpHour*safeFactor : xpHour*safeFactor*(.8+.2*clamp(matchup,.25,2))
    return { id,name,types,region,area:explicitArea||name,level,killsPerHour,xpPerKill:perKill,trainerXpPerHour:xpHour,pokemonXpPerHour:xpHour,safety,matchup,score,confidence:'MODELADO' }
  })
  return rows.sort((a,b)=>b.score-a.score||b.trainerXpPerHour-a.trainerXpPerHour||b.level-a.level)
}

export function buildRoute(data:HuntSpecies[], profile:HuntProfile, maxStages=6):RouteStage[] {
  const levels=[...new Set(data.map((row)=>Math.max(row[4],REGION_UNLOCK[row[5]]??1)))].filter((level)=>level>=profile.trainerLevel).sort((a,b)=>a-b)
  const checkpoints=[profile.trainerLevel,...levels].slice(0,160)
  const stages:RouteStage[]=[]
  let lastId=-1
  for(const trainerLevel of checkpoints){
    const best=rankHunts(data,{...profile,trainerLevel},'route')[0]
    if(!best||best.id===lastId) continue
    if(stages.length) stages[stages.length-1].toLevel=trainerLevel-1
    stages.push({fromLevel:trainerLevel,toLevel:null,hunt:best})
    lastId=best.id
    if(stages.length>=maxStages) break
  }
  return stages
}
