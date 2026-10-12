$ErrorActionPreference = 'Stop'
./build-alpha97.ps1
Compress-Archive -Path gridium-build/main.js,gridium-build/renderer.js,gridium-build/index.html,gridium-build/styles.css,gridium-build/alpha-core-process.js,gridium-build/alpha-engine.js,gridium-build/market-protocol.js,gridium-build/network-inspector.js,gridium-build/preload.js -DestinationPath alpha97-runtime.zip -Force
