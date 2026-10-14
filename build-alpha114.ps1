$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha113.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.3 base build failed' }
node ./alpha114-long-session.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.4 long-session patch failed' }
Copy-Item -Force ./alpha114-src/test/*.test.js ./gridium-build/test/
foreach ($name in @('main.js','remote-sync.js','renderer.js','preload.js','network-inspector.js','sniper-runtime.js','shiny-telemetry.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
}
node ./alpha112-benchmark.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.4 performance guard failed' }
Write-Host 'Gridium Alpha 11.4 Long Session Stability assembled.'
