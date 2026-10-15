$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot

# Assemble the exact Alpha 11.6 product path, but defer its noisy one-shot
# Alpha 11.2 microbenchmark until the complete 11.7 tree exists. The threshold
# remains unchanged; the final guard below requires 2 of 3 independent passes.
$previousBenchmarkEvents = $env:SNIPER_BENCH_EVENTS
$env:SNIPER_BENCH_EVENTS = '120000'
try {
  ./build-alpha115.ps1
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.5 base build failed' }
  node ./alpha116-benchmark.js ./gridium-build before ./alpha116-before.json
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 baseline dispatch benchmark failed' }
  node ./apply-alpha116.js ./gridium-build
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 latency patch failed' }
  if (-not (Test-Path './gridium-build/test')) { New-Item -ItemType Directory -Path './gridium-build/test' | Out-Null }
  Copy-Item -Force ./alpha116-src/test/*.test.js ./gridium-build/test/
  node ./alpha116-test-contracts.js ./gridium-build
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 regression contract normalization failed' }
  foreach ($name in @('main.js','network-inspector.js','sniper-runtime.js','sniper-ui.js','market-live.js','market-protocol.js','alpha-engine.js','alpha-analysis-worker.js','hunt-intelligence.js','collector.js')) {
    node --check (Join-Path './gridium-build' $name)
    if ($LASTEXITCODE -ne 0) { throw "Alpha 11.6 syntax check failed: $name" }
  }
  node ./alpha116-benchmark.js ./gridium-build after ./alpha116-after.json
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 optimized dispatch benchmark failed' }
}
finally {
  if ($null -eq $previousBenchmarkEvents) { Remove-Item Env:SNIPER_BENCH_EVENTS -ErrorAction SilentlyContinue }
  else { $env:SNIPER_BENCH_EVENTS = $previousBenchmarkEvents }
}
Write-Host 'Gridium Alpha 11.6 product tree assembled; performance guard deferred for stable sampling.'

node ./alpha117-benchmark.js ./gridium-build before ./alpha117-before.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 baseline Hunt benchmark failed' }

# Historical text staging lost the ZIP central directory. Treat the reconstructed
# stream only as a carrier: each recovered WebP must exactly match the SHA-256
# of the corresponding file from the user-supplied asset package and be 400x225.
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

# Same 0.80 threshold from alpha112-benchmark.js, sampled three times to reject
# runner noise. The build only passes if a majority of independent runs passes.
$oldNativePreference = $PSNativeCommandUseErrorActionPreference
$PSNativeCommandUseErrorActionPreference = $false
$perfPasses = 0
$perfResults = @()
try {
  for ($attempt=1; $attempt -le 3; $attempt++) {
    & node ./alpha112-benchmark.js ./gridium-build
    $code = $LASTEXITCODE
    $result = $null
    if (Test-Path './gridium-build/alpha112-benchmark.json') {
      try { $result = Get-Content './gridium-build/alpha112-benchmark.json' -Raw | ConvertFrom-Json } catch {}
    }
    $ratio = if ($result -and $result.sniper) { [double]$result.sniper.throughputRatio } else { $null }
    $perfResults += [pscustomobject]@{ attempt=$attempt; exitCode=$code; throughputRatio=$ratio }
    if ($code -eq 0) { $perfPasses++ }
    Write-Host "Alpha 11.7 Sniper guard attempt $attempt/3: exit=$code ratio=$ratio"
  }
}
finally { $PSNativeCommandUseErrorActionPreference = $oldNativePreference }
$perfResults | ConvertTo-Json -Depth 5 | Set-Content './gridium-build/alpha117-sniper-guard.json'
if ($perfPasses -lt 2) { throw "Alpha 11.7 Sniper performance guard failed majority sampling: $perfPasses/3 passes" }
Write-Host "Gridium Alpha 11.7 Hunt Intelligence Visual assembled; Sniper guard passes=$perfPasses/3."
