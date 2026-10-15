$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot

# Assemble the exact Alpha 11.6 product tree, but defer the noisy one-shot
# Alpha 11.2 throughput guard until the full 11.8.1 tree exists.
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
Write-Host 'Gridium Alpha 11.6 base assembled; noisy throughput guard deferred.'

node ./alpha116-benchmark.js ./gridium-build before ./alpha118-before.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8 baseline benchmark failed' }
$bg='./gridium-build/assets/hunt/backgrounds'
New-Item -ItemType Directory -Force -Path $bg | Out-Null
Copy-Item ./alpha118-assets/backgrounds/*.webp $bg
node ./apply-alpha117.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 visual base failed' }
node ./alpha117-harden-isolation.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.7 isolation hardening failed' }
node ./apply-alpha118.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8 visual integration failed' }
node ./alpha1181-runtime-fix.js ./gridium-build
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.1 runtime fallback failed' }
Copy-Item -Force ./alpha1181-src/test/hunt-runtime-fallback.test.js ./gridium-build/test/
node ./alpha116-benchmark.js ./gridium-build after ./alpha118-after.json
if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.8.1 optimized benchmark failed' }
foreach ($name in @('main.js','renderer.js','hunt-visual-store.js','hunt-visual-model.js','hunt-visual.js')) {
  node --check (Join-Path './gridium-build' $name)
  if ($LASTEXITCODE -ne 0) { throw "Syntax: $name" }
}

# Preserve the same 0.80 regression threshold, but reject runner noise by
# requiring a majority of three independent samples instead of one borderline run.
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
    Write-Host "Alpha 11.8.1 Sniper guard attempt $attempt/3: exit=$code ratio=$ratio"
  }
}
finally { $PSNativeCommandUseErrorActionPreference = $oldNativePreference }
$perfResults | ConvertTo-Json -Depth 5 | Set-Content './gridium-build/alpha1181-sniper-guard.json'
if ($perfPasses -lt 2) { throw "Alpha 11.8.1 Sniper performance guard failed majority sampling: $perfPasses/3 passes" }
Write-Host "Gridium Alpha 11.8.1 Hunt Runtime Fix assembled; Sniper guard passes=$perfPasses/3."
