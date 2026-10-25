import { useEffect, useMemo, useState } from 'preact/hooks'
import type { AccountId, GridiumSnapshot, PokemonWorthSnapshot } from '../../shared/contracts'
import { comparePokemonWorth, parsePokemonFicha, pokemonWorthLabel, WORTH_STAT_KEYS, type WorthStatKey } from '../../shared/worth-it'
import { PokemonSprite } from './PokemonSprite'

type SourceMode = 'account' | 'paste'
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

const STAT_LABEL: Record<WorthStatKey, string> = { hp: 'HP', atk: 'ATK', def: 'DEF', spAtk: 'SP.ATK', spDef: 'SP.DEF', speed: 'SPD' }
const emptySide = (accountId: AccountId): SideState => ({ mode: 'account', accountId, query: '', results: [], selected: null, pasted: '', pasteError: '', loading: false })

export function WorthItPanel({ snapshot }: { snapshot: GridiumSnapshot }) {
  const [left, setLeft] = useState<SideState>(() => emptySide(snapshot.selectedAccount))
  const [right, setRight] = useState<SideState>(() => emptySide(snapshot.selectedAccount))
  const [targetLevel, setTargetLevel] = useState(1000)

  useEffect(() => { void loadRoster(left, setLeft) }, [left.accountId, left.query, left.mode])
  useEffect(() => { void loadRoster(right, setRight) }, [right.accountId, right.query, right.mode])

  const recommendedLevel = Math.max(1, Math.round(Math.max(left.selected?.level ?? 1, right.selected?.level ?? 1)))
  useEffect(() => {
    if (left.selected && right.selected && targetLevel === 1000 && recommendedLevel > 1000) setTargetLevel(recommendedLevel)
  }, [left.selected?.instanceId, right.selected?.instanceId])

  const comparison = useMemo(() => comparePokemonWorth(left.selected, right.selected, targetLevel), [left.selected, right.selected, targetLevel])
  const maxStat = Math.max(1, ...WORTH_STAT_KEYS.flatMap((key) => [comparison.left.stats[key] ?? 0, comparison.right.stats[key] ?? 0]))

  const swap = (): void => { const a = left; setLeft(right); setRight(a) }

  return <main class="worth-page poke-frame">
    <section class="worth-head">
      <div><small>GRIDIIUM LAB</small><h1>⚖ VALE A PENA?</h1><p>Compare Pokémon da sua conta ou cole uma ficha externa. O resultado normaliza os dois para o mesmo nível usando as regras do PokeIdle.</p></div>
      <label class="worth-level"><span>NÍVEL DA COMPARAÇÃO</span><input type="number" min="1" max="10000" value={targetLevel} onInput={(event) => setTargetLevel(clampLevel(event.currentTarget.value))} /><button onClick={() => setTargetLevel(recommendedLevel)}>NÍVEL MAIS ALTO</button></label>
    </section>

    <section class="worth-pickers">
      <PokemonPicker side="A" state={left} setState={setLeft} accounts={snapshot.accounts.map((account) => account.id)} />
      <button class="worth-swap" title="Trocar lados" onClick={swap}>⇄</button>
      <PokemonPicker side="B" state={right} setState={setRight} accounts={snapshot.accounts.map((account) => account.id)} />
    </section>

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
      <span>Stats atuais são projetados linearmente para o nível escolhido. Quando não há stat atual, uso: (base + refino + 2×IV) × nível/100 × qualidade^expoente × potência × shiny × lendário.</span>
      <span>Qualidade: HP/SPD ^0,95 · demais ^0,8 · P1×1 · P2×1,05 · P3×1,1 · P4×1,25 · P5×2 · shiny×3 · lendário/mítico×4.</span>
      <em>A ficha colada é processada localmente e não é salva.</em>
    </section>
  </main>
}

function PokemonPicker({ side, state, setState, accounts }: { side: string; state: SideState; setState: (value: SideState | ((current: SideState) => SideState)) => void; accounts: AccountId[] }) {
  const usePaste = (): void => setState((current) => ({ ...current, mode: current.mode === 'account' ? 'paste' : 'account', pasteError: '' }))
  const parsePaste = (): void => {
    const parsed = parsePokemonFicha(state.pasted)
    if (!parsed) { setState((current) => ({ ...current, pasteError: 'Não consegui reconhecer essa ficha. Cole o texto completo do Pokémon.' })); return }
    setState((current) => ({ ...current, selected: parsed, pasteError: '', mode: 'paste' }))
  }
  return <article class={`worth-picker side-${side.toLowerCase()}`}>
    <header><span>POKÉMON {side}</span><div><button class={state.mode === 'account' ? 'active' : ''} onClick={() => setState((current) => ({ ...current, mode: 'account' }))}>DA CONTA</button><button class={state.mode === 'paste' ? 'active' : ''} onClick={usePaste}>COLAR FICHA</button></div></header>
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
  if (comparison.verdict === 'tie') return `Diferença total abaixo de 2% no mesmo nível. Compare distribuição de stats, potência, shiny e IVs.`
  const side = comparison.verdict === 'left' ? 'A' : 'B'
  const wins = comparison.verdict === 'left' ? comparison.leftWins : comparison.rightWins
  return `Pokémon ${side} tem vantagem de ${Math.abs(comparison.differencePercent ?? 0).toFixed(1).replace('.', ',')}% no total projetado e vence ${wins} dos 6 stats comparáveis.`
}

function shortName(pokemon: PokemonWorthSnapshot | null): string { return pokemon?.speciesName?.slice(0, 14) || (pokemon?.speciesId ? `#${pokemon.speciesId}` : '—') }
function clampLevel(value: string): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(1, Math.min(10_000, Math.floor(parsed))) : 1 }
function fmtStat(value: number | undefined): string { return value === undefined || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString('pt-BR') }
function sumStats(stats: PokemonWorthSnapshot['stats']): number { return WORTH_STAT_KEYS.reduce((sum, key) => sum + (stats?.[key] ?? 0), 0) }
