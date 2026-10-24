/** One dirty bit, one timer and one write; never retain serialized payloads in a queue. */
export class CoalescedWriter {
  private dirty = false
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private writes = 0
  constructor(private readonly write: () => Promise<void>, private readonly delay = 15_000) {}
  mark(): void {
    if (this.stopped) return
    this.dirty = true
    if (this.running || this.timer) return
    this.timer = setTimeout(() => { this.timer = null; void this.run() }, this.delay)
  }
  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
  diagnostics() { return { dirty: this.dirty, timers: Number(Boolean(this.timer)), inFlight: Number(this.running), writes: this.writes } }
  private async run(): Promise<void> {
    if (this.stopped || this.running || !this.dirty) return
    this.dirty = false
    this.running = true
    try { await this.write(); this.writes++ } catch { this.dirty = true }
    finally { this.running = false; if (this.dirty && !this.stopped) this.mark() }
  }
}
