import { useEffect, useMemo, useState } from 'preact/hooks'
import type { AccountId, HuntProfileScan, HuntProtocolStatus } from '../../shared/contracts'
import { loadHuntSpecies, type HuntSpecies } from './hunt-data'
import { buildRoute, rankHunts, type HuntObjective, type HuntProfile } from './hunt-engine'

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
  const [objective, setObjective] = useState<HuntObjective>('route')

  useEffect(() => { void loadHuntSpecies().then(setData) }, [])

  const species = useMemo(() => {
    if (!serverProfile) return undefined
    if (serverProfile.speciesId !== undefined) {
      const byId = data.find((row) => row[0] === serverProfile.speciesId)
      if (byId) return byId
    }
    const serverName = serverProfile.speciesName?.trim().toLowerCase()
    return serverName ? data.find((row) => row[1].toLowerCase() === serverName) : undefined
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
    if (serverProfile?.ivAverage === undefined && serverProfile?.ivTotal === undefined) fields.push('IV')
    if (serverProfile?.shiny === undefined) fields.push('shiny')
    return fields
  }, [protocolStatus, serverProfile, species])

  const profile = useMemo<HuntProfile | null>(() => {
    if (!serverProfile || !species || missing.length) return null
    const iv = serverProfile.ivAverage ?? (serverProfile.ivTotal! / 6)
    return {
      trainerLevel: serverProfile.trainerLevel!,
      speciesId: species[0],
      pokemonLevel: serverProfile.pokemonLevel!,
      quality: serverProfile.quality!,
      potency: serverProfile.potency!,
      shiny: serverProfile.shiny!,
      ivAtk: iv,
      ivSpAtk: iv,
      ivDef: iv,
      ivSpDef: iv,
      ivHp: iv,
      types: species[2],
      baseStats: species[3]
    }
  }, [serverProfile, species, missing.join('|')])

  const ranking = useMemo(
    () => profile ? rankHunts(data, profile, objective).slice(0, 60) : [],
    [data, profile, objective]
  )
  const route = useMemo(() => profile ? buildRoute(data, profile, 6) : [], [data, profile])
  const best = ranking[0]
  const displayName = species?.[1] ?? serverProfile?.speciesName ?? (serverProfile?.speciesId !== undefined ? `Espécie #${serverProfile.speciesId}` : '—')
  const ivDisplay = serverProfile?.ivAverage ?? (serverProfile?.ivTotal !== undefined ? Number((serverProfile.ivTotal / 6).toFixed(2)) : undefined)
  const lastRead = serverProfile?.detectedAt ? new Date(serverProfile.detectedAt).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : null

  return <main class="hunt-page">
    <section class="hunt-header poke-card">
      <div class="hunt-title">
        <span class="hunt-title-icon">⚔</span>
        <div><h1>HUNT INTELLIGENCE</h1><p>Estado oficial da conta · WebSocket do PokeIdle · activeId exato</p></div>
      </div>
      <div class="hunt-objectives">
        {([['route','ROTA'],['xp','XP MÁX.'],['safe','SEGURO']] as Array<[HuntObjective,string]>).map(([key,label]) =>
          <button class={objective === key ? 'active' : ''} onClick={() => setObjective(key)} key={key}>{label}</button>
        )}
      </div>
    </section>

    <section class="hunt-profile poke-card">
      <div class="hunt-profile-head">
        <strong>POKÉMON ATIVO DO SERVIDOR · CONTA {accountId}</strong>
        <span class={protocolStatus === 'live' ? 'profile-ready' : 'profile-warn'}>
          {protocolStatus === 'live' ? `● SERVIDOR AO VIVO${lastRead ? ` · ${lastRead}` : ''}` : protocolStatus === 'unavailable' ? 'MONITOR DE SERVIDOR INDISPONÍVEL' : 'AGUARDANDO ESTADO DO SERVIDOR'}
        </span>
      </div>

      <div class="hunt-server-grid">
        <ServerField label="POKÉMON" value={displayName} />
        <ServerField label="ACTIVE ID" value={serverProfile?.activePokemonId ?? '—'} />
        <ServerField label="NV TREINADOR" value={formatValue(serverProfile?.trainerLevel)} />
        <ServerField label="NV POKÉMON" value={formatValue(serverProfile?.pokemonLevel)} />
        <ServerField label="QUALIDADE" value={formatValue(serverProfile?.quality, 3)} />
        <ServerField label="POTÊNCIA" value={serverProfile?.potency ? `P${serverProfile.potency}` : '—'} />
        <ServerField label="IV MÉDIO" value={formatValue(ivDisplay, 2)} />
        <ServerField label="SHINY" value={serverProfile?.shiny === undefined ? '—' : serverProfile.shiny ? 'SIM ×3' : 'NÃO'} />
      </div>

      <small class="hunt-auto-note">Fonte: pacotes <b>welcome/estado</b> recebidos pela própria sessão da conta. O Gridium usa somente o registro cujo ID é exatamente igual ao <b>activeId</b> enviado pelo servidor. Nenhum nome é lido da tela.</small>
      {protocolStatus === 'live' && !serverProfile && <small class="hunt-error">O servidor já está conectado, mas ainda não enviou o registro correspondente ao activeId. O Gridium não usa outro Pokémon como fallback.</small>}
      {protocolStatus === 'live' && serverProfile && missing.length > 0 && <small class="hunt-error">Aguardando o servidor fornecer: {missing.join(', ')}. A rota não será calculada com valores inventados.</small>}
      {serverProfile?.speciesId !== undefined && !species && <small class="hunt-error">A espécie #{serverProfile.speciesId} veio do servidor, mas não existe no banco Hunt local desta build.</small>}
    </section>

    {profile && best ? <>
      <section class="hunt-summary-grid">
        <Summary label="MELHOR AGORA" value={best.area} sub={`${best.name} · ${best.region} · Nv ${best.level}`} accent />
        <Summary label="XP/H PROJETADO" value={compact(best.trainerXpPerHour)} sub={`${compact(best.xpPerKill)} XP/abate`} />
        <Summary label="ABATES/H" value={Math.round(best.killsPerHour).toLocaleString('pt-BR')} sub={`matchup ×${best.matchup.toFixed(2)}`} />
        <Summary label="SEGURANÇA" value={`${best.safety}/100`} sub={best.safety >= 75 ? 'confortável' : best.safety >= 45 ? 'atenção' : 'alto risco'} />
      </section>

      <section class="hunt-route poke-card">
        <div class="hunt-section-title"><strong>ROTA DE PROGRESSÃO</strong><span>recalculada somente quando o estado ativo ou objetivo muda</span></div>
        <div class="route-track">{route.map((stage,index) =>
          <div class={`route-stage ${index === 0 ? 'current' : ''}`} key={`${stage.fromLevel}-${stage.hunt.id}`}>
            <small>{index === 0 ? 'AGORA' : `NV ${stage.fromLevel}`}</small><b>{stage.hunt.area}</b><span>{stage.hunt.name} · {compact(stage.hunt.trainerXpPerHour)} XP/h</span>
          </div>
        )}</div>
      </section>

      <section class="hunt-ranking poke-card">
        <div class="hunt-section-title"><strong>RANKING CALCULADO</strong><span>{ranking.length} melhores opções · estado ativo confirmado pelo servidor</span></div>
        <div class="hunt-table-wrap"><table class="hunt-table"><thead><tr><th>#</th><th>ÁREA / ALVO</th><th>REGIÃO</th><th>NÍVEL</th><th>ABATES/H</th><th>XP/ABATE</th><th>XP/H TREINADOR</th><th>XP/H POKÉMON</th><th>SEGURANÇA</th></tr></thead><tbody>
          {ranking.map((row,index) => <tr class={index === 0 ? 'best' : ''} key={row.id}>
            <td>{index+1}</td><td><b>{row.area}</b><small>{row.name} · {row.types.join(' / ')}</small></td><td><span class="region-chip">{row.region}</span></td>
            <td>{row.level.toLocaleString('pt-BR')}</td><td>{Math.round(row.killsPerHour).toLocaleString('pt-BR')}</td><td>{row.xpPerKill.toLocaleString('pt-BR')}</td>
            <td><strong>{compact(row.trainerXpPerHour)}</strong></td><td>{compact(row.pokemonXpPerHour)}</td><td><span class={`safety s${row.safety >= 75 ? 'good' : row.safety >= 45 ? 'mid' : 'bad'}`}>{row.safety}</span></td>
          </tr>)}
        </tbody></table></div>
      </section>
      <p class="hunt-disclaimer">Os dados do Pokémon ativo vêm do servidor; XP/h, abates/h, segurança e rota continuam sendo projeções do Gridium e podem variar por caminhada, spawn, buffs e comportamento real do servidor.</p>
    </> : <section class="hunt-empty poke-card"><b>{protocolStatus === 'unavailable' ? 'Monitor do servidor indisponível.' : 'Aguardando estado completo do Pokémon ativo.'}</b><span>Nenhuma rota é gerada a partir de nomes visíveis na tela ou valores padrão.</span></section>}
  </main>
}

function ServerField({ label, value }: { label: string; value: string }) {
  return <div class="hunt-server-field"><small>{label}</small><b>{value}</b></div>
}

function Summary({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return <div class={`hunt-summary poke-card ${accent ? 'accent' : ''}`}><small>{label}</small><b>{value}</b><span>{sub}</span></div>
}

function formatValue(value: number | undefined, maximumFractionDigits = 0): string {
  return value === undefined ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits })
}

function compact(value: number): string {
  const n = Math.round(value)
  if (n >= 1_000_000_000) return `${(n/1_000_000_000).toFixed(1).replace('.',',')} bi`
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1).replace('.',',')} mi`
  if (n >= 1_000) return `${(n/1_000).toFixed(1).replace('.',',')} mil`
  return n.toLocaleString('pt-BR')
}
