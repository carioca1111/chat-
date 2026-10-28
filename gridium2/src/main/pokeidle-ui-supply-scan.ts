export interface UiSupplyRow {
  itemId: string
  name: string
  quantity: number
}

export const POKEIDLE_UI_SUPPLY_NAMES = [
  'Small Potion',
  'Great Potion',
  'Ultra Potion',
  'Hyper Potion',
  'Ultimate Potion',
  'Golden Potion',
  'Revive',
  'Max Revive'
] as const

// Read-only fallback for the live PokeIdle page. It never clicks, focuses or mutates
// the page: it only reads the labels/assets and the visible quantity from each item button.
export const POKEIDLE_UI_SUPPLY_SCAN_SCRIPT = String.raw`(() => {
  const items = [
    ['Small Potion', ['smallpotion', 'pocaosmall', 'poca pequena']],
    ['Great Potion', ['greatpotion', 'pocaogreat', 'pocao grande']],
    ['Ultra Potion', ['ultrapotion', 'pocaoultra']],
    ['Hyper Potion', ['hyperpotion', 'pocaohyper']],
    ['Ultimate Potion', ['ultimatepotion', 'pocaoultimate']],
    ['Golden Potion', ['goldenpotion', 'pocaogolden', 'pocao dourada']],
    ['Revive', ['revive', 'reviver']],
    ['Max Revive', ['maxrevive', 'revivemax', 'max reviver']]
  ]
  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
  const parseQuantity = (value) => {
    const text = String(value || '').replace(/\u00a0/g, ' ').trim()
    if (!text) return null
    if (/\bacabou\b/i.test(text)) return 0
    const matches = text.match(/\d{1,3}(?:[.,]\d{3})+|\d+/g)
    if (!matches || matches.length === 0) return null
    const values = matches
      .map((match) => Number(match.replace(/[.,]/g, '')))
      .filter((value) => Number.isFinite(value) && value >= 0)
    return values.length ? Math.max(...values) : null
  }
  const hintsFor = (element) => {
    if (!(element instanceof Element)) return ''
    const values = [
      element.getAttribute('title'),
      element.getAttribute('aria-label'),
      element.getAttribute('alt'),
      element.getAttribute('data-tooltip'),
      element.getAttribute('data-title'),
      element.getAttribute('data-tip'),
      element.getAttribute('data-tooltip-content'),
      element.getAttribute('data-original-title'),
      element.getAttribute('src'),
      element.getAttribute('name'),
      element.getAttribute('id'),
      element.getAttribute('class')
    ].filter(Boolean)
    return values.join(' ')
  }
  const all = Array.from(document.querySelectorAll(
    'button, img, [title], [aria-label], [alt], [data-tooltip], [data-title], [data-tip], [data-tooltip-content], [data-original-title]'
  ))
  const rows = []
  const seen = new Set()

  for (const [name, aliases] of items) {
    const canonical = normalize(name)
    const normalizedAliases = [canonical, ...aliases.map(normalize)]
    let best = null

    for (const element of all) {
      const hint = hintsFor(element)
      const normalizedHint = normalize(hint)
      const directText = String(element.textContent || '').trim()
      const normalizedDirect = normalize(directText)
      const matchesName = normalizedAliases.some((alias) => alias && (
        normalizedHint.includes(alias) || normalizedDirect === alias
      ))
      if (!matchesName) continue

      const button = element.closest('button') || (element instanceof HTMLButtonElement ? element : null)
      const scopes = [button, element.parentElement, element.parentElement?.parentElement, element]
        .filter(Boolean)
      for (const scope of scopes) {
        const visibleText = scope instanceof HTMLElement ? scope.innerText : scope.textContent
        const quantity = parseQuantity(visibleText)
        if (quantity === null) continue
        const score = button && scope === button ? 3 : scope === element.parentElement ? 2 : 1
        if (!best || score > best.score) best = { quantity, score }
      }
      if (!best && button && button.disabled) best = { quantity: 0, score: 2 }
      if (best?.score === 3) break
    }

    if (!best || seen.has(name)) continue
    seen.add(name)
    rows.push({ itemId: 'ui:' + canonical, name, quantity: Math.floor(best.quantity) })
  }
  return rows
})()`
