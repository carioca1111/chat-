$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha916.ps1
node ./alpha10-hotfix.js prepare ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 10.3 base preparation failed' }
node ./apply-alpha10.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 10 Shiny integration failed' }
node ./alpha10-freeze-save.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 10.3 Shiny persistence optimization failed' }
node ./alpha10-hotfix.js finalize ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 10.3 navigation cleanup failed' }
foreach ($name in @('main.js','renderer.js','preload.js','network-inspector.js','shiny-telemetry.js','shiny-ui.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
}
