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
node apply-alpha92.js gridium-build
git show c16e2c3226dc5518304a939afd6b74aec76bc907:apply-alpha93.js | Set-Content -Encoding utf8 apply-alpha93-valid.js
node alpha93-repair-crlf.js apply-alpha93-valid.js apply-alpha93-runtime.js
node apply-alpha93-runtime.js gridium-build
node apply-alpha94.js gridium-build
node apply-alpha95.js gridium-build
node apply-alpha96.js gridium-build
node apply-alpha97.js gridium-build
if ((Get-Content "gridium-build/package.json" -Raw) -notmatch '3.0.0-alpha.9.7') { throw "Alpha 9.7 version missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch 'marketCatalog')) { throw "Global Market catalog missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "t:'market.especies'")) { throw "Pokemon species scanner missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch "t:'market.listar'")) { throw "Pokemon listing scanner missing" }
if (-not (Select-String -Path "gridium-build/main.js" -SimpleMatch 'ensureMarketActiveSlots')) { throw "Multi-account Market group missing" }
if (-not (Select-String -Path "gridium-build/index.html" -SimpleMatch 'alphaMarketConcurrency')) { throw "Market concurrency selector missing" }
if (-not (Select-String -Path "gridium-build/network-inspector.js" -SimpleMatch 'setFocusSlots')) { throw "Multi-focus NetworkInspector missing" }
if (-not (Select-String -Path "gridium-build/alpha-engine.js" -SimpleMatch 'marketConcurrency')) { throw "Persisted market concurrency setting missing" }
node --check gridium-build/main.js
node --check gridium-build/renderer.js
node --check gridium-build/network-inspector.js
node --check gridium-build/alpha-core-process.js
node --check gridium-build/alpha-engine.js
Push-Location gridium-build
npm install --no-audit --no-fund
npm test
npm run dist:win
Pop-Location
