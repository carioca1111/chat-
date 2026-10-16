param([switch]$PreparedBase)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
Set-Location $PSScriptRoot
if (-not $PreparedBase) { ./build-alpha1184.ps1 }
node ./alpha1185-apply.js ./gridium-build
node --check ./gridium-build/main.js
node --check ./gridium-build/renderer.js
node --test ./gridium-build/test/click-freeze-hotfix.test.js
