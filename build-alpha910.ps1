$ErrorActionPreference = 'Stop'
./build-alpha99.ps1
node apply-alpha910.js gridium-build
if ((Get-Content "gridium-build/package.json" -Raw) -notmatch '3.0.0-alpha.9.10') { throw "Alpha 9.10 version missing" }
if (-not (Select-String -Path "gridium-build/index.html" -SimpleMatch 'id="alphaSimpleOverall"')) { throw "Simple overall result missing" }
if (-not (Select-String -Path "gridium-build/renderer.js" -SimpleMatch 'AINDA NÃO VENDEU')) { throw "Simple result labels missing" }
if (-not (Select-String -Path "gridium-build/renderer.js" -SimpleMatch 'alpha-simple-account')) { throw "Per-account simple result missing" }
if (-not (Select-String -Path "gridium-build/styles.css" -SimpleMatch 'GRID_ALPHA910_SIMPLE_RESULT_LABELS')) { throw "Simple result styles missing" }
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
