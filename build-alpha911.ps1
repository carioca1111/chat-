$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$parts = Get-ChildItem "gridium-ci/source.*.b64" | Sort-Object Name
if ($parts.Count -ne 10) { throw "Expected 10 source chunks, found $($parts.Count)" }
$b64 = ($parts | ForEach-Object { Get-Content $_.FullName -Raw }) -join ''
[IO.File]::WriteAllBytes("Gridium-source.zip", [Convert]::FromBase64String($b64))
New-Item -ItemType Directory -Force -Path "gridium-build" | Out-Null
Expand-Archive -Path "Gridium-source.zip" -DestinationPath "gridium-build" -Force
node gridium-desktop/apply-alpha4.js gridium-build
node gridium-desktop/apply-alpha5.js gridium-build
node apply-alpha61.js gridium-build
node apply-alpha62.js gridium-build
node apply-alpha7.js gridium-build
node apply-alpha71-fixed.js gridium-build
node apply-alpha8.js gridium-build
node apply-alpha81.js gridium-build
node apply-alpha82.js gridium-build
node apply-alpha83.js gridium-build
node apply-alpha84.js gridium-build
node apply-alpha85.js gridium-build
node apply-alpha86.js gridium-build
node apply-alpha87.js gridium-build
node apply-alpha88.js gridium-build
node apply-alpha90.js gridium-build
node apply-alpha91.js gridium-build
node apply-alpha92.js gridium-build
git show c16e2c3226dc5518304a939afd6b74aec76bc907:apply-alpha93.js | Set-Content -Encoding utf8 apply-alpha93-valid.js
node alpha93-repair-crlf.js apply-alpha93-valid.js apply-alpha93-runtime.js
node apply-alpha93-runtime.js gridium-build
node apply-alpha94.js gridium-build
node apply-alpha95.js gridium-build
node apply-alpha96.js gridium-build

node apply-alpha97.js gridium-build
node apply-alpha98.js gridium-build
node apply-alpha99.js gridium-build
node apply-alpha910.js gridium-build
node apply-alpha911.js gridium-build

Get-ChildItem gridium-build -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
