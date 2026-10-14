$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot

./build-alpha116.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 base build failed' }

node ./alpha117-benchmark.js ./gridium-build before ./alpha117-before.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 baseline Hunt benchmark failed' }

$parts = Get-ChildItem './alpha117-assets/hunt-backgrounds.b64' -Filter 'part*' | Sort-Object Name
if ($parts.Count -lt 2) { throw 'Alpha 11.7: pacote de fundos incompleto' }
$zip = Join-Path $env:TEMP 'gridium-alpha117-hunt-backgrounds.zip'
$stream = [IO.File]::Open($zip, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
function Write-Base64Blocks([string]$raw, [string]$label, $target) {
  $text = ($raw -replace '[^A-Za-z0-9+/=]', '').Trim()
  if (-not $text) { throw "Alpha 11.7: chunk vazio $label" }
  $start = 0
  for ($i = 0; $i -lt $text.Length; $i++) {
    if ($text[$i] -ne '=') { continue }
    while (($i + 1) -lt $text.Length -and $text[$i + 1] -eq '=') { $i++ }
    $segment = $text.Substring($start, $i - $start + 1)
    try { $bytes = [Convert]::FromBase64String($segment) }
    catch { throw "Alpha 11.7: Base64 inválido em $label bloco iniciado em $start`: $($_.Exception.Message)" }
    $target.Write($bytes, 0, $bytes.Length)
    $start = $i + 1
  }
  if ($start -lt $text.Length) {
    $segment = $text.Substring($start)
    $pad = (4 - ($segment.Length % 4)) % 4
    if ($pad -gt 0) { $segment += ('=' * $pad) }
    try { $bytes = [Convert]::FromBase64String($segment) }
    catch { throw "Alpha 11.7: Base64 final inválido em $label`: $($_.Exception.Message)" }
    $target.Write($bytes, 0, $bytes.Length)
  }
}
try {
  foreach ($part in $parts) { Write-Base64Blocks (Get-Content $part.FullName -Raw) $part.Name $stream }
}
finally { $stream.Dispose() }
if (Test-Path './alpha117-assets/hunt-backgrounds.sha256') {
  $manifest = (Get-Content './alpha117-assets/hunt-backgrounds.sha256' -Raw).Trim().Split()[0].ToLowerInvariant()
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $manifest) { throw "Alpha 11.7: hash do pacote de fundos divergente: esperado=$manifest atual=$actual" }
}
$bg = './gridium-build/assets/hunt/backgrounds'
New-Item -ItemType Directory -Force -Path $bg | Out-Null
Expand-Archive -Path $zip -DestinationPath $bg -Force
Remove-Item $zip -Force -ErrorAction SilentlyContinue

node ./apply-alpha117.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 Hunt visual patch failed' }
node ./alpha117-harden-isolation.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 current-Pokemon isolation hardening failed' }

foreach ($name in @('main.js','sniper-runtime.js','hunt-intelligence.js','hunt-visual-model.js','hunt-visual.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
}
node ./alpha117-benchmark.js ./gridium-build after ./alpha117-after.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 optimized Hunt benchmark failed' }
node ./alpha112-benchmark.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 Sniper performance guard failed' }
Write-Host 'Gridium Alpha 11.7 Hunt Intelligence Visual assembled.'
