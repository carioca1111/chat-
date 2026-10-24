import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app, webContents } from 'electron'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import type { TelemetrySnapshot } from '../shared/contracts'

export class TelemetryService {
  private readonly histogram = monitorEventLoopDelay({ resolution: 20 })
  private timer: NodeJS.Timeout | null = null
  private last: TelemetrySnapshot = {
    cpuPercent: 0,
    memoryMB: 0,
    mainEventLoopMeanMs: 0,
    mainEventLoopMaxMs: 0,
    processCount: 0,
    capturedAt: Date.now()
  }

  private samples = 0
  constructor(private readonly onSample: (sample: TelemetrySnapshot) => void, private readonly diagnostics: () => unknown = () => ({})) {}

  start(): void {
    if (this.timer) return
    this.histogram.enable()
    this.timer = setInterval(() => this.sample(), 1000)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.histogram.disable()
  }

  getSnapshot(): TelemetrySnapshot {
    return this.last
  }

  private sample(): void {
    const metrics = app.getAppMetrics()
    let cpuPercent = 0
    let memoryKB = 0

    for (const metric of metrics) {
      cpuPercent += metric.cpu?.percentCPUUsage ?? 0
      memoryKB += metric.memory?.workingSetSize ?? 0
    }

    const meanMs = Number.isFinite(this.histogram.mean) ? this.histogram.mean / 1e6 : 0
    const maxMs = Number.isFinite(this.histogram.max) ? this.histogram.max / 1e6 : 0

    this.last = {
      cpuPercent: Math.max(0, Number(cpuPercent.toFixed(1))),
      memoryMB: Math.max(0, Number((memoryKB / 1024).toFixed(1))),
      mainEventLoopMeanMs: Math.max(0, Number(meanMs.toFixed(2))),
      mainEventLoopMaxMs: Math.max(0, Number(maxMs.toFixed(2))),
      processCount: metrics.length,
      capturedAt: Date.now()
    }

    if (process.env.GRIDIUM_DIAGNOSTICS === '1' && ++this.samples % 60 === 0) {
      try {
        const path = join(app.getPath('userData'), 'gridium2-diagnostics.jsonl')
        if (existsSync(path) && statSync(path).size > 5 * 1024 * 1024) renameSync(path, `${path}.1`)
        appendFileSync(path, JSON.stringify({ at: Date.now(), uptime: process.uptime(), pid: process.pid,
          memory: process.memoryUsage(), processes: metrics, webContents: webContents.getAllWebContents().map((wc) => ({
            id: wc.id, type: wc.getType(), pid: wc.getOSProcessId(), listeners: wc.eventNames().reduce((n, e) => n + wc.listenerCount(e), 0)
          })), runtime: this.diagnostics() }) + '\n')
      } catch { /* Diagnostics must not interrupt gameplay. */ }
    }
    this.histogram.reset()
    this.onSample(this.last)
  }
}
