#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.otweb"
UPSTREAM_COMMIT="f81c4961f63ad4c46ab711b3afec2fd28a625ea5"
ASSET_VERSION="ascension02b"

rm -rf "$WORK"
git clone --depth 1 https://github.com/davideluque/otclient-web.git "$WORK"
cd "$WORK"
git fetch --depth 1 origin "$UPSTREAM_COMMIT"
git checkout "$UPSTREAM_COMMIT"

node "$ROOT/ot-idle-web-alpha/generate-assets.mjs" "$WORK/public/assets/$ASSET_VERSION"
node "$ROOT/ot-idle-web-alpha/patch.mjs" "$WORK"
node "$ROOT/ot-idle-web-alpha/fix-runtime.mjs" "$WORK"

export VITE_CLIENT_VERSION="$ASSET_VERSION"
npm ci
npm run build

echo "[build] Ascension OT Idle browser Alpha 0.2b ready"
