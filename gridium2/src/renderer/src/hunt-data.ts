import { HUNT_DATA_P1 } from './hunt-data-p1'
import { HUNT_DATA_P2 } from './hunt-data-p2'
import { HUNT_DATA_P3 } from './hunt-data-p3'
import { HUNT_DATA_P4 } from './hunt-data-p4'

export type HuntSpecies = [number, string, string[], number[], number, string, string]

// Generated from the current-server Pokédex supplied for Alpha 0.3.
// Shape: [id,name,types,[hp,atk,def,spAtk,spDef,speed],huntLevel,region,area]
export const HUNT_DATA_BASE64 = HUNT_DATA_P1 + HUNT_DATA_P2 + HUNT_DATA_P3 + HUNT_DATA_P4

let cache: Promise<HuntSpecies[]> | null = null

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function loadHuntSpecies(): Promise<HuntSpecies[]> {
  if (cache) return cache
  cache = (async () => {
    const stream = new Blob([decodeBase64(HUNT_DATA_BASE64).buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))
    const text = await new Response(stream).text()
    return JSON.parse(text) as HuntSpecies[]
  })()
  return cache
}
