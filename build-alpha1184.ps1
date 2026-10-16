param([switch]$PreparedBase)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
Set-Location $PSScriptRoot
if (-not $PreparedBase) { ./build-alpha1183.ps1 }
node ./alpha1184-apply.js ./gridium-build
node --check ./gridium-build/renderer.js
node --test ./gridium-build/test/accounts-workspace.test.js
