$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$target = Join-Path $PWD 'gridium-build'
$compiler = Get-Command g++ -ErrorAction SilentlyContinue
if (-not $compiler) { throw 'MinGW g++ is required to build the Alpha 9.13 C++ engine' }
$nodeCompiler = Join-Path $target 'node_modules/.bin/tsc.cmd'
if (-not (Test-Path $nodeCompiler)) { $nodeCompiler = Join-Path $target 'node_modules/.bin/tsc' }
if (-not (Test-Path $nodeCompiler)) { throw 'TypeScript compiler missing; install Gridium dependencies first' }
New-Item -ItemType Directory -Force -Path (Join-Path $target 'sniper'),(Join-Path $target 'sniper-native') | Out-Null
& $nodeCompiler --target es2020 --module commonjs --lib es2020 --skipLibCheck --outDir (Join-Path $target 'sniper') (Join-Path $PWD 'sniper-src/engine.ts')
if ($LASTEXITCODE -ne 0) { throw 'TypeScript Sniper engine compilation failed' }
$exe = Join-Path $target 'sniper-native/sniper-core.exe'
& $compiler.Source -std=c++17 -O2 -DNDEBUG -static -static-libgcc -static-libstdc++ (Join-Path $PWD 'sniper-native/sniper.cpp') -o $exe
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) { throw 'C++ Sniper engine compilation failed' }
