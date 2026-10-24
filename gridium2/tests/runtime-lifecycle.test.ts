import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AccountSnapshot, GridiumSnapshot } from '../src/shared/contracts'
const state = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.directory, getVersion: () => 'test' }, safeStorage: { isEncryptionAvailable: () => true, encryptString: (s:string) => Buffer.from(s), decryptString: (b:Buffer) => b.toString() } }))
import { MobileSyncRuntime } from '../src/main/mobile-sync'
import { SentinelRuntime, MAX_LEARNING_RECORDS } from '../src/main/sentinel-runtime'
import { PanelAnalyticsTracker } from '../src/main/panel-analytics-runtime'
const dirs:string[]=[]
function setup() { state.directory=mkdtempSync(join(tmpdir(),'gridium-lifecycle-'));dirs.push(state.directory) }
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true})})

describe('runtime lifecycle', () => {
  it('does no snapshot work disabled or busy and allows only one Mobile request', async () => {
    setup();vi.useFakeTimers()
    const provider=vi.fn(() => ({accounts:[],autoMarket:{accounts:[],catalog:[]},telemetry:{}} as unknown as GridiumSnapshot))
    let resolve!: (v:unknown)=>void
    const fetcher=vi.fn(()=>new Promise(r=>{resolve=r}))
    vi.stubGlobal('fetch',fetcher)
    const runtime=new MobileSyncRuntime(provider,()=>{})
    runtime.start();await vi.advanceTimersByTimeAsync(30000)
    expect(provider).not.toHaveBeenCalled()
    runtime.updateSettings({enabled:true,relayUrl:'http://localhost',privateToken:'local-test-only'})
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(provider).toHaveBeenCalledTimes(1)
    await runtime.createPairCode()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(runtime.diagnostics().requestsInFlight).toBe(1)
    resolve({ok:true,json:async()=>({})});await vi.advanceTimersByTimeAsync(0)
    expect(runtime.diagnostics().requestsInFlight).toBe(0)
    runtime.stop();expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps 200 newest learning records through 1000 hunt changes and restart', async () => {
    setup();vi.useFakeTimers();const now=Date.now()
    const account={id:1,status:'ready',huntProtocolStatus:'live',huntProfile:{huntSlug:'test',speciesId:1,activePokemonId:'1'},panelAnalytics:new PanelAnalyticsTracker().snapshot(now)} as AccountSnapshot
    const options={accountsProvider:()=>[account],lastServerAtProvider:()=>Date.now(),recoverAccount:async()=>true,onChanged:()=>{}}
    const runtime=new SentinelRuntime(options)
    for(let i=0;i<1000;i++) {
      account.huntProfile!.huntSlug=`hunt-${i}`
      runtime.start();await vi.advanceTimersByTimeAsync(30000)
      account.panelAnalytics.pokemonXpTotal+=100
      await vi.advanceTimersByTimeAsync(30000)
      runtime.stop()
      expect(vi.getTimerCount()).toBe(0)
      expect(runtime.diagnostics().learning).toBeLessThanOrEqual(MAX_LEARNING_RECORDS)
    }
    expect(runtime.diagnostics().learning).toBe(MAX_LEARNING_RECORDS)
    const restored=new SentinelRuntime(options)
    expect(restored.diagnostics().learning).toBe(MAX_LEARNING_RECORDS)
    restored.start();expect(restored.snapshot().accounts[0].huntLearning).toBeDefined();restored.stop()
  })
})
