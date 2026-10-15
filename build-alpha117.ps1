$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot

./build-alpha116.ps1
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 base build failed' }
node ./alpha117-benchmark.js ./gridium-build before ./alpha117-before.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 baseline Hunt benchmark failed' }

# The historical staging was split as text and lost the ZIP central directory.
# Rebuild the byte stream only as a carrier, then recover local ZIP records and
# accept an asset solely when its SHA-256 exactly matches the user-supplied WebP.
$parts = Get-ChildItem './alpha117-assets/hunt-backgrounds.b64' -Filter 'part*' | Sort-Object Name
if ($parts.Count -lt 2) { throw 'Alpha 11.7: pacote de fundos incompleto' }
$joined = [Text.StringBuilder]::new()
foreach ($part in $parts) {
  $clean = ((Get-Content $part.FullName -Raw) -replace '[^A-Za-z0-9+/=]', '')
  if (-not $clean) { throw "Alpha 11.7: chunk vazio $($part.Name)" }
  [void]$joined.Append($clean)
}
$text = $joined.ToString()
$carrier = Join-Path $env:TEMP 'gridium-alpha117-hunt-backgrounds.bin'
$stream = [IO.File]::Open($carrier,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
  $start=0
  for($i=0;$i -lt $text.Length;$i++){
    if($text[$i] -ne '='){continue}
    while(($i+1)-lt $text.Length -and $text[$i+1]-eq '='){$i++}
    $segment=$text.Substring($start,$i-$start+1)
    try{$bytes=[Convert]::FromBase64String($segment)}catch{throw "Alpha 11.7: Base64 inválido no bloco iniciado em $start`: $($_.Exception.Message)"}
    $stream.Write($bytes,0,$bytes.Length);$start=$i+1
  }
  if($start -lt $text.Length){
    $segment=$text.Substring($start);$pad=(4-($segment.Length%4))%4
    if($pad -eq 3){throw 'Alpha 11.7: stream Base64 truncado no final'}
    if($pad -gt 0){$segment+=('='*$pad)}
    $bytes=[Convert]::FromBase64String($segment);$stream.Write($bytes,0,$bytes.Length)
  }
}finally{$stream.Dispose()}
$bg='./gridium-build/assets/hunt/backgrounds'
New-Item -ItemType Directory -Force -Path $bg | Out-Null
node ./alpha117-recover-assets.js $carrier $bg
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7: recuperação/validação dos fundos falhou' }
Remove-Item $carrier -Force -ErrorAction SilentlyContinue

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
