param([switch]$PreparedBase)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
Set-Location $PSScriptRoot
if (-not $PreparedBase) { ./build-alpha1185.ps1 }
node ./alpha1186-apply.js ./gridium-build
node --check ./gridium-build/main.js
node --check ./gridium-build/mirror-runtime.js
node --check ./gridium-build/mirror-publisher.js
node --test ./gridium-build/test/mirror-runtime.test.js
