$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot

./build-alpha118.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.1 base build failed' }

node ./alpha1182-hunt-perf-type-bg.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.2 Hunt performance/type background patch failed' }

Copy-Item -Force ./alpha1182-src/test/*.test.js ./gridium-build/test/
node ./alpha1182-test-contracts.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.2 regression contract normalization failed' }

foreach ($name in @('hunt-visual-model.js','hunt-visual.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Alpha 11.8.2 syntax check failed: $name" }
}

node --test --test-timeout=30000 ./gridium-build/test/hunt-performance-type-bg.test.js
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.2 Hunt performance/type background tests failed' }

Write-Host 'Gridium Alpha 11.8.2 Hunt Performance + Type Background assembled.'
