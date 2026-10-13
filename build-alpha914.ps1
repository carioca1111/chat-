$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha913.ps1
node ./alpha914-benchmark.js ./gridium-build baseline-9.13
if ($LASTEXITCODE -ne 0) { throw 'Baseline Alpha 9.13 benchmark failed' }
node ./apply-alpha914.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 9.14 patch failed' }
node ./alpha914-benchmark.js ./gridium-build optimized-9.14
if ($LASTEXITCODE -ne 0) { throw 'Optimized Alpha 9.14 benchmark failed' }
node --check ./gridium-build/main.js
node --check ./gridium-build/renderer.js
node --check ./gridium-build/alpha-engine.js
node --check ./gridium-build/perf-runtime.js
Write-Host 'Alpha 9.14 responsiveness patch assembled and profiled.'
