$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha11.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.1 base build failed' }
node ./alpha112-publisher-compat.js ./gridium-build pre
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 publisher pre-normalization failed' }
node ./alpha112-core-performance.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 core performance patch failed' }
node ./alpha112-publisher-compat.js ./gridium-build post
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 publisher coalescing restore failed' }
node ./alpha112-sniper-events.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 Sniper event patch failed' }
node ./alpha112-persistence.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 async persistence patch failed' }
node ./alpha112-hunt-accountstate.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 Hunt/AccountState patch failed' }
node ./alpha112-dashboard-diff.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 Dashboard DOM diff patch failed' }
node ./alpha112-finalize.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 finalizer failed' }
Copy-Item -Force ./alpha112-src/test/*.test.js ./gridium-build/test/
foreach ($name in @('main.js','renderer.js','preload.js','network-inspector.js','sniper-runtime.js','shiny-telemetry.js','shiny-ui.js','asset-resolver.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
}
node ./alpha112-benchmark.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.2 structural benchmark failed' }
Write-Host 'Gridium Alpha 11.2 Performance Cleanup assembled.'
