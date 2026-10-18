import type { HuntProfileScan } from '../shared/contracts'

const toNumber = (raw?: string): number | undefined => {
  if (!raw) return undefined
  const normalized = raw.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : undefined
}

const firstNumber = (text: string, patterns: RegExp[]): number | undefined => {
  for (const pattern of patterns) {
    const value = toNumber(text.match(pattern)?.[1])
    if (value !== undefined) return value
  }
  return undefined
}

export const HUNT_PROFILE_SCAN_SCRIPT = `(() => {
  const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const chunks = [];
  const seen = new Set();
  const add = (prefix, value) => {
    const text = clean(value);
    if (!text || text.length > 2400) return;
    const row = prefix + ': ' + text;
    if (seen.has(row)) return;
    seen.add(row);
    chunks.push(row);
  };
  const selectors = [
    '[class*="equip" i]', '[id*="equip" i]', '[class*="field" i]', '[id*="field" i]',
    '[class*="active" i][class*="pokemon" i]', '[class*="pokemon" i][class*="card" i]',
    '[data-pokemon]', '[data-pokemon-name]', '[data-species]', '[data-slot]',
    '[aria-label*="pokemon" i]', '[title*="pokemon" i]', 'img[alt]', 'img[title]'
  ];
  let count = 0;
  for (const el of document.querySelectorAll(selectors.join(','))) {
    if (count++ >= 120) break;
    add('TEXT', el.innerText || el.textContent);
    for (const name of ['aria-label','title','alt','data-pokemon','data-pokemon-name','data-species','data-name','data-level','data-quality','data-potency','data-iv','data-iv-total','data-shiny']) {
      const value = el.getAttribute && el.getAttribute(name);
      if (value) add(name.toUpperCase(), value);
    }
  }
  const body = String(document.body && document.body.innerText || '').slice(0, 60000);
  return (chunks.join('\\n') + '\\n__BODY__\\n' + body).slice(0, 90000);
})()`

export function parseHuntPageText(input: string, now = Date.now()): HuntProfileScan | null {
  const text = String(input || '').replace(/\r/g, '').slice(0, 90000)
  if (!text.trim()) return null

  const fieldIndex = text.search(/\b(?:POK[EÉ]MON\s+EM\s+CAMPO|EM\s+CAMPO|EQUIPAD[OA]|ACTIVE\s+POK[EÉ]MON|POK[EÉ]MON\s+ATIVO)\b/i)
  const field = fieldIndex >= 0 ? text.slice(fieldIndex, fieldIndex + 3600) : text.slice(0, 12000)
  const compact = field.replace(/\s+/g, ' ')

  const active = field.match(/(?:^|\n)(?:TEXT:\s*)?([A-Za-zÀ-ÿ0-9.'’\- ]{2,42}?)\s+(?:Nv|Lv|Lvl|N[ií]vel|Level)\s*[:.]?\s*([\d.]+)/im)
  const named = compact.match(/(?:ESP[EÉ]CIE|SPECIES|POK[EÉ]MON|NOME)\s*[:=-]\s*([A-Za-zÀ-ÿ0-9.'’\- ]{2,42}?)(?=\s+(?:Nv|Lv|Lvl|N[ií]vel|Level|IV|Q\b|P[1-5]\b)|$)/i)
  const attrNamed = text.match(/(?:DATA-POKEMON(?:-NAME)?|DATA-SPECIES|ALT|TITLE):\s*([A-Za-zÀ-ÿ0-9.'’\- ]{2,42})/i)
  const speciesName = (active?.[1] || named?.[1] || attrNamed?.[1])?.trim().replace(/^[^A-Za-zÀ-ÿ]+/, '') || undefined

  const pokemonLevel = toNumber(active?.[2]) ?? firstNumber(compact, [
    /(?:NV|LV|LVL|N[IÍ]VEL|LEVEL)\s*(?:POK[EÉ]MON)?\s*[:.]?\s*([\d.]+)/i,
    /(?:POK[EÉ]MON)[^\d]{0,18}(?:NV|LV|LVL|N[IÍ]VEL|LEVEL)?\s*([\d.]+)/i,
    /DATA-LEVEL:\s*([\d.]+)/i
  ])

  const trainerLevel = firstNumber(text, [
    /(?:NV|LV|N[IÍ]VEL|LEVEL)\s*(?:DO\s+)?(?:TREINADOR|TRAINER)\s*[:.]?\s*([\d.]+)/i,
    /(?:TREINADOR|TRAINER)[^\d\n]{0,24}(?:NV|LV|N[IÍ]VEL|LEVEL)?\s*[:.]?\s*([\d.]+)/i
  ]) ?? (() => {
    const prefix = fieldIndex > 0 ? text.slice(Math.max(0, fieldIndex - 1800), fieldIndex) : text.slice(0, 1800)
    const levels = [...prefix.matchAll(/\b(?:Nv|Lv|Lvl|N[ií]vel|Level)\s*[:.]?\s*([\d.]+)/gi)]
    return toNumber(levels.at(-1)?.[1])
  })()

  const quality = firstNumber(compact, [
    /(?:QUALIDADE|QUALITY)\s*[:=]?\s*([\d.,]+)/i,
    /\bQ\s*[:=]?\s*([\d.,]+)/i,
    /DATA-QUALITY:\s*([\d.,]+)/i
  ])

  const potencyNumber = firstNumber(compact, [
    /(?:POT[EÊ]NCIA|POTENCY)\s*[:=]?\s*P?\s*([1-5])/i,
    /\bP\s*([1-5])\b/i,
    /DATA-POTENCY:\s*P?\s*([1-5])/i
  ])
  const potency = ([1, 2, 3, 4, 5].includes(Number(potencyNumber)) ? Number(potencyNumber) : undefined) as 1|2|3|4|5|undefined

  let ivAverage = firstNumber(compact, [
    /(?:IV\s*M[EÉ]DIO|M[EÉ]DIA\s+DE\s+IV|AVG\s*IV|AVERAGE\s*IV)\s*[:=]?\s*([\d.,]+)/i
  ])
  let ivTotal = firstNumber(compact, [
    /(?:IV\s*TOTAL|TOTAL\s*IV)\s*[:=]?\s*([\d.,]+)/i,
    /DATA-IV-TOTAL:\s*([\d.,]+)/i,
    /DATA-IV:\s*([\d.,]+)/i
  ])
  const genericIv = firstNumber(compact, [/\bIV\s*[:=]?\s*([\d.,]+)/i])
  if (ivAverage === undefined && ivTotal === undefined && genericIv !== undefined) {
    if (genericIv <= 32) ivAverage = genericIv
    else ivTotal = genericIv
  }

  const explicitShinyFalse = /(?:DATA-SHINY|SHINY)\s*[:=]\s*(?:FALSE|0|N[AÃ]O|NO|OFF)\b/i.test(compact)
  const shiny = explicitShinyFalse ? false : /(?:DATA-SHINY:\s*(?:TRUE|1|YES|SIM|ON)\b|\bSHINY\b)/i.test(compact) ? true : undefined

  if (!trainerLevel && !speciesName && !pokemonLevel && quality === undefined && potency === undefined && ivAverage === undefined && ivTotal === undefined) return null
  return { trainerLevel, speciesName, pokemonLevel, quality, potency, ivTotal, ivAverage, shiny, source: 'page', detectedAt: now }
}
