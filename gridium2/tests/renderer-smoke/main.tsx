import { render } from 'preact'
import { HuntView } from '../../src/renderer/src/HuntView'
import { loadHuntSpecies } from '../../src/renderer/src/hunt-data'
const scope = window as any
const workers = new Set<Worker>()
const NativeWorker = window.Worker
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) { super(url, options); workers.add(this) }
  terminate() { workers.delete(this); super.terminate() }
}
const listeners = new Set<Function>()
scope.gridium2 = { onSnapshot: (fn:Function) => {listeners.add(fn);return()=>listeners.delete(fn)}, getSnapshot: async()=>({accounts:[],mobileSync:{enabled:false}}), updateMobileHuntSummary: async()=>{} }
await import('../../src/renderer/src/mobile-hunt-autostart')
await loadHuntSpecies()
const profile = { source:'server' as const,detectedAt:Date.now(),activePokemonId:'1',speciesId:94,speciesName:'Gengar',trainerLevel:500,pokemonLevel:212,potency:4 as const,quality:1.72,ivTotal:171,shiny:false }
const pause = () => new Promise(resolve=>setTimeout(resolve,0))
scope.runLifecycle = async () => {
  const before={workers:workers.size,listeners:listeners.size}
  let maximumWorkers=0
  for(let i=0;i<1000;i++) {
    render(<HuntView accountId={1} serverProfile={{...profile,detectedAt:Date.now()+i*15000}} protocolStatus="live" />,document.getElementById('app')!)
    // Preact flushes passive effects after paint. Wait two frames for a real worker mount.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    maximumWorkers=Math.max(maximumWorkers,workers.size)
    render(null,document.getElementById('app')!)
    await pause()
    if(workers.size) throw new Error(`Worker leaked after cycle ${i}`)
  }
  const after={workers:workers.size,listeners:listeners.size}
  if(before.listeners!==after.listeners) throw new Error('Snapshot subscription leaked')
  if(maximumWorkers===0) throw new Error('Hunt worker was never created')
  return {cycles:1000,before,after,maximumWorkers}
}
scope.smokeReady=true
