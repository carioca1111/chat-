import { useEffect, useMemo, useState } from 'preact/hooks'
import type { AccountId, HuntProfileScan } from '../../shared/contracts'
import { loadHuntSpecies, type HuntSpecies } from './hunt-data'
import { buildRoute, rankHunts, type HuntObjective, type HuntProfile } from './hunt-engine'

interface StoredProfile {
  trainerLevel: number
  speciesName: string
  pokemonLevel: number
  quality: number
  potency: 1|2|3|4|5
  shiny: boolean
  iv: number
}

export function HuntView({ accountId }: { accountId: AccountId }) {
  const [data, setData] = useState<HuntSpecies[]>([])
  const [objective, setObjective] = useState<HuntObjective>('route')
  const [configured, setConfigured] = useState(false)
  const [scanStatus, setScanStatus] = useState<'idle'|'scanning'|'auto'|'failed'>('idle')
  const [trainerLevel, setTrainerLevel] = useState(1)
  const [speciesName, setSpeciesName] = useState('')
  const [pokemonLevel, setPokemonLevel] = useState(1)
  const [quality, setQuality] = useState(1)
  const [potency, setPotency] = useState<1|2|3|4|5>(1)
  const [shiny, setShiny] = useState(false)
  const [iv, setIv] = useState(16)

  useEffect(() => { void loadHuntSpecies().then(setData) }, [])

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(accountId))
    if (raw) {
      try {
        const x = JSON.parse(raw) as Partial<StoredProfile>
        setTrainerLevel(Number(x.trainerLevel) || 1)
        setSpeciesName(String(x.speciesName || ''))
        setPokemonLevel(Number(x.pokemonLevel) || 1)
        setQuality(Number(x.quality) || 1)
        setPotency(([1,2,3,4,5].includes(Number(x.potency)) ? Number(x.potency) : 1) as 1|2|3|4|5)
        setShiny(Boolean(x.shiny))
        setIv(Number(x.iv) || 16)
        setConfigured(Boolean(x.speciesName))
      } catch { setConfigured(false) }
    } else {
      setConfigured(false)
      setSpeciesName('')
    }
    const timer = window.setTimeout(() => { void scanAccount(false) }, 250)
    return () => window.clearTimeout(timer)
  }, [accountId])

  const species = useMemo(
    () => data.find((row) => row[1].toLowerCase() === speciesName.trim().toLowerCase()),
    [data, speciesName]
  )

  const profile = useMemo<HuntProfile | null>(() => species ? {
    trainerLevel: Math.max(1, trainerLevel),
    speciesId: species[0],
    pokemonLevel: Math.max(1, pokemonLevel),
    quality,
    potency,
    shiny,
    ivAtk: iv,
    ivSpAtk: iv,
    ivDef: iv,
    ivSpDef: iv,
    ivHp: iv,
    types: species[2]
  } : null, [species, trainerLevel, pokemonLevel, quality, potency, shiny, iv])

  const ranking = useMemo(
    () => profile ? rankHunts(data, profile, objective).slice(0, 60) : [],
    [data, profile, objective]
  )
  const route = useMemo(() => profile ? buildRoute(data, profile, 6) : [], [data, profile])

  function currentStored(): StoredProfile {
    return { trainerLevel, speciesName, pokemonLevel, quality, potency, shiny, iv }
  }

  function persist(next: StoredProfile): void {
    localStorage.setItem(storageKey(accountId), JSON.stringify(next))
  }

  function applyScan(scan: HuntProfileScan): void {
    const old = currentStored()
    const next: StoredProfile = {
      trainerLevel: scan.trainerLevel || old.trainerLevel,
      speciesName: scan.speciesName || old.speciesName,
      pokemonLevel: scan.pokemonLevel || old.pokemonLevel,
      quality: scan.quality || old.quality,
      potency: scan.potency || old.potency,
      shiny: old.shiny,
      iv: scan.ivTotal ? Math.max(1, Math.min(32, Number((scan.ivTotal / 6).toFixed(2)))) : old.iv
    }
    setTrainerLevel(next.trainerLevel)
    setSpeciesName(next.speciesName)
    setPokemonLevel(next.pokemonLevel)
    setQuality(next.quality)
    setPotency(next.potency)
    setShiny(next.shiny)
    setIv(next.iv)
    if (next.speciesName) {
      persist(next)
      setConfigured(true)
    }
  }

  async function scanAccount(showFailure = true): Promise<void> {
    setScanStatus('scanning')
    try {
      const scan = await window.gridium2.scanHuntProfile(accountId)
      if (!scan) { setScanStatus(showFailure ? 'failed' : 'idle'); return }
      applyScan(scan)
      setScanStatus('auto')
    } catch {
      setScanStatus(showFailure ? 'failed' : 'idle')
    }
  }

  function save(): void {
    if (!species) return
    const next = { ...currentStored(), speciesName: species[1] }
    persist(next)
    setSpeciesName(species[1])
    setConfigured(true)
    setScanStatus('idle')
  }

  const best = ranking[0]

  return <main class="hunt-page">
    <section class="hunt-header poke-card">
      <div class="hunt-title">
        <span class="hunt-title-icon">⚔</span>
        <div><h1>HUNT INTELLIGENCE</h1><p>Rota por conta · servidor atual · cálculo local e cacheado</p></div>
      </div>
      <div class="hunt-objectives">
        {([['route','ROTA'],['xp','XP MÁX.'],['safe','SEGURO']] as Array<[HuntObjective,string]>).map(([key,label]) =>
          <button class={objective === key ? 'active' : ''} onClick={() => setObjective(key)} key={key}>{label}</button>
        )}
      </div>
    </section>

    <section class="hunt-profile poke-card">
      <div class="hunt-profile-head">
        <strong>POKÉMON EM CAMPO · CONTA {accountId}</strong>
        <span class={configured ? 'profile-ready' : 'profile-warn'}>
          {scanStatus === 'scanning' ? 'LENDO CONTA…' : scanStatus === 'auto' ? '✓ LIDO DO JOGO' : configured ? '✓ PERFIL SALVO' : 'CONFIGURE UMA VEZ'}
        </span>
      </div>
      <div class="hunt-form">
        <label>ESPÉCIE<input list="hunt-species" value={speciesName} onInput={(e) => setSpeciesName(e.currentTarget.value)} placeholder="Ex.: Venusaur" /></label>
        <datalist id="hunt-species">{data.map((row) => <option value={row[1]} key={row[0]} />)}</datalist>
        <label>NV TREINADOR<input type="number" min="1" value={trainerLevel} onInput={(e) => setTrainerLevel(Number(e.currentTarget.value))} /></label>
        <label>NV POKÉMON<input type="number" min="1" value={pokemonLevel} onInput={(e) => setPokemonLevel(Number(e.currentTarget.value))} /></label>
        <label>QUALIDADE<input type="number" min="0.8" max="2" step="0.001" value={quality} onInput={(e) => setQuality(Number(e.currentTarget.value))} /></label>
        <label>POTÊNCIA<select value={potency} onChange={(e) => setPotency(Number(e.currentTarget.value) as 1|2|3|4|5)}>{[1,2,3,4,5].map((x) => <option value={x} key={x}>P{x}</option>)}</select></label>
        <label>IV MÉDIO<input type="number" min="1" max="32" step="0.01" value={iv} onInput={(e) => setIv(Number(e.currentTarget.value))} /></label>
        <label class="hunt-shiny"><input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.currentTarget.checked)} /> SHINY ×3</label>
        <div class="hunt-form-actions">
          <button class="hunt-read" onClick={() => void scanAccount(true)} disabled={scanStatus === 'scanning'}>LER CONTA</button>
          <button class="hunt-save" disabled={!species} onClick={save}>ANALISAR</button>
        </div>
      </div>
      {scanStatus === 'failed' && <small class="hunt-error">Não consegui ler os dados visíveis desta conta. O preenchimento manual continua disponível.</small>}
      {!species && speciesName && <small class="hunt-error">Espécie não encontrada na Pokédex deste servidor.</small>}
    </section>

    {profile && best ? <>
      <section class="hunt-summary-grid">
        <Summary label="MELHOR AGORA" value={best.area} sub={`${best.name} · ${best.region} · Nv ${best.level}`} accent />
        <Summary label="XP/H PROJETADO" value={compact(best.trainerXpPerHour)} sub={`${compact(best.xpPerKill)} XP/abate`} />
        <Summary label="ABATES/H" value={Math.round(best.killsPerHour).toLocaleString('pt-BR')} sub={`matchup ×${best.matchup.toFixed(2)}`} />
        <Summary label="SEGURANÇA" value={`${best.safety}/100`} sub={best.safety >= 75 ? 'confortável' : best.safety >= 45 ? 'atenção' : 'alto risco'} />
      </section>

      <section class="hunt-route poke-card">
        <div class="hunt-section-title"><strong>ROTA DE PROGRESSÃO</strong><span>o Gridium troca a recomendação quando outra hunt supera a atual</span></div>
        <div class="route-track">{route.map((stage,index) =>
          <div class={`route-stage ${index === 0 ? 'current' : ''}`} key={`${stage.fromLevel}-${stage.hunt.id}`}>
            <small>{index === 0 ? 'AGORA' : `NV ${stage.fromLevel}`}</small><b>{stage.hunt.area}</b><span>{stage.hunt.name} · {compact(stage.hunt.trainerXpPerHour)} XP/h</span>
          </div>
        )}</div>
      </section>

      <section class="hunt-ranking poke-card">
        <div class="hunt-section-title"><strong>RANKING CALCULADO</strong><span>{ranking.length} melhores opções · sem cálculo por frame</span></div>
        <div class="hunt-table-wrap"><table class="hunt-table"><thead><tr><th>#</th><th>ÁREA / ALVO</th><th>REGIÃO</th><th>NÍVEL</th><th>ABATES/H</th><th>XP/ABATE</th><th>XP/H TREINADOR</th><th>XP/H POKÉMON</th><th>SEGURANÇA</th></tr></thead><tbody>
          {ranking.map((row,index) => <tr class={index === 0 ? 'best' : ''} key={row.id}>
            <td>{index+1}</td><td><b>{row.area}</b><small>{row.name} · {row.types.join(' / ')}</small></td><td><span class="region-chip">{row.region}</span></td>
            <td>{row.level.toLocaleString('pt-BR')}</td><td>{Math.round(row.killsPerHour).toLocaleString('pt-BR')}</td><td>{row.xpPerKill.toLocaleString('pt-BR')}</td>
            <td><strong>{compact(row.trainerXpPerHour)}</strong></td><td>{compact(row.pokemonXpPerHour)}</td><td><span class={`safety s${row.safety >= 75 ? 'good' : row.safety >= 45 ? 'mid' : 'bad'}`}>{row.safety}</span></td>
          </tr>)}
        </tbody></table></div>
      </section>
      <p class="hunt-disclaimer">MODELADO = projeção. Caminhada, spawn, desmaios, buffs e comportamento real do servidor podem mudar o resultado. O Gridium separa projeção de dado medido para não mostrar precisão falsa.</p>
    </> : <section class="hunt-empty poke-card"><b>Configure o Pokémon para montar a rota.</b><span>Use “LER CONTA” ou informe os dados manualmente.</span></section>}
  </main>
}

const storageKey = (accountId: AccountId): string => `gridium2:hunt-profile:${accountId}`

function Summary({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return <div class={`hunt-summary poke-card ${accent ? 'accent' : ''}`}><small>{label}</small><b>{value}</b><span>{sub}</span></div>
}

function compact(value: number): string {
  const n = Math.round(value)
  if (n >= 1_000_000_000) return `${(n/1_000_000_000).toFixed(1).replace('.',',')} bi`
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1).replace('.',',')} mi`
  if (n >= 1_000) return `${(n/1_000).toFixed(1).replace('.',',')} mil`
  return n.toLocaleString('pt-BR')
}
