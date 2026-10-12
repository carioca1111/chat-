$ErrorActionPreference = 'Stop'
./build-alpha910.ps1
node apply-alpha911.js gridium-build
if ((Get-Content "gridium-build/package.json" -Raw) -notmatch '3.0.0-alpha.9.11') { throw "Alpha 9.11 version missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch 'recoverUnlistedPositionsTick')) { throw "Listing recovery missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch 'listingRecoveryTimer')) { throw "Listing recovery timer missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch 'resalePending:true')) { throw "Non-fatal resale recovery missing" }
if (-not (Select-String -Path "gridium-build/alpha-engine.js" -SimpleMatch 'updatePositionMetadata')) { throw "Position listing metadata missing" }
if (-not (Select-String -Path "gridium-build/index.html" -SimpleMatch 'id="liveEcoMode"')) { throw "Live Eco option missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "layout==='focus'?30:20")) { throw "Live Eco FPS caps missing" }
if (-not (Select-String -Path "gridium-build/renderer.js" -SimpleMatch 'SEM ANÚNCIO')) { throw "Listing health UI missing" }
if (-not (Select-String -Path "gridium-build/styles.css" -SimpleMatch 'GRID_ALPHA911_LISTING_RECOVERY_LIVE_ECO')) { throw "Alpha 9.11 CSS missing" }
node --check gridium-build/main.js
node --check gridium-build/renderer.js
node --check gridium-build/alpha-engine.js
node --check gridium-build/preload.js
Push-Location gridium-build
npm test
npm run dist:win
Pop-Location
