import { app, powerSaveBlocker } from 'electron'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface StoredDisplayPowerSettings {
  keepDisplayAwake?: boolean
}

export class DisplayPowerController {
  private readonly filePath = join(app.getPath('userData'), 'gridium2-display-power.json')
  private enabled = true
  private blockerId: number | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  constructor() {
    this.enabled = this.load()
  }

  start(): void {
    this.reconcile()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      this.reconcile()
      return
    }
    this.enabled = enabled
    this.reconcile()
    this.persist()
  }

  destroy(): void {
    this.stopBlocker()
  }

  private reconcile(): void {
    if (this.enabled) {
      if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) return
      this.blockerId = powerSaveBlocker.start('prevent-display-sleep')
      return
    }
    this.stopBlocker()
  }

  private stopBlocker(): void {
    if (this.blockerId === null) return
    const id = this.blockerId
    this.blockerId = null
    try {
      if (powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id)
    } catch {
      // App shutdown: nothing else to do.
    }
  }

  private load(): boolean {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoredDisplayPowerSettings
      return typeof parsed.keepDisplayAwake === 'boolean' ? parsed.keepDisplayAwake : true
    } catch {
      return true
    }
  }

  private persist(): void {
    const payload = JSON.stringify({ keepDisplayAwake: this.enabled }, null, 2)
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(() => writeFile(this.filePath, payload, 'utf8'))
      .catch(() => undefined)
  }
}
