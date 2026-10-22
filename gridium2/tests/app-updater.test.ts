import { describe, expect, it } from 'vitest'
import { buildInstallerPowerShell, compareVersions } from '../src/main/app-updater'

describe('Gridium app updater version ordering', () => {
  it('detects newer alpha patch versions', () => {
    expect(compareVersions('2.0.0-alpha.9.1', '2.0.0-alpha.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0-alpha.10.0', '2.0.0-alpha.9.9')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0-alpha.11.1', '2.0.0-alpha.11.0')).toBeGreaterThan(0)
  })

  it('treats equal versions as equal', () => {
    expect(compareVersions('2.0.0-alpha.9.0', '2.0.0-alpha.9.0')).toBe(0)
  })

  it('rejects older versions', () => {
    expect(compareVersions('2.0.0-alpha.8.3', '2.0.0-alpha.9.0')).toBeLessThan(0)
  })
})

describe('Gridium updater installer helper', () => {
  it('reuses the currently installed directory and restarts the same executable', () => {
    const script = buildInstallerPowerShell({
      pid: 1234,
      installer: 'C:\\Users\\me\\AppData\\Roaming\\Gridium 2\\updates\\Gridium-2.exe',
      executable: 'D:\\Apps\\Gridium 2\\Gridium 2.exe',
      installDir: 'D:\\Apps\\Gridium 2',
      logPath: 'C:\\Users\\me\\AppData\\Roaming\\Gridium 2\\updates\\updater.log'
    })
    expect(script).toContain('/S /D=$installDir')
    expect(script).toContain("$installDir='D:\\Apps\\Gridium 2'")
    expect(script).toContain("$executable='D:\\Apps\\Gridium 2\\Gridium 2.exe'")
    expect(script).toContain('Start-Process -FilePath $executable')
    expect(script).toContain('installer-exit')
  })
})
