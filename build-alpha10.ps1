$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha917.ps1
node ./apply-alpha10.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 10 integration failed' }
foreach ($name in @('main.js','renderer.js','preload.js','network-inspector.js','shiny-telemetry.js','shiny-ui.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
}
