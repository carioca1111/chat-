$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

./build-alpha911.ps1
node apply-popular.js gridium-build

$pkg = Get-Content "gridium-build/package.json" -Raw
if ($pkg -notmatch '"name"\s*:\s*"gridium-popular"') { throw "Popular package name missing" }
if ($pkg -notmatch '"productName"\s*:\s*"Gridium Popular"') { throw "Popular product name missing" }
if ($pkg -notmatch '"version"\s*:\s*"1.0.0"') { throw "Popular version missing" }
if (-not (Select-String -Path "gridium-build/styles.css" -SimpleMatch 'GRID_POPULAR_EDITION_LOCK')) { throw "Popular Alpha lock CSS missing" }
if (-not (Select-String -Path "gridium-build/index.html" -SimpleMatch 'gridium-popular-lock')) { throw "Popular Alpha lock script missing" }
if (-not (Select-String -Path "gridium-build/renderer.js" -SimpleMatch 'GRID_POPULAR_EDITION=true')) { throw "Popular renderer marker missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "app.setName('Gridium Popular')")) { throw "Popular app identity missing" }
if (-not (Select-String -Path "gridium-build/alpha-engine.js" -SimpleMatch "alphaTerminal:false")) { throw "Alpha engine was not stripped" }
if (Select-String -Path "gridium-build/alpha-analysis-worker.js" -SimpleMatch 'alpha_market') { throw "Alpha analysis logic still present" }
if (Select-String -Path "gridium-build/market-live.js" -SimpleMatch 'market.comprar') { throw "Live Market command logic still present" }
if ((Get-Item "gridium-build/alpha-engine.js").Length -gt 6000) { throw "Alpha engine unexpectedly large" }
if ((Get-Item "gridium-build/alpha-core-process.js").Length -gt 2500) { throw "Alpha core unexpectedly large" }
if ((Get-Item "gridium-build/alpha-analysis-worker.js").Length -gt 1000) { throw "Alpha analysis worker unexpectedly large" }

Get-ChildItem gridium-build -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
Write-Host "Gridium Popular 1.0.0 pure edition assembled successfully."
