$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
./build-alpha913.ps1
node ./alpha914-benchmark.js ./gridium-build baseline-9.13
node ./apply-alpha914.js ./gridium-build
node ./alpha914-benchmark.js ./gridium-build optimized-9.14
node --check ./gridium-build/main.js
node --check ./gridium-build/renderer.js
node --check ./gridium-build/alpha-engine.js
node --check ./gridium-build/perf-runtime.js
Write-Host 'Alpha 9.14 responsiveness patch assembled and profiled.'
