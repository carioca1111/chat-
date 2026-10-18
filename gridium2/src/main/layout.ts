import type { AccountId, LayoutMode } from '../shared/contracts'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutFrame {
  width: number
  height: number
}

export interface LayoutResult {
  visible: AccountId[]
  bounds: Partial<Record<AccountId, Rect>>
}

export const CHROME = {
  sidebar: 288,
  header: 64,
  footer: 30,
  gap: 8,
  padding: 8
} as const

const accountCycle = (selected: AccountId): AccountId[] => {
  const ids: AccountId[] = [1, 2, 3, 4]
  const index = ids.indexOf(selected)
  return [...ids.slice(index), ...ids.slice(0, index)]
}

const safe = (value: number): number => Math.max(1, Math.floor(value))

export function computeLayout(frame: LayoutFrame, mode: LayoutMode, selected: AccountId): LayoutResult {
  const x = CHROME.sidebar + CHROME.padding
  const y = CHROME.header + CHROME.padding
  const width = safe(frame.width - CHROME.sidebar - CHROME.padding * 2)
  const height = safe(frame.height - CHROME.header - CHROME.footer - CHROME.padding * 2)
  const bounds: Partial<Record<AccountId, Rect>> = {}

  if (mode === 1) {
    bounds[selected] = { x, y, width, height }
    return { visible: [selected], bounds }
  }

  if (mode === 2) {
    const visible = accountCycle(selected).slice(0, 2)
    const horizontal = width >= 960

    if (horizontal) {
      const cellWidth = safe((width - CHROME.gap) / 2)
      bounds[visible[0]] = { x, y, width: cellWidth, height }
      bounds[visible[1]] = { x: x + cellWidth + CHROME.gap, y, width: safe(width - cellWidth - CHROME.gap), height }
    } else {
      const cellHeight = safe((height - CHROME.gap) / 2)
      bounds[visible[0]] = { x, y, width, height: cellHeight }
      bounds[visible[1]] = { x, y: y + cellHeight + CHROME.gap, width, height: safe(height - cellHeight - CHROME.gap) }
    }

    return { visible, bounds }
  }

  const visible: AccountId[] = [1, 2, 3, 4]
  const cellWidth = safe((width - CHROME.gap) / 2)
  const cellHeight = safe((height - CHROME.gap) / 2)

  bounds[1] = { x, y, width: cellWidth, height: cellHeight }
  bounds[2] = { x: x + cellWidth + CHROME.gap, y, width: safe(width - cellWidth - CHROME.gap), height: cellHeight }
  bounds[3] = { x, y: y + cellHeight + CHROME.gap, width: cellWidth, height: safe(height - cellHeight - CHROME.gap) }
  bounds[4] = {
    x: x + cellWidth + CHROME.gap,
    y: y + cellHeight + CHROME.gap,
    width: safe(width - cellWidth - CHROME.gap),
    height: safe(height - cellHeight - CHROME.gap)
  }

  return { visible, bounds }
}
