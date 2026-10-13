$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
./build-alpha911.ps1
node apply-alpha912.js gridium-build
Get-ChildItem gridium-build -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
