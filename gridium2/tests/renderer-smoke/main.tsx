import { render } from 'preact'
import { PanelView } from '../../src/renderer/src/PanelView'
import '../../src/renderer/src/styles.css'
import '../../src/renderer/src/panel.css'
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

scope.checkPanelLayout = async (snapshot: any, itemCount: number) => {
  for (const account of snapshot.accounts) {
    account.panelAnalytics.rareItems = Array.from({ length: itemCount }, (_, i) => ({
      itemId: String(i), name: i === 0 ? 'Boss Token' : 'Rare Item ' + i, quantity: i + 1
    }))
  }
  render(<PanelView snapshot={snapshot} />, document.getElementById('app')!)
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const panel = document.querySelector('.panel-page') as HTMLElement
  const section = document.querySelector('.rare-counts') as HTMLElement
  const table = section.querySelector('table')!
  const bounds = section.getBoundingClientRect()
  const tableBounds = table.getBoundingClientRect()
  if (bounds.height < 150 || tableBounds.bottom > bounds.bottom) throw new Error('Rare item section collapsed')
  if (section.scrollHeight > section.clientHeight + 2) throw new Error('Rare item section has hidden vertical content')
  if (panel.scrollWidth > panel.clientWidth + 2) throw new Error('Panel overflows horizontally')
  const sections = [...panel.children] as HTMLElement[]
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].getBoundingClientRect().top < sections[i - 1].getBoundingClientRect().bottom) throw new Error('Panel sections overlap')
  }
  return { width: innerWidth, height: innerHeight, itemCount, sectionHeight: bounds.height, tableHeight: tableBounds.height }
}
