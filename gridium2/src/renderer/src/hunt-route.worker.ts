/// <reference lib="webworker" />

import type { HuntSpecies } from './hunt-data'
import type { HuntProfile } from './hunt-engine'
import { computeHuntRouteProjection, type HuntRouteProjection } from './hunt-route-projection'

export interface HuntRouteWorkerRequest {
  key: string
  data: HuntSpecies[]
  profile: HuntProfile
}

export interface HuntRouteWorkerResponse {
  key: string
  projection?: HuntRouteProjection
  error?: string
}

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<HuntRouteWorkerRequest>) => {
  const request = event.data
  try {
    const projection = computeHuntRouteProjection(request.data, request.profile)
    scope.postMessage({ key: request.key, projection } satisfies HuntRouteWorkerResponse)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    scope.postMessage({ key: request.key, error: detail } satisfies HuntRouteWorkerResponse)
  }
}

export {}
