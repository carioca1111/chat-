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
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch 'GRID_POPULAR_EDITION=true')) { throw "Popular main marker missing" }

Get-ChildItem gridium-build -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
Write-Host "Gridium Popular 1.0.0 assembled successfully."
