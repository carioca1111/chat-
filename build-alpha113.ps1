$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha112.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 base build failed' }
node ./alpha113-mobile-bridge.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.3 Mobile Command Center bridge failed' }
Copy-Item -Force ./alpha113-src/test/*.test.js ./gridium-build/test/
foreach ($name in @('main.js','remote-sync.js','renderer.js','preload.js','sniper-runtime.js','shiny-telemetry.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
}
node ./alpha112-benchmark.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.3 post-bridge performance guard failed' }
Write-Host 'Gridium Alpha 11.3 Mobile Command Center assembled.'
