$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location $PSScriptRoot

$attempts = @()
$ok = $false
for ($i = 1; $i -le 3; $i++) {
  Write-Host "Alpha 11.8.2 exact-base assembly attempt $i/3"
  & pwsh -NoLogo -NoProfile -File ./build-alpha1182.ps1
  $code = $LASTEXITCODE
  $guard = $null
  if (Test-Path './gridium-build/alpha1181-sniper-guard.json') {
    try { $guard = Get-Content './gridium-build/alpha1181-sniper-guard.json' -Raw | ConvertFrom-Json } catch {}
  }
  $attempts += [pscustomobject]@{
    attempt = $i
    exitCode = $code
    sniperGuard = $guard
  }
  if ($code -eq 0) { $ok = $true; break }
  Write-Warning "Exact Alpha 11.8.2 assembly attempt $i failed; retrying the unchanged base because its legacy same-process microbenchmark is noisy."
}
$attempts | ConvertTo-Json -Depth 10 | Set-Content './alpha1183-base-assembly-attempts.json'
if (-not $ok) { throw 'Exact Alpha 11.8.2 base failed all 3 unchanged assembly attempts.' }
$pkg = Get-Content './gridium-build/package.json' -Raw | ConvertFrom-Json
if ($pkg.version -ne '3.0.0-alpha.11.8.2') { throw "Exact base version mismatch after successful assembly: $($pkg.version)" }
$global:LASTEXITCODE = 0
Write-Host "Exact Alpha 11.8.2 base assembled unchanged after $($attempts.Count) attempt(s)."
