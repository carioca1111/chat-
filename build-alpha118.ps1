$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
./build-alpha116.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 base failed' }
node ./alpha116-benchmark.js ./gridium-build before ./alpha118-before.json
$bg='./gridium-build/assets/hunt/backgrounds'
New-Item -ItemType Directory -Force -Path $bg | Out-Null
Copy-Item ./alpha118-assets/backgrounds/*.webp $bg
node ./apply-alpha117.js ./gridium-build
node ./alpha117-harden-isolation.js ./gridium-build
node ./apply-alpha118.js ./gridium-build
node ./alpha116-benchmark.js ./gridium-build after ./alpha118-after.json
foreach ($name in @('main.js','renderer.js','hunt-visual-store.js','hunt-visual-model.js','hunt-visual.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax: $name" }
}
