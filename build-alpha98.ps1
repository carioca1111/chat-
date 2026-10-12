$ErrorActionPreference = 'Stop'
./build-alpha97.ps1
node apply-alpha98.js gridium-build
if ((Get-Content "gridium-build/package.json" -Raw) -notmatch '3.0.0-alpha.9.8') { throw "Alpha 9.8 version missing" }
if (-not (Select-String -Path "gridium-build/alpha-engine.js" -SimpleMatch 'minExitProfitPct')) { throw "Margin floor missing" }
if (-not (Select-String -Path "gridium-build/alpha-engine.js" -SimpleMatch 'minBookDepth')) { throw "Book depth guard missing" }
if (-not (Select-String -Path "gridium-build/alpha-engine.js" -SimpleMatch 'competitorBelowFloor')) { throw "Protected repricing missing" }
if (-not (Select-String -Path "gridium-build/alpha-core-process.js" -SimpleMatch 'withBook')) { throw "Current book analysis missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch '(1+minNetRoi/100)/netFactor')) { throw "Net ROI sell formula missing" }
if (-not (Select-String -Path "gridium-build/index.html" -SimpleMatch 'game-classic-toolbar')) { throw "Classic Game View toolbar missing" }
if (-not (Select-String -Path "gridium-build/renderer.js" -SimpleMatch 'gridiumGameLayout')) { throw "Game View persistence missing" }
if (-not (Select-String -Path "gridium-build/styles.css" -SimpleMatch 'GRID_ALPHA98_MARGIN_GUARD_CLASSIC_GAME_VIEW')) { throw "Classic Game View CSS missing" }
node --check gridium-build/main.js
node --check gridium-build/renderer.js
node --check gridium-build/alpha-core-process.js
node --check gridium-build/alpha-engine.js
Push-Location gridium-build
npm test
npm run dist:win
Pop-Location
