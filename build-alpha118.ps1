$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha116.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 base failed' }
node ./alpha116-benchmark.js ./gridium-build before ./alpha118-before.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8 baseline benchmark failed' }
$bg='./gridium-build/assets/hunt/backgrounds'
New-Item -ItemType Directory -Force -Path $bg | Out-Null
Copy-Item ./alpha118-assets/backgrounds/*.webp $bg
node ./apply-alpha117.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 visual base failed' }
node ./alpha117-harden-isolation.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 isolation hardening failed' }
node ./apply-alpha118.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8 visual integration failed' }
node ./alpha1181-runtime-fix.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.1 runtime fallback failed' }
Copy-Item -Force ./alpha1181-src/test/hunt-runtime-fallback.test.js ./gridium-build/test/
node ./alpha116-benchmark.js ./gridium-build after ./alpha118-after.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.1 optimized benchmark failed' }
foreach ($name in @('main.js','renderer.js','hunt-visual-store.js','hunt-visual-model.js','hunt-visual.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax: $name" }
}
Write-Host 'Gridium Alpha 11.8.1 Hunt Runtime Fix assembled.'
