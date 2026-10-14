$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
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
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
  }
  node ./alpha116-benchmark.js ./gridium-build after ./alpha116-after.json
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 optimized dispatch benchmark failed' }
  node ./alpha112-benchmark.js ./gridium-build
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.6 performance guard failed' }
  Write-Host 'Gridium Alpha 11.6 Lightning Latency & Precision assembled.'
}
finally {
  if ($null -eq $previousBenchmarkEvents) { Remove-Item Env:SNIPER_BENCH_EVENTS -ErrorAction SilentlyContinue }
  else { $env:SNIPER_BENCH_EVENTS = $previousBenchmarkEvents }
}
