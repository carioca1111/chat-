$ErrorActionPreference='Stop'
& "$PSScriptRoot/build-alpha916.ps1"
node "$PSScriptRoot/apply-alpha917.js" "$PSScriptRoot/gridium-build"
Write-Host 'Alpha 9.17 Opportunities assembled.'
