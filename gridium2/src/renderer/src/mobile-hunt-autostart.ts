import type { AccountId, GridiumApi, GridiumSnapshot, HuntProfileScan } from '../../shared/contracts'
import { loadHuntSpecies, type HuntSpecies } from './hunt-data'
import type { MobileHuntWorkerResponse } from './mobile-hunt.worker'

type MobileGridiumApi = GridiumApi & {
  updateMobileHuntSummary: (accountId: AccountId, summary: unknown) => Promise<void>
}

let worker: Worker | null = null
let currentKey = ''
let data: HuntSpecies[] = []
const api = window.gridium2 as MobileGridiumApi

void loadHuntSpecies().then((rows) => {
  data = rows
  return api.getSnapshot()
}).then((snapshot) => refresh(snapshot)).catch(() => {})

api.onSnapshot((snapshot) => refresh(snapshot))

function refresh(snapshot: GridiumSnapshot): void {
  if (!data.length || !snapshot.accounts.length) return
  const key = snapshotKey(snapshot)
  if (key === currentKey) return
  currentKey = key

  worker?.terminate()
  worker = new Worker(new URL('./mobile-hunt.worker.ts', import.meta.url), { type: 'module' })
  const local = worker
  local.onmessage = (event: MessageEvent<MobileHuntWorkerResponse>) => {
    if (local !== worker || event.data.key !== currentKey) return
    void api.updateMobileHuntSummary(event.data.accountId, event.data.error ? { generatedAt: Date.now(), error: event.data.error } : event.data.summary ?? null)
  }

  const active = new Set<AccountId>()
  for (const account of snapshot.accounts) {
    const scan = account.huntProfile
    if (account.huntProtocolStatus !== 'live' || !scan) {
      void api.updateMobileHuntSummary(account.id, null)
      continue
    }
    active.add(account.id)
    local.postMessage({ key, accountId: account.id, data, scan })
  }
  for (const id of [1, 2, 3, 4] as AccountId[]) if (!active.has(id) && !snapshot.accounts.some((row) => row.id === id)) void api.updateMobileHuntSummary(id, null)
}

function snapshotKey(snapshot: GridiumSnapshot): string {
  const bucket = Math.floor(Date.now() / 60_000)
  return `${bucket}|${snapshot.accounts.map((account) => `${account.id}:${account.huntProtocolStatus}:${scanKey(account.huntProfile)}`).join('|')}`
}

function scanKey(scan: HuntProfileScan | null): string {
  if (!scan) return '-'
  const stats = scan.stats ?? {}
  const ivs = scan.ivs ?? {}
  const refinement = scan.refinement ?? {}
  return [
    scan.activePokemonId, scan.speciesId, scan.speciesName, scan.trainerLevel, scan.pokemonLevel,
    scan.quality, scan.potency, scan.shiny ? 1 : 0, scan.huntSlug,
    scan.trainerXpMultiplier, scan.pokemonXpMultiplier, scan.tmElemental, scan.tmAoe ? 1 : 0,
    ivs.hp, ivs.atk, ivs.def, ivs.spAtk, ivs.spDef, ivs.speed,
    stats.hp, stats.atk, stats.def, stats.spAtk, stats.spDef, stats.speed,
    refinement.hp, refinement.atk, refinement.def, refinement.spAtk, refinement.spDef, refinement.speed
  ].join(',')
}
