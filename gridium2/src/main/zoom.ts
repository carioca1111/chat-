export const MIN_ACCOUNT_ZOOM = 50
export const MAX_ACCOUNT_ZOOM = 140
export const ACCOUNT_ZOOM_STEP = 5
export const DEFAULT_ACCOUNT_ZOOM = 100

export function normalizeAccountZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ACCOUNT_ZOOM
  const clamped = Math.min(MAX_ACCOUNT_ZOOM, Math.max(MIN_ACCOUNT_ZOOM, value))
  return Math.round(clamped / ACCOUNT_ZOOM_STEP) * ACCOUNT_ZOOM_STEP
}
