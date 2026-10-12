$ErrorActionPreference = 'Stop'
$parts = Get-ChildItem "gridium-ci/source.*.b64" | Sort-Object Name
if ($parts.Count -ne 10) { throw "Expected 10 source chunks, found $($parts.Count)" }
$b64 = ($parts | ForEach-Object { Get-Content $_.FullName -Raw }) -join ''
[IO.File]::WriteAllBytes("Gridium-source.zip", [Convert]::FromBase64String($b64))
New-Item -ItemType Directory -Force -Path "gridium-build" | Out-Null
Expand-Archive -Path "Gridium-source.zip" -DestinationPath "gridium-build" -Force
node gridium-desktop/apply-alpha4.js gridium-build
node gridium-desktop/apply-alpha5.js gridium-build
node apply-alpha61.js gridium-build
node apply-alpha62.js gridium-build
node apply-alpha7.js gridium-build
node apply-alpha71-fixed.js gridium-build
node apply-alpha8.js gridium-build
node apply-alpha81.js gridium-build
node apply-alpha82.js gridium-build
node apply-alpha83.js gridium-build
node apply-alpha84.js gridium-build
node apply-alpha85.js gridium-build
node apply-alpha86.js gridium-build
node apply-alpha87.js gridium-build
node apply-alpha88.js gridium-build
node apply-alpha90.js gridium-build
node apply-alpha91.js gridium-build
if (-not (Test-Path "gridium-build/alpha-core-process.js")) { throw "Auto Trader core process missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "require('child_process')")) { throw "child_process import missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch 'gridium-alpha-core.sqlite')) { throw "separate core database missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "alphaCoreRequest('plan'")) { throw "process planning missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch 'Processo separado do Auto Trader caiu; LIVE bloqueado')) { throw "fail-closed guard missing" }
node --check gridium-build/main.js
node --check gridium-build/renderer.js
node --check gridium-build/alpha-core-process.js
Push-Location gridium-build
npm install --no-audit --no-fund
npm test
npm run dist:win
Pop-Location
