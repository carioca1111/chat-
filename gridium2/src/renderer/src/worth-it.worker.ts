import type { PokemonWorthSnapshot } from '../../shared/contracts'
import { loadHuntSpecies } from './hunt-data'
import { calculateWorthDecision, type WorthDecisionContext } from './worth-it-decision'

interface Request {
  key: string
  own: PokemonWorthSnapshot
  candidate: PokemonWorthSnapshot
  context: WorthDecisionContext
}

interface Response {
  key: string
  result?: ReturnType<typeof calculateWorthDecision>
  error?: string
}

self.onmessage = (event: MessageEvent<Request>): void => {
  const request = event.data
  void (async () => {
    try {
      const data = await loadHuntSpecies()
      const result = calculateWorthDecision(data, request.own, request.candidate, request.context)
      self.postMessage({ key: request.key, result } satisfies Response)
    } catch (error) {
      self.postMessage({ key: request.key, error: error instanceof Error ? error.message : 'Falha ao calcular o Vale a Pena.' } satisfies Response)
    }
  })()
}
