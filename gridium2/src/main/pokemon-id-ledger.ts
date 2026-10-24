/** Exact capture deduplication is a ledger, not an evictable cache.
 * Server instance IDs are positive integers. Store contiguous IDs as ranges so
 * long sequential capture runs cost two numbers without recounting old Pokémon.
 * Preserve arbitrary IDs exactly as well; never guess that an expired ID is new.
 */
export class PokemonIdLedger {
  private ranges: [number, number][] = []
  private other = new Set<string>()
  private count = 0
  get size() { return this.count }
  get storageEntries() { return this.ranges.length + this.other.size }
  clear(): void { this.ranges = []; this.other.clear(); this.count = 0 }
  private numeric(id: string): number | null {
    const n = Number(id)
    return Number.isSafeInteger(n) && n > 0 && String(n) === id ? n : null
  }
  private locate(n: number): number {
    let lo = 0, hi = this.ranges.length
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.ranges[mid][1] < n) lo = mid + 1; else hi = mid }
    return lo
  }
  has(id: string): boolean {
    const n = this.numeric(id)
    if (n === null) return this.other.has(id)
    const range = this.ranges[this.locate(n)]
    return Boolean(range && range[0] <= n)
  }
  add(id: string): void {
    const n = this.numeric(id)
    if (n === null) { if (!this.other.has(id)) { this.other.add(id); this.count++ }; return }
    const i = this.locate(n), next = this.ranges[i], previous = this.ranges[i - 1]
    if (next && next[0] <= n) return
    this.count++
    if (previous && previous[1] + 1 === n) {
      previous[1] = n
      if (next && next[0] === n + 1) { previous[1] = next[1]; this.ranges.splice(i, 1) }
    } else if (next && next[0] === n + 1) next[0] = n
    else this.ranges.splice(i, 0, [n, n])
  }
}
