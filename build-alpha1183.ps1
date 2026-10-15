param(
  [switch]$PreparedBase,
  [switch]$SkipBefore
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot

if (-not $PreparedBase) {
  ./build-alpha1182.ps1
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.2 exact base build failed' }
}

$pkg = Get-Content './gridium-build/package.json' -Raw | ConvertFrom-Json
if ($pkg.version -ne '3.0.0-alpha.11.8.2') { throw "Expected prepared Alpha 11.8.2, got $($pkg.version)" }

if (-not $SkipBefore) {
  node ./alpha1183-hunt-benchmark.js ./gridium-build before ./gridium-build/alpha1183-hunt-before.json
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.2 Hunt baseline benchmark failed' }
  node ./alpha1183-main-inventory.js ./gridium-build ./gridium-build/alpha1183-main-inventory-before.json
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.2 main-process inventory failed' }
}

node ./alpha1183-apply.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.3 hardening patch failed' }

foreach ($name in @('hunt-visual-store.js','hunt-visual-model.js','hunt-render-scheduler.js','hunt-visual.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Alpha 11.8.3 syntax check failed: $name" }
}

node --test --test-timeout=30000 ./gridium-build/test/hunt-performance-hardening.test.js ./gridium-build/test/hunt-performance-type-bg.test.js
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.3 focused Hunt tests failed' }

node ./alpha1183-hunt-benchmark.js ./gridium-build after ./gridium-build/alpha1183-hunt-after.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.3 Hunt optimized benchmark failed' }

node --expose-gc ./alpha1183-long-session.js ./gridium-build ./gridium-build/alpha1183-long-session.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.3 24h synthetic long-session guard failed' }

node ./alpha1183-main-inventory.js ./gridium-build ./gridium-build/alpha1183-main-inventory-after.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.3 main-process inventory failed' }

$pkg = Get-Content './gridium-build/package.json' -Raw | ConvertFrom-Json
if ($pkg.version -ne '3.0.0-alpha.11.8.3') { throw "Alpha 11.8.3 version mismatch after patch: $($pkg.version)" }
Write-Host 'Gridium Alpha 11.8.3 Performance Hardening assembled and focused guards passed.'
