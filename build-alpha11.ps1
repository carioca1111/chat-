$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha10.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 10.4 base build failed' }
node ./prepare-sniper-assets.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Local Sniper sprite preparation failed' }
node ./apply-alpha11-sniper.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11 Market Sniper integration failed' }
node ./alpha11-runtime-optimize.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11 Lightning runtime optimization failed' }
node ./alpha11-ui-hotfix.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11 Sniper UI hotfix failed' }
Copy-Item -Force ./alpha11-sniper-src/test/*.test.js ./gridium-build/test/
foreach ($name in @('main.js','renderer.js','preload.js','network-inspector.js','sniper-runtime.js','sniper-ui.js','asset-resolver.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
}
node ./alpha11-sniper-benchmark.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11 Lightning benchmark failed' }
Write-Host 'Gridium Alpha 11 Market Sniper assembled.'
