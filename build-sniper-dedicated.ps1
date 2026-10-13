$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
$root=$PSScriptRoot
$build=Join-Path $root 'gridium-build'
& (Join-Path $root 'build-alpha917.ps1')
node (Join-Path $root 'prepare-sniper-alpha917.js') $build
node (Join-Path $root 'apply-sniper-dedicated.js') $build
node (Join-Path $root 'apply-sniper-budget-persistence.js') $build
node (Join-Path $root 'apply-sniper-opportunities.js') $build
node (Join-Path $root 'normalize-sniper-ux3-inputs.js') $build
node (Join-Path $root 'apply-sniper-ux3.js') $build
node (Join-Path $root 'fix-sniper-ux3-test.js') $build
node (Join-Path $root 'finalize-sniper-ux3.js') $build
Push-Location $build
try {
  node --check main.js
  node --check preload.js
  node --check sniper-runtime.js
  node --check sniper-dedicated.js
  node --check opportunities-runtime.js
  node --check opportunity-model.js
  node --check opportunity-core-process.js
  node --test test/sniper-dedicated.test.js test/sniper-budget-persistence.test.js test/alpha917-opportunities.test.js test/sniper-ux3.test.js
  $pkg=Get-Content package.json -Raw | ConvertFrom-Json
  if($pkg.version -ne '3.0.0-sniper.3'){ throw "Versao incorreta: $($pkg.version)" }
  if($pkg.productName -ne 'Gridium Sniper'){ throw "productName incorreto: $($pkg.productName)" }
  $html=Get-Content index.html -Raw
  if($html -notmatch 'id="opportunities"'){ throw 'Aba Oportunidades nao encontrada' }
  if($html -notmatch 'id="sniper"'){ throw 'UI dedicada nao encontrada' }
  if($html -match 'data-section="alpha">Alpha Terminal'){ throw 'Painel antigo ainda esta visivel' }
  if(([regex]::Matches($html,'id="sniperArm"')).Count -ne 1){ throw 'Sniper deve ter um unico botao principal de ativacao' }
  $hunt=[Math]::Max($html.LastIndexOf('Hunt Intelligence',$html.IndexOf('data-section="opportunities"')),$html.LastIndexOf('Hunt Inteligente',$html.IndexOf('data-section="opportunities"')))
  $opp=$html.IndexOf('data-section="opportunities"')
  $sniper=$html.IndexOf('data-section="sniper"')
  if($hunt -lt 0 -or $opp -le $hunt -or $sniper -le $opp){ throw 'Ordem das abas deve ser Hunt -> Oportunidades -> Sniper' }
  Write-Host 'Gridium Sniper 3.0.0-sniper.3 validado: Contas inicial, um botao, compras e performance.'
} finally { Pop-Location }
