import { spawn } from 'node:child_process'

export interface InstallerBatchInput {
  pid: number
  installer: string
  executable: string
  installDir: string
  logPath: string
}

/**
 * Build a tiny Windows cmd bootstrap that outlives the Electron process.
 *
 * Why cmd instead of PowerShell:
 * - some Windows policies/AV products block hidden PowerShell children;
 * - `start` creates a new process tree before Electron quits;
 * - if silent NSIS fails, the normal installer is shown instead of leaving
 *   the user with an app that simply disappeared.
 */
export function buildInstallerBatch(input: InstallerBatchInput): string {
  const pid = Math.max(1, Math.floor(input.pid))
  const installer = cmdSetEscape(input.installer)
  const executable = cmdSetEscape(input.executable)
  const installDir = cmdSetEscape(input.installDir)
  const logPath = cmdSetEscape(input.logPath)

  return [
    '@echo off',
    'setlocal EnableExtensions',
    `set "TARGET_PID=${pid}"`,
    `set "INSTALLER=${installer}"`,
    `set "GRID_EXE=${executable}"`,
    `set "INSTALL_DIR=${installDir}"`,
    `set "LOG_PATH=${logPath}"`,
    'call :log helper:started',
    ':wait_parent',
    'tasklist /FI "PID eq %TARGET_PID%" /NH 2>nul | findstr /C:"%TARGET_PID%" >nul 2>&1',
    'if not errorlevel 1 (',
    '  >nul 2>&1 timeout /t 1 /nobreak',
    '  goto wait_parent',
    ')',
    'call :log helper:parent-exited',
    'call :log helper:silent-install-start',
    'start "" /wait "%INSTALLER%" /S --updated /D=%INSTALL_DIR%',
    'set "INSTALL_CODE=%ERRORLEVEL%"',
    'call :log helper:silent-install-exit=%INSTALL_CODE%',
    'if not "%INSTALL_CODE%"=="0" goto visible_fallback',
    'if not exist "%GRID_EXE%" goto visible_fallback',
    '>nul 2>&1 timeout /t 1 /nobreak',
    'call :log helper:restart',
    'start "" "%GRID_EXE%"',
    'exit /b 0',
    ':visible_fallback',
    'call :log helper:fallback-visible-installer',
    'start "" /wait "%INSTALLER%" --updated /D=%INSTALL_DIR%',
    'set "VISIBLE_CODE=%ERRORLEVEL%"',
    'call :log helper:visible-installer-exit=%VISIBLE_CODE%',
    'if exist "%GRID_EXE%" start "" "%GRID_EXE%"',
    'exit /b %VISIBLE_CODE%',
    ':log',
    '>>"%LOG_PATH%" echo %date% %time% %*',
    'exit /b 0'
  ].join('\r\n')
}

/**
 * `cmd /c start` launches a second cmd process tree. The first cmd is only a
 * launcher and can die with Electron; the second one keeps running, waits for
 * the Gridium PID to disappear, then runs NSIS.
 */
export function launchInstallerBatch(helperPath: string): void {
  const command = `start "" /min "${cmdCommandEscape(helperPath)}"`
  const launcher = spawn('cmd.exe', ['/d', '/s', '/c', command], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  launcher.unref()
}

function cmdSetEscape(value: string): string {
  return value.replace(/%/g, '%%').replace(/"/g, '""')
}

function cmdCommandEscape(value: string): string {
  return value.replace(/"/g, '""')
}
