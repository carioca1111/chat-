import { useEffect, useMemo, useState } from 'preact/hooks'
import type { AccountId, GridiumSnapshot, PokemonWorthSnapshot } from '../../shared/contracts'
import { comparePokemonWorth, parsePokemonFicha, pokemonWorthLabel, WORTH_STAT_KEYS, type WorthStatKey } from '../../shared/worth-it'
import type { WorthDecisionContext, WorthDecisionResult } from './worth-it-decision'
import { PokemonSprite } from './PokemonSprite'

type SourceMode = 'account' | 'paste'
type PriceCurrency = 'gems' | 'gold'
interface SideState {
  mode: SourceMode
  accountId: AccountId
  query: string
  results: PokemonWorthSnapshot[]
  selected: PokemonWorthSnapshot | null
  pasted: string
  pasteError: string
  loading: boolean
}
interface DecisionState {
  key: string
  loading: boolean
  result: WorthDecisionResult | null
  error?: string
}

const STAT_LABEL: Record<WorthStatKey, string> = { hp: 'HP', atk: 'ATK', def: 'DEF', spAtk: 'SP.ATK', spDef: 'SP.DEF', speed: 'SPD' }
const emptySide = (accountId: AccountId): SideState => ({ mode: 'account', accountId, query: '', results: [], selected: null, pasted: '', pasteError: '', loading: false })
const EMPTY_DECISION: DecisionState = { key: '', loading: false, result: null }

export function WorthItPanel({ snapshot }: { snapshot: GridiumSnapshot }) {
  const [left, setLeft] = useState<SideState>(() => emptySide(snapshot.selectedAccount))
  const [right, setRight] = useState<SideState>(() => emptySide(snapshot.selectedAccount))
  const [targetLevel, setTargetLevel] = useState(1000)
  const [price, setPrice] = useState('')
  const [priceCurrency, setPriceCurrency] = useState<PriceCurrency>('gems')
  const [decision, setDecision] = useState<DecisionState>(EMPTY_DECISION)

  useEffect(() => { void loadRoster(left, setLeft) }, [left.accountId, left.query, left.mode])
  useEffect(() => { void loadRoster(right, setRight) }, [right.accountId, right.query, right.mode])

  const recommendedLevel = Math.max(1, Math.round(Math.max(left.selected?.level ?? 1, right.selected?.level ?? 1)))
  useEffect(() => {
    if (left.selected && right.selected && targetLevel === 1000 && recommendedLevel > 1000) setTargetLevel(recommendedLevel)
  }, [left.selected?.instanceId, right.selected?.instanceId])

  const comparison = useMemo(() => comparePokemonWorth(left.selected, right.selected, targetLevel), [left.selected, right.selected, targetLevel])
  const maxStat = Math.max(1, ...WORTH_STAT_KEYS.flatMap((key) => [comparison.left.stats[key] ?? 0, comparison.right.stats[key] ?? 0]))
  const trainerContext = decisionTrainerContext(snapshot, left.selected, right.selected)
  const decisionKey = useMemo(() => left.selected && right.selected
    ? `${trainerContext.trainerLevel}|${pokemonDecisionSignature(left.selected)}|${pokemonDecisionSignature(right.selected)}`
    : '', [left.selected, right.selected, trainerContext.trainerLevel, trainerContext.estimatedTrainerLevel])

  useEffect(() => {
    if (!decisionKey || !left.selected || !right.selected) {
      setDecision(EMPTY_DECISION)
      return
    }
    const worker = new Worker(new URL('./worth-it.worker.ts', import.meta.url), { type: 'module' })
    setDecision({ key: decisionKey, loading: true, result: null })
    worker.onmessage = (event: MessageEvent<{ key: string; result?: WorthDecisionResult; error?: string }>) => {
      if (event.data.key !== decisionKey) return
      if (event.data.error || !event.data.result) {
        setDecision({ key: decisionKey, loading: false, result: null, error: event.data.error || 'Falha ao calcular.' })
        return
      }
      setDecision({ key: decisionKey, loading: false, result: event.data.result })
    }
    worker.onerror = () => setDecision({ key: decisionKey, loading: false, result: null, error: 'Falha no cálculo paralelo do Vale a Pena.' })
    worker.postMessage({ key: decisionKey, own: left.selected, candidate: right.selected, context: trainerContext })
    return () => worker.terminate()
  }, [decisionKey])

  const swap = (): void => { const a = left; setLeft(right); setRight(a) }

  return <main class="worth-page poke-frame">
    <section class="worth-head">
      <div><small>GRIDIIUM LAB</small><h1>⚖ VALE A PENA?</h1><p>Pokémon A é o seu atual; Pokémon B é o candidato. Além dos stats, o Gridium agora simula XP/h, empate, retorno e a rota do candidato sem bônus.</p></div>
      <label class="worth-level"><span>NÍVEL DA COMPARAÇÃO DE STATS</span><input type="number" min="1" max="10000" value={targetLevel} onInput={(event) => setTargetLevel(clampLevel(event.currentTarget.value))} /><button onClick={() => setTargetLevel(recommendedLevel)}>NÍVEL MAIS ALTO</button></label>
    </section>

    <section class="worth-pickers">
      <PokemonPicker side="A" state={left} setState={setLeft} accounts={snapshot.accounts.map((account) => account.id)} />
      <button class="worth-swap" title="Trocar lados" onClick={swap}>⇄</button>
      <PokemonPicker side="B" state={right} setState={setRight} accounts={snapshot.accounts.map((account) => account.id)} />
    </section>

    <DecisionPanel
      state={decision}
      own={left.selected}
      candidate={right.selected}
      price={price}
      setPrice={setPrice}
      priceCurrency={priceCurrency}
      setPriceCurrency={setPriceCurrency}
    />

    <div class="worth-section-title">COMPARAÇÃO TÉCNICA DE STATS</div>
    <section class={`worth-verdict ${comparison.verdict}`}>
      <span class="worth-verdict-icon">{comparison.verdict === 'insufficient' ? '?' : comparison.verdict === 'tie' ? '≈' : comparison.verdict === 'left' ? '←' : '→'}</span>
      <div><small>RESULTADO NO NÍVEL {comparison.targetLevel}</small><b>{verdictTitle(comparison.verdict, left.selected, right.selected)}</b><p>{verdictDetail(comparison)}</p></div>
      {comparison.differencePercent !== null && <strong>{Math.abs(comparison.differencePercent).toFixed(1).replace('.', ',')}%</strong>}
    </section>

    <section class="worth-comparison">
      <PokemonSummary pokemon={left.selected} projectionTotal={comparison.left.total} side="A" />
      <div class="worth-stat-table">
        <div class="worth-stat-head"><span>{shortName(left.selected)}</span><b>MESMO NÍVEL</b><span>{shortName(right.selected)}</span></div>
        {WORTH_STAT_KEYS.map((key) => {
          const a = comparison.left.stats[key]
          const b = comparison.right.stats[key]
          const winner = a === undefined || b === undefined ? '' : Math.abs(a-b) <= Math.max(1, Math.max(a,b)*.001) ? 'tie' : a > b ? 'left' : 'right'
          return <div class={`worth-stat-row ${winner}`} key={key}>
            <span class="worth-stat-a"><b>{fmtStat(a)}</b><i style={{ width: `${Math.min(100, ((a ?? 0) / maxStat) * 100)}%` }} /></span>
            <small>{STAT_LABEL[key]}</small>
            <span class="worth-stat-b"><b>{fmtStat(b)}</b><i style={{ width: `${Math.min(100, ((b ?? 0) / maxStat) * 100)}%` }} /></span>
          </div>
        })}
        <div class="worth-total-row"><span>{fmtStat(comparison.left.total || undefined)}</span><b>TOTAL DE STATS</b><span>{fmtStat(comparison.right.total || undefined)}</span></div>
        <div class="worth-wins"><span>A vence {comparison.leftWins}</span><span>{comparison.ties} empates</span><span>B vence {comparison.rightWins}</span></div>
      </div>
      <PokemonSummary pokemon={right.selected} projectionTotal={comparison.right.total} side="B" />
    </section>

    <section class="worth-rules">
      <b>COMO ESTOU COMPARANDO</b>
      <span>XP/h/rota usam o mesmo motor da HUNT Intelligence, com o nível do treinador da conta A e bônus desligados para comparação justa.</span>
      <span>Stats atuais são projetados linearmente. Se faltarem, uso: (base + refino + 2×IV) × nível/100 × qualidade^expoente × potência × shiny × lendário.</span>
      <span>Qualidade: HP/SPD ^0,95 · demais ^0,8 · P1×1 · P2×1,05 · P3×1,1 · P4×1,25 · P5×2 · shiny×3 · lendário/mítico×4.</span>
      <em>A ficha colada é processada localmente e não é salva.</em>
    </section>
  </main>
}

function DecisionPanel({
  state, own, candidate, price, setPrice, priceCurrency, setPriceCurrency
}: {
  state: DecisionState
  own: PokemonWorthSnapshot | null
  candidate: PokemonWorthSnapshot | null
  price: string
  setPrice: (value: string) => void
  priceCurrency: PriceCurrency
  setPriceCurrency: (value: PriceCurrency) => void
}) {
  if (!own || !candidate) return <section class="worth-decision"><div class="worth-decision-loading">Escolha o Pokémon A (seu atual) e o Pokémon B (candidato) para liberar XP/h, empate, retorno e rota.</div></section>
  if (state.loading) return <section class="worth-decision"><div class="worth-decision-loading">Calculando Hunts, XP/h e rota do candidato em segundo plano…</div></section>
  if (state.error) return <section class="worth-decision"><div class="worth-decision-error">{state.error}</div></section>
  const result = state.result
  if (!result) return <section class="worth-decision"><div class="worth-decision-loading">Preparando análise…</div></section>
  if (!result.available) return <section class="worth-decision"><div class="worth-decision-error">{result.reason || 'Dados insuficientes.'}</div></section>

  const gain = result.gainPercentAtOwnLevel ?? 0
  const candidateName = candidate.speciesName || `Espécie #${candidate.speciesId ?? '?'}`
  const ownName = own.speciesName || `Espécie #${own.speciesId ?? '?'}`
  const priceValue = parsePrice(price)
  const gainXp = Math.max(0, (result.candidateAtOwnLevelXpPerHour ?? 0) - (result.ownXpPerHour ?? 0))
  const priceEfficiency = priceValue && gainXp > 0
    ? priceCurrency === 'gems'
      ? gainXp / priceValue
      : gainXp / (priceValue / 1_000_000)
    : null

  return <section class="worth-decision">
    <div class={`worth-buy-banner ${result.verdict}`}>
      <div class="worth-buy-score">{(result.score ?? 0).toFixed(1).replace('.', ',')}<small>/10</small></div>
      <div class="worth-buy-copy">
        <h2>{result.verdictTitle}</h2>
        <p>No nível {result.ownLevel}, {candidateName} faria <b>{formatXp(result.candidateAtOwnLevelXpPerHour)}</b> XP/h contra <b>{formatXp(result.ownXpPerHour)}</b> do seu {ownName}: <strong class={gain >= 0 ? 'gain' : 'loss'}>{signedPercent(gain)}</strong>.</p>
      </div>
    </div>

    <div class="worth-score-note"><b>Índice Gridium:</b> combina ganho de XP/h, desvantagem atual e tempo de retorno. O 10/10 baseado no melhor Pokémon vendido em 30 dias, mostrado no site de referência, exige histórico global do Mercado; enquanto essa fonte não estiver conectada ao Gridium, essa parte não é inventada.</div>

    <div class="worth-decision-metrics">
      <DecisionMetric label="XP/H HOJE" value={`${formatXp(result.ownXpPerHour)} seu`} sub={`${formatXp(result.candidateXpPerHour)} do candidato no Nv ${result.candidateLevel}`} />
      <DecisionMetric label="NÍVEL DE EMPATE" value={result.breakEvenLevel !== null ? `Nv ${result.breakEvenLevel}` : 'NÃO EMPATA'} sub={result.breakEvenHours !== null ? `em ${formatDuration(result.breakEvenHours)} de caça` : `até o seu Nv ${result.ownLevel}`} />
      <DecisionMetric label={`NO SEU NÍVEL (${result.ownLevel})`} value={`${formatXp(result.candidateAtOwnLevelXpPerHour)} XP/h`} sub={signedPercent(gain)} accent={gain >= 0 ? 'gain' : 'loss'} />
      <DecisionMetric label="ATÉ O SEU NÍVEL" value={result.timeToOwnLevelHours !== null ? formatDuration(result.timeToOwnLevelHours) : '—'} sub="de caça, sem bônus" />
      <DecisionMetric label="TEMPO DE RETORNO" value={result.returnAfterBreakEvenHours !== null ? formatDuration(result.returnAfterBreakEvenHours) : 'SEM RETORNO'} sub={result.lostXpAtBreakEven !== null ? `para recuperar ${formatXp(result.lostXpAtBreakEven)} XP perdidos até o empate` : 'o candidato não alcança o XP/h atual'} />
      <article class="worth-decision-card">
        <small>POR UNIDADE DE PREÇO</small>
        <div class="worth-price-box"><input value={price} inputMode="decimal" placeholder="preço do anúncio" onInput={(event) => setPrice(event.currentTarget.value)} /><select value={priceCurrency} onChange={(event) => setPriceCurrency(event.currentTarget.value as PriceCurrency)}><option value="gems">GEMAS</option><option value="gold">OURO</option></select></div>
        <strong>{priceEfficiency !== null ? formatXp(priceEfficiency) : '—'}</strong>
        <span class="worth-price-result">{priceEfficiency !== null ? priceCurrency === 'gems' ? 'XP/h ganho por gema' : 'XP/h ganho por 1 mi de ouro' : 'informe o preço do anúncio'}</span>
      </article>
    </div>

    <div class="worth-market-strip"><b>Mercado (30 dias):</b> <em>histórico global ainda não conectado ao Gridium.</em> O preço manual acima já entra no custo-benefício. Vendas, melhor nota, nota mediana e preço típico só aparecerão quando houver uma fonte real de vendas — sem estimar números.</div>

    <section class="worth-route-decision">
      <h3>A ROTA DO CANDIDATO ATÉ O SEU NÍVEL</h3>
      {result.route.length ? <div class="worth-route-table">
        <div class="worth-route-head"><span>HUNT</span><span>NÍVEIS</span><span>XP/H</span><span>TEMPO</span></div>
        {result.route.map((stage) => {
          const breakHere = result.breakEvenLevel !== null && result.breakEvenLevel >= stage.fromLevel && result.breakEvenLevel <= stage.toLevel
          return <div class="worth-route-row" key={`${stage.key}:${stage.fromLevel}`}>
            <div class="worth-route-hunt"><PokemonSprite speciesId={stage.speciesId} name={stage.huntName} className="worth-route-sprite" /><div><b>{stage.area || stage.huntName}</b><span>Nv {stage.huntLevel} <i class="worth-region-badge">{stage.region.toUpperCase()}</i></span></div></div>
            <div class="worth-route-levels"><b>Nv {stage.fromLevel} → {stage.toLevel}</b>{breakHere && <span class="worth-break-even">empata aqui</span>}</div>
            <div class="worth-route-xp"><b>{formatXp(stage.startXpPerHour)} → {formatXp(stage.endXpPerHour)}</b></div>
            <div class="worth-route-time"><b>{formatDuration(stage.hours)}</b></div>
          </div>
        })}
      </div> : <div class="worth-route-empty">{(result.candidateLevel ?? 0) >= (result.ownLevel ?? 0) ? 'O candidato já está no mesmo nível ou acima do seu Pokémon.' : 'Nenhuma rota válida foi encontrada com os dados disponíveis.'}</div>}
    </section>
    <small class="worth-decision-source">Treinador Nv {result.trainerLevel}{result.estimatedTrainerLevel ? ' (estimado por falta de leitura do servidor)' : ' (lido da conta A)'} · bônus de XP desligados nesta análise.</small>
  </section>
}

function DecisionMetric({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: 'gain' | 'loss' }) {
  return <article class="worth-decision-card"><small>{label}</small><strong class={accent || ''}>{value}</strong><span class={accent || ''}>{sub}</span></article>
}

function PokemonPicker({ side, state, setState, accounts }: { side: string; state: SideState; setState: (value: SideState | ((current: SideState) => SideState)) => void; accounts: AccountId[] }) {
  const usePaste = (): void => setState((current) => ({ ...current, mode: current.mode === 'account' ? 'paste' : 'account', pasteError: '' }))
  const parsePaste = (): void => {
    const parsed = parsePokemonFicha(state.pasted)
    if (!parsed) { setState((current) => ({ ...current, pasteError: 'Não consegui reconhecer essa ficha. Cole o texto completo do Pokémon.' })); return }
    setState((current) => ({ ...current, selected: parsed, pasteError: '', mode: 'paste' }))
  }
  return <article class={`worth-picker side-${side.toLowerCase()}`}>
    <header><span>POKÉMON {side} {side === 'A' ? '· SEU ATUAL' : '· CANDIDATO'}</span><div><button class={state.mode === 'account' ? 'active' : ''} onClick={() => setState((current) => ({ ...current, mode: 'account' }))}>DA CONTA</button><button class={state.mode === 'paste' ? 'active' : ''} onClick={usePaste}>COLAR FICHA</button></div></header>
    {state.mode === 'account' ? <>
      <div class="worth-account-line"><label>CONTA<select value={state.accountId} onChange={(event) => setState((current) => ({ ...current, accountId: Number(event.currentTarget.value) as AccountId, selected: null, results: [] }))}>{accounts.map((id) => <option value={id} key={id}>Conta {id}</option>)}</select></label><label class="worth-search">BUSCAR<input value={state.query} placeholder="nome, espécie ou ID" onInput={(event) => setState((current) => ({ ...current, query: event.currentTarget.value }))} /></label></div>
      <div class="worth-roster">{state.loading ? <div class="worth-empty">Buscando Pokémon…</div> : state.results.length ? state.results.map((pokemon) => <button class={state.selected?.instanceId === pokemon.instanceId ? 'selected' : ''} onClick={() => setState((current) => ({ ...current, selected: pokemon }))} key={pokemon.instanceId}><PokemonSprite speciesId={pokemon.speciesId} name={pokemon.speciesName || 'Pokémon'} className="worth-result-sprite" /><span><b>{pokemon.speciesName || `Espécie #${pokemon.speciesId ?? '?'}`}{pokemon.shiny ? ' ✦' : ''}</b><small>{pokemonWorthLabel(pokemon)} · ID {pokemon.instanceId}</small></span></button>) : <div class="worth-empty">Nenhum Pokémon carregado. Entre na conta e aguarde o estado do servidor.</div>}</div>
    </> : <div class="worth-paste"><textarea value={state.pasted} placeholder="# Venusaur — ficha do PokeIdle…" onInput={(event) => setState((current) => ({ ...current, pasted: event.currentTarget.value, pasteError: '' }))} /><button onClick={parsePaste}>✓ USAR ESTA FICHA</button>{state.pasteError && <small>{state.pasteError}</small>}</div>}
    <SelectedMini pokemon={state.selected} />
  </article>
}

async function loadRoster(state: SideState, setState: (value: SideState | ((current: SideState) => SideState)) => void): Promise<void> {
  if (state.mode !== 'account') return
  const accountId = state.accountId
  const query = state.query
  setState((current) => current.accountId === accountId && current.query === query ? { ...current, loading: true } : current)
  await new Promise<void>((resolve) => setTimeout(resolve, 140))
  try {
    const rows = await window.gridium2.searchPokemonRoster(accountId, query)
    setState((current) => current.mode === 'account' && current.accountId === accountId && current.query === query ? { ...current, results: rows, loading: false } : current)
  } catch {
    setState((current) => current.accountId === accountId && current.query === query ? { ...current, results: [], loading: false } : current)
  }
}

function SelectedMini({ pokemon }: { pokemon: PokemonWorthSnapshot | null }) {
  if (!pokemon) return <div class="worth-selected empty"><span>SELECIONE UM POKÉMON</span></div>
  return <div class="worth-selected"><PokemonSprite speciesId={pokemon.speciesId} name={pokemon.speciesName || 'Pokémon'} className="worth-selected-sprite" /><div><small>{pokemon.source === 'external' ? 'FICHA EXTERNA' : `CONTA ${pokemon.accountId ?? '?'}`}</small><b>{pokemon.speciesName || `Espécie #${pokemon.speciesId ?? '?'}`}{pokemon.shiny ? ' ✦' : ''}</b><span>{pokemon.level ? `Nv ${pokemon.level}` : 'Nv ?'} · {pokemon.potency ? `P${pokemon.potency}` : 'P?'} · Q {pokemon.quality?.toFixed(3) ?? '?'}</span></div></div>
}

function PokemonSummary({ pokemon, projectionTotal, side }: { pokemon: PokemonWorthSnapshot | null; projectionTotal: number; side: string }) {
  return <article class="worth-summary"><span class="worth-side-label">{side}</span>{pokemon ? <><PokemonSprite speciesId={pokemon.speciesId} name={pokemon.speciesName || 'Pokémon'} className="worth-main-sprite" /><h2>{pokemon.speciesName || `Espécie #${pokemon.speciesId ?? '?'}`}{pokemon.shiny ? ' ✦' : ''}</h2><p>{pokemon.types?.join(' / ') || (pokemon.source === 'account' ? 'DADOS DO SERVIDOR' : 'FICHA EXTERNA')}</p><div class="worth-chips"><span>Nv <b>{pokemon.level ?? '?'}</b></span><span>P<b>{pokemon.potency ?? '?'}</b></span><span>Q <b>{pokemon.quality?.toFixed(3) ?? '?'}</b></span><span>IV <b>{pokemon.ivTotal ?? '?'}/192</b></span></div><dl><div><dt>Stats atuais</dt><dd>{fmtStat(sumStats(pokemon.stats) || undefined)}</dd></div><div><dt>No nível alvo</dt><dd>{fmtStat(projectionTotal || undefined)}</dd></div><div><dt>Nota calculadora</dt><dd>{pokemon.calculatorScore !== undefined ? pokemon.calculatorScore.toFixed(2) : '—'}</dd></div><div><dt>Poder da ficha</dt><dd>{pokemon.power !== undefined ? pokemon.power.toLocaleString('pt-BR') : '—'}</dd></div></dl></> : <div class="worth-summary-empty">Escolha um Pokémon acima</div>}</article>
}

function verdictTitle(verdict: ReturnType<typeof comparePokemonWorth>['verdict'], left: PokemonWorthSnapshot | null, right: PokemonWorthSnapshot | null): string {
  if (verdict === 'insufficient') return 'Escolha os dois Pokémon para comparar'
  if (verdict === 'tie') return 'Os dois estão praticamente empatados'
  const winner = verdict === 'left' ? left : right
  return `${winner?.speciesName || 'Este Pokémon'} vale mais a pena em stats`
}

function verdictDetail(comparison: ReturnType<typeof comparePokemonWorth>): string {
  if (comparison.verdict === 'insufficient') return 'Preciso de stats atuais ou dos dados necessários para aplicar a fórmula.'
  if (comparison.verdict === 'tie') return 'Diferença total abaixo de 2% no mesmo nível. Compare distribuição de stats, potência, shiny e IVs.'
  const side = comparison.verdict === 'left' ? 'A' : 'B'
  const wins = comparison.verdict === 'left' ? comparison.leftWins : comparison.rightWins
  return `Pokémon ${side} tem vantagem de ${Math.abs(comparison.differencePercent ?? 0).toFixed(1).replace('.', ',')}% no total projetado e vence ${wins} dos 6 stats comparáveis.`
}

function decisionTrainerContext(snapshot: GridiumSnapshot, own: PokemonWorthSnapshot | null, candidate: PokemonWorthSnapshot | null): WorthDecisionContext {
  const accountId = own?.accountId ?? snapshot.selectedAccount
  const account = snapshot.accounts.find((item) => item.id === accountId)
  const trainerLevel = account?.huntProfile?.trainerLevel
  if (trainerLevel !== undefined && Number.isFinite(trainerLevel) && trainerLevel > 0) return { trainerLevel, estimatedTrainerLevel: false }
  return { trainerLevel: Math.max(1, Math.floor(Math.max(own?.level ?? 1, candidate?.level ?? 1))), estimatedTrainerLevel: true }
}

function pokemonDecisionSignature(pokemon: PokemonWorthSnapshot): string {
  return JSON.stringify({ id:pokemon.instanceId, speciesId:pokemon.speciesId, name:pokemon.speciesName, level:pokemon.level, pokemonXp:pokemon.pokemonXp, quality:pokemon.quality, potency:pokemon.potency, ivTotal:pokemon.ivTotal, ivs:pokemon.ivs, stats:pokemon.stats, base:pokemon.baseStats, ref:pokemon.refinement, shiny:pokemon.shiny, legendary:pokemon.legendary, types:pokemon.types })
}

function parsePrice(value: string): number | null {
  const text = value.trim().replace(/\s/g, '')
  if (!text) return null
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function formatXp(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 1 : 2).replace('.', ',')} bi`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 1).replace('.', ',')} mi`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1).replace('.', ',')} mil`
  return Math.round(value).toLocaleString('pt-BR')
}

function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—'
  const totalMinutes = Math.max(0, Math.round(hours * 60))
  const days = Math.floor(totalMinutes / 1440)
  const hrs = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return days > 0 ? `${days}d ${hrs}h ${minutes}m` : hrs > 0 ? `${hrs}h ${minutes}m` : `${minutes}m`
}

function signedPercent(value: number): string { return `${value >= 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%` }
function shortName(pokemon: PokemonWorthSnapshot | null): string { return pokemon?.speciesName?.slice(0, 14) || (pokemon?.speciesId ? `#${pokemon.speciesId}` : '—') }
function clampLevel(value: string): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(1, Math.min(10_000, Math.floor(parsed))) : 1 }
function fmtStat(value: number | undefined): string { return value === undefined || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString('pt-BR') }
function sumStats(stats: PokemonWorthSnapshot['stats']): number { return WORTH_STAT_KEYS.reduce((sum, key) => sum + (stats?.[key] ?? 0), 0) }
