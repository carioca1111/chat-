import { describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import { FarmGoldAnalyticsTracker } from '../src/main/farm-gold-analytics-runtime'
import { PanelAnalyticsTracker, MAX_POKEMON_CACHE } from '../src/main/panel-analytics-runtime'
import { PokemonIdLedger } from '../src/main/pokemon-id-ledger'
import { PokeIdleServerState } from '../src/main/pokeidle-server-state'
import { CoalescedWriter } from '../src/main/coalesced-writer'

describe('long-running regression', () => {
  it('never materializes persistence on state events and retains full disk history', () => {
    const onPersist = vi.fn(), now = Date.now()
    const tracker = new FarmGoldAnalyticsTracker({ onPersist })
    const persisted = vi.spyOn(PanelAnalyticsTracker.prototype, 'persisted')
    tracker.ingestState({ gold: 0 }, true, now)
    for (let i = 1; i <= 1000; i++) tracker.ingestState({ gold: i }, false, now + i * 60000)
    expect(persisted).not.toHaveBeenCalled()
    expect(onPersist).toHaveBeenCalled()
    expect(tracker.snapshot(now + 1000 * 60000).historyMinute.length).toBeLessThanOrEqual(361)
    expect(tracker.persisted(now + 1000 * 60000).historyMinute).toHaveLength(1000)
    persisted.mockRestore()
  })

  it('coalesces changes during slow writes, retries failures and clears timers', async () => {
    vi.useFakeTimers()
    let complete!: () => void
    const write = vi.fn(() => new Promise<void>((resolve) => { complete = resolve }))
    const writer = new CoalescedWriter(write, 100)
    for (let i = 0; i < 10000; i++) writer.mark()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    for (let i = 0; i < 10000; i++) writer.mark()
    await vi.advanceTimersByTimeAsync(10000)
    expect(write).toHaveBeenCalledTimes(1)
    expect(writer.diagnostics().inFlight).toBe(1)
    complete(); await Promise.resolve(); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(100)
    expect(write).toHaveBeenCalledTimes(2)
    writer.stop(); complete(); await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)
    const retry = vi.fn().mockRejectedValueOnce(new Error('disk busy')).mockResolvedValue(undefined)
    const retryWriter = new CoalescedWriter(retry, 100)
    retryWriter.mark(); await vi.advanceTimersByTimeAsync(200)
    expect(retry).toHaveBeenCalledTimes(2)
    retryWriter.stop(); vi.useRealTimers()
  })

  it('stores widely spaced identities exactly in SQLite with bounded JS cache', () => {
    const ledger = new PokemonIdLedger(128), reference = new Set<string>()
    for (let i = 1; i <= 4000; i++) {
      const id = String(i * 1_000_003)
      ledger.add(id)
      reference.add(id)
    }
    for (const id of ['abc', '0001', '999999999999999999999999', 'pokemon-instance-x']) {
      ledger.add(id)
      reference.add(id)
    }
    for (const id of reference) expect(ledger.has(id)).toBe(true)
    expect(ledger.size).toBe(reference.size)
    expect(ledger.storageEntries).toBe(reference.size)
    expect(ledger.cacheEntries).toBeLessThanOrEqual(128)
    expect(ledger.cacheLimit).toBe(128)
    expect(ledger.has('10003')).toBe(false)
  }, 30000)

  it('keeps active Pokémon and never recounts an evicted inactive Pokémon', () => {
    const tracker = new PokeIdleServerState(), now = Date.now()
    tracker.ingest({ t: 'welcome', estado: { activeId: 1, pokemons: [{id:1, xp:0}] } }, now)
    for (let id = 2; id <= 25000; id++) tracker.ingest({t:'estado',estado:{pkMud:[{id,xp:0}]}},now+id)
    expect(tracker.diagnostics().pokemons).toBeLessThanOrEqual(MAX_POKEMON_CACHE)
    expect(tracker.diagnostics().pokemonXpState).toBeLessThanOrEqual(MAX_POKEMON_CACHE)
    const before = tracker.analytics().capturesTotal
    tracker.ingest({t:'estado',estado:{pkMud:[{id:2,xp:100}]}},now+30000)
    expect(tracker.analytics().capturesTotal).toBe(before)
    expect(tracker.profile()?.activePokemonId).toBe('1')
  })

  it('runs 3 x 100000 updates with 150000 packets and 30000 snapshots across 83 simulated hours', () => {
    const now = Date.now(), tracker = new FarmGoldAnalyticsTracker({onPersist:()=>{}})
    const samples: unknown[] = [], heaps: number[] = []
    tracker.ingestState({gold:0,pokemons:[]},true,now)
    for (let phase=0;phase<3;phase++) {
      const times:number[]=[]; const cpu=process.cpuUsage(); const start=performance.now()
      let snapshotBytes=0
      for (let i=1;i<=100000;i++) {
        const n=phase*100000+i, at=now+n*1000
        tracker.ingestState({gold:n,pkMud:[{id:n,xp:0}]},false,at)
        if(i%2===0) tracker.ingestPacket({t:'batalha',ev:[{k:'marketVendido',tipo:'pokemon',pokemonId:n,valor:1,moeda:'orb'}]},at)
        if(i%10===0) {const started=performance.now();const snap=tracker.snapshot(at);times.push(performance.now()-started);if(i===100000)snapshotBytes=Buffer.byteLength(JSON.stringify(snap))}
      }
      global.gc?.(); const memory=process.memoryUsage();heaps.push(memory.heapUsed)
      times.sort((a,b)=>a-b)
      const d=tracker.diagnostics()
      expect(d.pokemonXpState).toBeLessThanOrEqual(MAX_POKEMON_CACHE)
      expect(d.identityRanges).toBe(d.knownPokemonIds)
      expect(d.captureTimes).toBeLessThanOrEqual(3721)
      expect(d.historyMinute).toBeLessThanOrEqual(2882)
      expect(d.events).toBeLessThanOrEqual(60)
      expect(tracker.snapshot(now+(phase+1)*100000*1000).capturesTotal).toBe((phase+1)*100000)
      samples.push({phase,elapsedMs:performance.now()-start,memory,cpu:process.cpuUsage(cpu),diagnostics:d,snapshotBytes,snapshotMeanMs:times.reduce((a,b)=>a+b,0)/times.length,snapshotP95Ms:times[Math.floor(times.length*.95)],manualGc:typeof global.gc==='function'})
    }
    // The exact identity registry now lives in file-backed SQLite; only the
    // bounded LRU and active runtime structures should remain in JS heap.
    if (global.gc) expect(heaps[2] - heaps[1]).toBeLessThan(12 * 1024 * 1024)
    console.log('SOAK_METRICS',JSON.stringify(samples))
    if(process.env.GRIDIUM_SOAK_REPORT) writeFileSync('docs/performance/soak.json',JSON.stringify(samples,null,2))
  }, 120000)
})
