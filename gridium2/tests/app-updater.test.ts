import { describe, expect, it } from 'vitest'
import { compareVersions } from '../src/main/app-updater'
import { buildInstallerBatch } from '../src/main/update-installer-helper'

describe('Gridium app updater version ordering', () => {
  it('detects newer alpha patch versions', () => {
    expect(compareVersions('2.0.0-alpha.9.1', '2.0.0-alpha.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0-alpha.10.0', '2.0.0-alpha.9.9')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0-alpha.11.1', '2.0.0-alpha.11.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0-alpha.12.1', '2.0.0-alpha.12.0')).toBeGreaterThan(0)
  })

  it('treats equal versions as equal', () => {
    expect(compareVersions('2.0.0-alpha.9.0', '2.0.0-alpha.9.0')).toBe(0)
  })

  it('rejects older versions', () => {
    expect(compareVersions('2.0.0-alpha.8.3', '2.0.0-alpha.9.0')).toBeLessThan(0)
  })
})

describe('Gridium updater installer bootstrap', () => {
  it('waits for Gridium to close, installs in the same directory and restarts it', () => {
    const script = buildInstallerBatch({
      pid: 1234,
      installer: 'C:\\Users\\me\\AppData\\Roaming\\Gridium 2\\updates\\Gridium-2.exe',
      executable: 'D:\\Apps\\Gridium 2\\Gridium 2.exe',
      installDir: 'D:\\Apps\\Gridium 2',
      logPath: 'C:\\Users\\me\\AppData\\Roaming\\Gridium 2\\updates\\updater.log'
    })
    expect(script).toContain('set "TARGET_PID=1234"')
    expect(script).toContain('tasklist /FI "PID eq %TARGET_PID%"')
    expect(script).toContain('start "" /wait "%INSTALLER%" /S --updated /D=%INSTALL_DIR%')
    expect(script).toContain('set "INSTALL_DIR=D:\\Apps\\Gridium 2"')
    expect(script).toContain('set "GRID_EXE=D:\\Apps\\Gridium 2\\Gridium 2.exe"')
    expect(script).toContain('helper:fallback-visible-installer')
    expect(script).toContain('start "" "%GRID_EXE%"')
  })
})
