$ErrorActionPreference = 'Stop'
$parts = Get-ChildItem "gridium-ci/source.*.b64" | Sort-Object Name
if ($parts.Count -ne 10) { throw "Expected 10 source chunks, found $($parts.Count)" }
$b64 = ($parts | ForEach-Object { Get-Content $_.FullName -Raw }) -join ''
[IO.File]::WriteAllBytes("Gridium-source.zip", [Convert]::FromBase64String($b64))
Remove-Item -Recurse -Force "gridium-diag" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "gridium-diag" | Out-Null
Expand-Archive -Path "Gridium-source.zip" -DestinationPath "gridium-diag" -Force
node gridium-desktop/apply-alpha4.js gridium-diag
node gridium-desktop/apply-alpha5.js gridium-diag
node apply-alpha61.js gridium-diag
node apply-alpha62.js gridium-diag
node apply-alpha7.js gridium-diag
node apply-alpha71-fixed.js gridium-diag
node apply-alpha8.js gridium-diag
node apply-alpha81.js gridium-diag
node apply-alpha82.js gridium-diag
node apply-alpha83.js gridium-diag
node apply-alpha84.js gridium-diag
node apply-alpha85.js gridium-diag
node apply-alpha86.js gridium-diag
node apply-alpha87.js gridium-diag
node apply-alpha88.js gridium-diag
node apply-alpha90.js gridium-diag
node apply-alpha91.js gridium-diag
node apply-alpha92.js gridium-diag
git show c16e2c3226dc5518304a939afd6b74aec76bc907:apply-alpha93.js | Set-Content -Encoding utf8 apply-alpha93-valid.js
node alpha93-repair-crlf.js apply-alpha93-valid.js apply-alpha93-runtime.js
node apply-alpha93-runtime.js gridium-diag
node apply-alpha94.js gridium-diag
node apply-alpha95.js gridium-diag
node apply-alpha96.js gridium-diag
node apply-alpha97.js gridium-diag
$src = Get-Content "gridium-diag/alpha-engine.js" -Raw
$needles = @('evaluate(listing','fairValue(','repricingPreview(','feePct','minRoi','minAlpha','confidence')
foreach ($n in $needles) {
  Write-Host "===== $n ====="
  $idx = $src.IndexOf($n)
  if ($idx -lt 0) { Write-Host 'NOT FOUND'; continue }
  $start = [Math]::Max(0,$idx-1200)
  $len = [Math]::Min(5000,$src.Length-$start)
  Write-Host $src.Substring($start,$len)
}
