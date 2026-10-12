$ErrorActionPreference = 'Stop'
./build-alpha98.ps1
node apply-alpha99.js gridium-build
if ((Get-Content "gridium-build/package.json" -Raw) -notmatch '3.0.0-alpha.9.9') { throw "Alpha 9.9 version missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "performanceProfile")) { throw "Performance profiles missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "setFrameRate")) { throw "Frame-rate control missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "protocolCursorAt")) { throw "Incremental protocol cursor missing" }
if (-not (Select-String -Path "gridium-build/network-inspector.js" -SimpleMatch "events:1600")) { throw "Ultra network buffer cap missing" }
if (-not (Select-String -Path "gridium-build/alpha-engine.js" -SimpleMatch "summary.currentPnl")) { throw "Open-loss risk guard missing" }
if (-not (Select-String -Path "gridium-build/alpha-engine.js" -SimpleMatch "forecastError")) { throw "Trade forecast telemetry missing" }
if (-not (Select-String -Path "gridium-build/index.html" -SimpleMatch 'id="performanceProfile"')) { throw "Performance selector missing" }
if (Select-String -Path "gridium-build/main.js" -Pattern '\.suspend\s*\(') { throw "Renderer suspend is forbidden" }
node --check gridium-build/main.js
node --check gridium-build/renderer.js
node --check gridium-build/network-inspector.js
node --check gridium-build/alpha-core-process.js
node --check gridium-build/alpha-engine.js
node --check gridium-build/preload.js
Push-Location gridium-build
npm test
npm run dist:win
Pop-Location
