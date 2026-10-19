import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const controller = readFileSync(join(root, 'src/main/display-power.ts'), 'utf8')
const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
const settings = readFileSync(join(root, 'src/renderer/src/SettingsView.tsx'), 'utf8')
const contracts = readFileSync(join(root, 'src/shared/contracts.ts'), 'utf8')

describe('display power option', () => {
  it('uses Electron prevent-display-sleep instead of a timer hack', () => {
    expect(controller).toContain("powerSaveBlocker.start('prevent-display-sleep')")
    expect(controller).not.toContain('setInterval(')
  })

  it('releases the blocker when disabled or the app exits', () => {
    expect(controller).toContain('powerSaveBlocker.stop(id)')
    expect(main).toContain('displayPower?.destroy()')
  })

  it('defaults to keeping the display awake and persists the choice', () => {
    expect(controller).toContain("gridium2-display-power.json")
    expect(controller).toContain('keepDisplayAwake: this.enabled')
    expect(controller).toContain("typeof parsed.keepDisplayAwake === 'boolean' ? parsed.keepDisplayAwake : true")
    expect(controller).toContain('catch {\n      return true')
  })

  it('exposes the option through snapshot, IPC and settings UI', () => {
    expect(contracts).toContain('keepDisplayAwake: boolean')
    expect(contracts).toContain('setKeepDisplayAwake: (enabled: boolean)')
    expect(main).toContain("gridium2:set-keep-display-awake")
    expect(settings).toContain('Manter tela do PC ligada')
    expect(settings).toContain('snapshot.keepDisplayAwake')
  })
})
