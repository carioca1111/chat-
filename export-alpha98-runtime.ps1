$ErrorActionPreference = 'Stop'
./build-alpha98.ps1
Compress-Archive -Path gridium-build/main.js,gridium-build/renderer.js,gridium-build/index.html,gridium-build/styles.css,gridium-build/alpha-core-process.js,gridium-build/alpha-engine.js,gridium-build/network-inspector.js,gridium-build/market-protocol.js,gridium-build/preload.js,gridium-build/package.json -DestinationPath alpha98-runtime.zip -Force
