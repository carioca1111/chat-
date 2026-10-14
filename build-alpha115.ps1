$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot
$previousBenchmarkEvents = $env:SNIPER_BENCH_EVENTS
$env:SNIPER_BENCH_EVENTS = '120000'
try {
  ./build-alpha114.ps1
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.4 base build failed' }
  node ./apply-alpha115.js ./gridium-build
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.5 audit fixes patch failed' }
  if (-not (Test-Path './gridium-build/test')) { New-Item -ItemType Directory -Path './gridium-build/test' | Out-Null }
  Copy-Item -Force ./alpha115-src/test/*.test.js ./gridium-build/test/
  foreach ($name in @('main.js','network-inspector.js','sniper-runtime.js','sniper-ui.js','hunt-intelligence.js','collector.js','alpha-analysis-worker.js','alpha-engine.js')) {
    node --check (Join-Path './gridium-build' $name)
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" }
  }
  node ./alpha112-benchmark.js ./gridium-build
  if ($LASTEXITCODE -ne 0) { throw 'Alpha 11.5 performance guard failed' }
  Write-Host 'Gridium Alpha 11.5 Audit Fixes assembled.'
}
finally {
  if ($null -eq $previousBenchmarkEvents) { Remove-Item Env:SNIPER_BENCH_EVENTS -ErrorAction SilentlyContinue }
  else { $env:SNIPER_BENCH_EVENTS = $previousBenchmarkEvents }
}
