import type { HuntProfileScan } from '../shared/contracts'

const toNumber = (raw?: string): number | undefined => {
  if (!raw) return undefined
  const normalized = raw.replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : undefined
}

export function parseHuntPageText(input: string, now = Date.now()): HuntProfileScan | null {
  const text = String(input || '').replace(/\r/g, '').slice(0, 50000)
  if (!text) return null

  const fieldIndex = text.search(/\bEM CAMPO\b/i)
  const field = fieldIndex >= 0 ? text.slice(fieldIndex, fieldIndex + 1800) : text

  const active = field.match(/(?:^|\n)\s*([A-Za-zÀ-ÿ0-9.'’\- ]{2,42}?)\s+Nv\s*([\d.]+)/im)
  const allLevels = [...text.matchAll(/\bNv\s*([\d.]+)/gi)]
  const trainerLevel = toNumber(allLevels[0]?.[1])
  const pokemonLevel = toNumber(active?.[2])

  const compact = field.replace(/\s+/g, ' ')
  const potencyRaw = compact.match(/\bP\s*([1-5])\b/i)?.[1]
  const ivTotal = toNumber(compact.match(/\bIV\s*([\d.]+)/i)?.[1])
  const quality = toNumber(compact.match(/\bQ\s*([\d.,]+)/i)?.[1])
  const potencyNumber = Number(potencyRaw)
  const potency = ([1,2,3,4,5].includes(potencyNumber) ? potencyNumber : undefined) as 1|2|3|4|5|undefined
  const speciesName = active?.[1]?.trim().replace(/^[^A-Za-zÀ-ÿ]+/, '') || undefined

  if (!trainerLevel && !speciesName && !pokemonLevel) return null
  return { trainerLevel, speciesName, pokemonLevel, quality, potency, ivTotal, source: 'page', detectedAt: now }
}
