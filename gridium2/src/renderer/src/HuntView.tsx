import { useEffect, useMemo, useState } from 'preact/hooks'
import type { AccountId, HuntProfileScan, HuntProtocolStatus } from '../../shared/contracts'
import { loadHuntSpecies, type HuntSpecies } from './hunt-data'
import { rankHunts, type HuntProfile, type RouteStage } from './hunt-engine'
import type { HuntRouteProjection } from './hunt-route-projection'
import type { HuntRouteWorkerResponse } from './hunt-route.worker'
import { buildPredictiveHuntCard, formatEtaCompact } from './hunt-predictive'
import { PokemonSprite } from './PokemonSprite'

const ROUTE_REFRESH_MS = 15_000

interface RouteState extends HuntRouteProjection {
  profileKey: string
  loading: boolean
  error?: string
}

const EMPTY_ROUTE_STATE: RouteState = {
  profileKey: '',
  route: [],
  baseRoute: [],
  loading: false
}

export function HuntView({
  accountId,
  serverProfile,
  protocolStatus
}: {
  accountId: AccountId
  serverProfile?: HuntProfileScan | null
  protocolStatus: HuntProtocolStatus
}) {
  const [data, setData] = useState<HuntSpecies[]>([])
  const [routeState, setRouteState] = useState<RouteState>(EMPTY_ROUTE_STATE)
  useEffect(() => { void loadHuntSpecies().then(setData) }, [])

  const species = useMemo(() => {
    if (!serverProfile) return undefined
    if (serverProfile.speciesId !== undefined) {
      const byId = data.find((row) => row[0] === serverProfile.speciesId)
      if (byId) return byId
    }
    const serverName = serverProfile.speciesName?.trim().toLowerCase()
    if (!serverName) return undefined
    const exact = data.find((row) => row[1].toLowerCase() === serverName)
    if (exact) return exact
    return data
      .filter((row) => serverName.endsWith(` ${row[1].toLowerCase()}`))
      .sort((a, b) => b[1].length - a[1].length)[0]
  }, [data, serverProfile?.speciesId, serverProfile?.speciesName])

  const missing = useMemo(() => {
    if (protocolStatus !== 'live') return []
    const fields: string[] = []
    if (!serverProfile?.activePokemonId) fields.push('activeId')
    if (!species) fields.push('espécie')
    if (serverProfile?.trainerLevel === undefined) fields.push('nível do treinador')
    if (serverProfile?.pokemonLevel === undefined) fields.push('nível do Pokémon')
    if (serverProfile?.quality === undefined) fields.push('qualidade')
    if (serverProfile?.potency === undefined) fields.push('potência')
    if (!serverProfile?.ivs && serverProfile?.ivAverage === undefined && serverProfile?.ivTotal === undefined) fields.push('IV')
    if (serverProfile?.shiny === undefined) fields.push('shiny')
    return fields
  }, [protocolStatus, serverProfile, species])

  const profile = useMemo<HuntProfile | null>(() => {
    if (!serverProfile || !species || missing.length) return null
    const avgIv = serverProfile.ivAverage ?? (serverProfile.ivTotal! / 6)
    const ivs = serverProfile.ivs ?? {}
    return {
      trainerLevel: serverProfile.trainerLevel!,
      trainerXp: serverProfile.trainerXp,
      trainerXpMultiplier: serverProfile.trainerXpMultiplier ?? 1,
      speciesId: species[0],
      pokemonLevel: serverProfile.pokemonLevel!,
      pokemonXp: serverProfile.pokemonXp,
      pokemonXpMultiplier: serverProfile.pokemonXpMultiplier ?? 1,
      quality: serverProfile.quality!,
      potency: serverProfile.potency!,
      shiny: serverProfile.shiny!,
      ivAtk: ivs.atk ?? avgIv,
      ivSpAtk: ivs.spAtk ?? avgIv,
      ivDef: ivs.def ?? avgIv,
      ivSpDef: ivs.spDef ?? avgIv,
      ivHp: ivs.hp ?? avgIv,
      ivSpeed: ivs.speed ?? avgIv,
      types: species[2],
      baseStats: species[3],
      stats: serverProfile.stats,
      refinement: serverProfile.refinement,
      tmElemental: serverProfile.tmElemental,
      tmAoe: serverProfile.tmAoe
    }
  }, [serverProfile, species, missing.join('|')])

  // `serverProfile` is refreshed frequently. This key contains only values that can
  // materially change the current Hunt ranking, so a new server object alone does
  // not force hundreds of combat calculations on the renderer thread.
  const profileKey = profile ? huntProfileKey(profile) : ''
  const ranking = useMemo(() => profile ? rankHunts(data, profile, 'route').slice(0, 30) : [], [data, profileKey])
  const best = ranking[0]

  // ETA can move with current XP, but recalculating the entire future route on every
  // server packet is wasteful. Refresh at most once per 15 s unless a material
  // profile value changes; the heavy work itself runs in a Web Worker.
  const routeRefreshBucket = Math.floor((serverProfile?.detectedAt ?? 0) / ROUTE_REFRESH_MS)
  const routeRequestKey = profile ? `${accountId}|${profileKey}|${routeRefreshBucket}` : ''

  useEffect(() => {
    if (!profile || !data.length || !routeRequestKey) {
      setRouteState(EMPTY_ROUTE_STATE)
      return
    }

    const worker = new Worker(new URL('./hunt-route.worker.ts', import.meta.url), { type: 'module' })
    const workerProfile: HuntProfile = {
      ...profile,
      trainerXp: serverProfile?.trainerXp,
      pokemonXp: serverProfile?.pokemonXp
    }

    setRouteState((current) => current.profileKey === profileKey
      ? { ...current, loading: true, error: undefined }
      : { profileKey, route: [], baseRoute: [], loading: true })

    worker.onmessage = (event: MessageEvent<HuntRouteWorkerResponse>) => {
      if (event.data.key !== routeRequestKey) return
      if (event.data.error || !event.data.projection) {
        setRouteState((current) => current.profileKey === profileKey
          ? { ...current, loading: false, error: event.data.error || 'Falha ao calcular a rota.' }
          : current)
        return
      }
      setRouteState({
        profileKey,
        route: event.data.projection.route,
        baseRoute: event.data.projection.baseRoute,
        loading: false
      })
    }
    worker.onerror = () => {
      setRouteState((current) => current.profileKey === profileKey
        ? { ...current, loading: false, error: 'Falha no cálculo paralelo da rota.' }
        : current)
    }
    worker.postMessage({ key: routeRequestKey, data, profile: workerProfile })

    return () => worker.terminate()
  }, [data, routeRequestKey])

  const route = routeState.profileKey === profileKey ? routeState.route : []
  const baseRoute = routeState.profileKey === profileKey ? routeState.baseRoute : []
  const routeLoading = routeState.profileKey === profileKey && routeState.loading
  const routeError = routeState.profileKey === profileKey ? routeState.error : undefined
  const next = route[1]
  const prediction = useMemo(
    () => profile && best && next ? buildPredictiveHuntCard(profile, best, route, baseRoute, serverProfile) : null,
    [profileKey, best?.key, route, baseRoute, serverProfile]
  )
  const displayName = species?.[1] ?? serverProfile?.speciesName ?? (serverProfile?.speciesId !== undefined ? `Espécie #${serverProfile.speciesId}` : '—')
  const lastRead = serverProfile?.detectedAt ? new Date(serverProfile.detectedAt).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : null

  return <main class="hunt-page">
    <section class="hunt-header poke-card">
      <div class="hunt-title">
        <span class="hunt-title-icon">⚔</span>
        <div><h1>HUNT INTELLIGENCE</h1><p>Rota por conta · foco exclusivo no XP do Pokémon · servidor ao vivo</p></div>
      </div>
      <div class="hunt-objectives"><button class="active" disabled>ROTA PERFEITA</button></div>
    </section>

    <section class="hunt-profile poke-card">
      <div class="hunt-profile-head">
        <strong>CONTA {accountId} · {displayName}</strong>
        <span class={protocolStatus === 'live' ? 'profile-ready' : 'profile-warn'}>
          {protocolStatus === 'live' ? `● SERVIDOR AO VIVO${lastRead ? ` · ${lastRead}` : ''}` : protocolStatus === 'unavailable' ? 'MONITOR DO SERVIDOR INDISPONÍVEL' : 'AGUARDANDO SERVIDOR'}
        </span>
      </div>
      <div class="hunt-route-identity hunt-route-identity-with-sprite">
        <PokemonSprite speciesId={species?.[0] ?? serverProfile?.speciesId} name={serverProfile?.speciesName ?? displayName} className="hunt-active-sprite" />
        <div class="hunt-route-identity-copy">
          <b>{displayName}</b>
          <div class="hunt-route-identity-tags">
            <span>Pokémon Nv {serverProfile?.pokemonLevel ?? '—'}</span>
            <span>Treinador Nv {serverProfile?.trainerLevel ?? '—'}</span>
            <span>P{serverProfile?.potency ?? '—'}</span>
            {serverProfile?.shiny && <span>✦ SHINY</span>}
          </div>
          {prediction && <div class="hunt-predictive-chips" aria-label="Previsão compacta da próxima Hunt">
            <span class="predict-next" title={`${prediction.lockedNow ? 'Hunt ainda bloqueada hoje. ' : ''}Próxima prevista: ${prediction.targetArea} · ${prediction.targetName} · ${prediction.targetRegion}. Troca projetada no treinador Nv ${prediction.trainerLevel}.`}>{prediction.lockedNow ? '🔒' : '↗'} NV {prediction.pokemonLevel}</span>
            <span title="ETA usando os multiplicadores de XP que o servidor informa neste momento.">ATUAL {formatEtaCompact(prediction.etaCurrentHours)}</span>
            <span title="ETA de referência removendo todos os multiplicadores de XP informados pelo servidor. O protocolo atual não separa com segurança evento, guilda, VIP e outros bônus.">BASE {formatEtaCompact(prediction.etaBaseHours)}</span>
            <span title={`XP/h do Pokémon projetado em ${prediction.targetArea} quando a troca ocorrer.`}>{compact(prediction.projectedXpPerHour)}/H</span>
            <span class={prediction.gainPercent >= 0 ? 'predict-gain' : 'predict-loss'} title="Ganho projetado de XP/h da próxima Hunt em relação à melhor Hunt de agora.">{formatSignedPercent(prediction.gainPercent)}</span>
            <span class="predict-confidence" title="Índice interno de confiança da previsão, calculado pela qualidade dos dados reais disponíveis e pela distância temporal da projeção. Não é probabilidade de sucesso.">CONF {prediction.confidencePercent}%</span>
          </div>}
        </div>
      </div>
      <small class="hunt-auto-note">activeId → registro exato do Pokémon. O Gridium usa IVs/stats/bônus por baixo do cálculo e mantém a tela focada apenas na decisão de rota.</small>
      {protocolStatus === 'live' && !serverProfile && <small class="hunt-error">O servidor está conectado, mas ainda não enviou o registro do Pokémon ativo.</small>}
      {protocolStatus === 'live' && serverProfile && missing.length > 0 && <small class="hunt-error">Aguardando o servidor fornecer: {missing.join(', ')}. Nenhum valor será inventado.</small>}
      {routeError && <small class="hunt-error">Rota futura: {routeError} O ranking atual continua disponível.</small>}
    </section>

    {profile && best ? <>
      <section class="hunt-summary-grid route-v2-summary">
        <Summary label="MELHOR AGORA" value={best.area} sub={`${best.name} · ${best.region} · Nv ${best.level}`} accent />
        <Summary label="XP/H DO POKÉMON" value={compact(best.pokemonXpPerHour)} sub={`${compact(best.pokemonXpPerKill)} XP do Pokémon por abate`} />
        <Summary
          label="PRÓXIMA TROCA"
          value={next ? `Nv ${next.fromPokemonLevel}` : routeLoading ? 'CALCULANDO…' : routeError ? 'INDISPONÍVEL' : 'MANTER'}
          sub={next ? `${next.hunt.area} · treinador Nv ${next.fromLevel}` : routeLoading ? 'projeção futura em segundo plano' : routeError ? 'ranking atual continua funcionando' : 'nenhuma troca vantajosa na projeção atual'}
        />
        <Summary label="SEGURANÇA" value={safetyLabel(best.safety)} sub={`${best.safety}/100`} />
        <Summary label="ABATES/H" value={Math.round(best.killsPerHour).toLocaleString('pt-BR')} sub="inclui tempo de deslocamento modelado" />
        <Summary label="PRECISÃO" value={best.confidence} sub={best.confidence === 'CALIBRADO' ? 'medição real desta conta/Hunt' : 'combate + deslocamento ainda modelados'} />
      </section>

      <section class="hunt-route poke-card">
        <div class="hunt-section-title"><strong>ROTA DE PROGRESSÃO</strong><span>troca somente quando outra Hunt supera a atual por margem relevante</span></div>
        <div class="route-track">{route.length ? route.map((stage,index) =>
          <div class={`route-stage ${index === 0 ? 'current' : ''}`} key={`${stage.fromLevel}-${stage.fromPokemonLevel}-${stage.hunt.key}`}>
            <PokemonSprite speciesId={stage.hunt.id} name={stage.hunt.name} className="hunt-route-sprite" />
            <div class="route-stage-copy">
              <small>{index === 0 ? 'AGORA' : `TROCAR · POKÉMON NV ${stage.fromPokemonLevel} · TREINADOR NV ${stage.fromLevel}`}</small>
              <b>{stage.hunt.area}</b>
              <span>{stage.hunt.name} · {compact(stage.hunt.pokemonXpPerHour)} XP/h do Pokémon</span>
              {index > 0 && <em>estimativa: {formatEta(stage.etaHours)}</em>}
            </div>
          </div>
        ) : <div class="route-stage current">
          <PokemonSprite speciesId={best.id} name={best.name} className="hunt-route-sprite" />
          <div class="route-stage-copy">
            <small>AGORA</small><b>{best.area}</b><span>{best.name} · {compact(best.pokemonXpPerHour)} XP/h do Pokémon</span>
            <em>{routeLoading ? 'calculando próximas trocas em segundo plano…' : routeError ? 'projeção futura indisponível' : 'nenhuma troca futura encontrada'}</em>
          </div>
        </div>}</div>
      </section>

      <section class="hunt-ranking poke-card">
        <div class="hunt-section-title"><strong>OUTRAS OPÇÕES AGORA</strong><span>XP/h do Pokémon com risco de desmaio penalizado</span></div>
        <div class="hunt-table-wrap"><table class="hunt-table route-v2-table"><thead><tr><th>#</th><th>HUNT / ALVO</th><th>REGIÃO</th><th>NÍVEL</th><th>XP/H DO POKÉMON</th></tr></thead><tbody>
          {ranking.map((row,index) => <tr class={index === 0 ? 'best' : ''} key={row.key}>
            <td>{index+1}</td><td><div class="hunt-target-cell"><PokemonSprite speciesId={row.id} name={row.name} className="hunt-table-sprite" /><div><b>{row.area}</b><small>{row.name}</small></div></div></td><td><span class="region-chip">{row.region}</span></td>
            <td>{row.level.toLocaleString('pt-BR')}</td><td><strong>{compact(row.pokemonXpPerHour)}</strong></td>
          </tr>)}
        </tbody></table></div>
      </section>
      <p class="hunt-disclaimer">XP por abate usa a curva atual medida no jogo (nível² + 12). O Pokémon ativo, IVs, stats, qualidade, potência, shiny, refino, bônus de XP e TM vêm do estado do servidor quando disponíveis. Golpes completos do Pokémon, rolagem exata do inimigo e ondas/deslocamento ainda não chegam completos em welcome/estado; por isso a precisão permanece ESTIMADO até existir amostra real suficiente. XP do treinador nunca é somado ao XP/h exibido.</p>
    </> : <section class="hunt-empty poke-card"><b>{protocolStatus === 'unavailable' ? 'Monitor do servidor indisponível.' : 'Aguardando estado completo do Pokémon ativo.'}</b><span>A rota só aparece quando o estado real da conta está completo.</span></section>}
  </main>
}

function huntProfileKey(profile: HuntProfile): string {
  const stats = profile.stats ?? {}
  const refinement = profile.refinement ?? {}
  return [
    profile.trainerLevel,
    profile.speciesId,
    profile.pokemonLevel,
    profile.quality,
    profile.potency,
    profile.shiny ? 1 : 0,
    profile.ivAtk,
    profile.ivSpAtk,
    profile.ivDef,
    profile.ivSpDef,
    profile.ivHp,
    profile.ivSpeed ?? '',
    profile.trainerXpMultiplier ?? 1,
    profile.pokemonXpMultiplier ?? 1,
    profile.tmElemental ?? '',
    profile.tmAoe ? 1 : 0,
    ...profile.types,
    ...(profile.baseStats ?? []),
    stats.hp ?? '', stats.atk ?? '', stats.def ?? '', stats.spAtk ?? '', stats.spDef ?? '', stats.speed ?? '',
    refinement.hp ?? '', refinement.atk ?? '', refinement.def ?? '', refinement.spAtk ?? '', refinement.spDef ?? '', refinement.speed ?? ''
  ].join('|')
}

function Summary({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return <div class={`hunt-summary poke-card ${accent ? 'accent' : ''}`}><small>{label}</small><b>{value}</b><span>{sub}</span></div>
}

function safetyLabel(value:number):string {
  if(value>=85) return 'ALTA'
  if(value>=65) return 'BOA'
  if(value>=45) return 'MÉDIA'
  return 'RISCO'
}

function formatEta(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return 'em breve'
  if (hours < 1) return `~${Math.max(1,Math.round(hours*60))} min`
  if (hours < 48) return `~${hours.toFixed(1).replace('.',',')} h`
  return `~${(hours/24).toFixed(1).replace('.',',')} dias`
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1).replace('.', ',')}%`
}

function compact(value: number): string {
  const n = Math.round(value)
  if (n >= 1_000_000_000) return `${(n/1_000_000_000).toFixed(1).replace('.',',')} bi`
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1).replace('.',',')} mi`
  if (n >= 1_000) return `${(n/1_000).toFixed(1).replace('.',',')} mil`
  return n.toLocaleString('pt-BR')
}
