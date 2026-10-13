$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$build=Join-Path $root 'gridium-build'
& (Join-Path $root 'build-alpha916.ps1')
node (Join-Path $root 'apply-sniper-dedicated.js') $build
node (Join-Path $root 'apply-sniper-budget-persistence.js') $build
Push-Location $build
try {
  node --check main.js
  node --check preload.js
  node --check sniper-runtime.js
  node --check sniper-dedicated.js
  node --test test/sniper-dedicated.test.js test/sniper-budget-persistence.test.js
  $pkg=Get-Content package.json -Raw | ConvertFrom-Json
  if($pkg.version -ne '3.0.0-sniper.1'){ throw "Versao incorreta: $($pkg.version)" }
  if($pkg.productName -ne 'Gridium Sniper'){ throw "productName incorreto: $($pkg.productName)" }
  if((Get-Content index.html -Raw) -notmatch 'id="sniper"'){ throw 'UI dedicada nao encontrada' }
  if((Get-Content index.html -Raw) -match 'data-section="alpha">Alpha Terminal'){ throw 'Painel antigo ainda esta visivel' }
  Write-Host 'Dedicated market build validated.'
} finally { Pop-Location }
