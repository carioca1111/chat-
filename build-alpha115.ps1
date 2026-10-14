$ErrorActionPreference = 'Stop'

./build-alpha114.ps1
node ./alpha115-integrity-fixes.js ./gridium-build

$testDir = './gridium-build/test'
New-Item -ItemType Directory -Force -Path $testDir | Out-Null
Copy-Item -Force './alpha115-src/test/integrity-fixes.test.js' "$testDir/alpha115-integrity-fixes.test.js"

# Version-only expectations from the previous release are normalized; behavioral assertions are unchanged.
Get-ChildItem $testDir -Filter '*.test.js' | ForEach-Object {
  $text = Get-Content $_.FullName -Raw
  $next = $text.Replace('3.0.0-alpha.11.4','3.0.0-alpha.11.5')
  if ($next -ne $text) { Set-Content -Path $_.FullName -Value $next -NoNewline -Encoding UTF8 }
}

$jsFiles = @('main.js','network-inspector.js','hunt-intelligence.js','collector.js','alpha-analysis-worker.js','sniper-runtime.js','sniper-ui.js')
foreach ($f in $jsFiles) { node --check (Join-Path './gridium-build' $f) }

# Same-process synthetic guard: Alpha 11.5 must not materially regress the Lightning decision runtime.
node ./alpha112-benchmark.js ./gridium-build

Write-Host 'Gridium Alpha 11.5 Integrity Fixes assembled.'
