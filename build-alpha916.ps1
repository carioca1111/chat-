$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha914.ps1
node ./apply-alpha916-entry.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 9.16 patch failed' }
node ./alpha916-benchmark.js
if ($LASTEXITCODE -ne 0) { throw 'Alpha 9.16 core benchmark failed' }
node --check ./gridium-build/main.js
node --check ./gridium-build/renderer.js
node --check ./gridium-build/preload.js
node --check ./gridium-build/alpha-core-process.js
node --check ./gridium-build/ultra-runtime.js
Write-Host 'Alpha 9.16 Ultra Performance assembled.'
