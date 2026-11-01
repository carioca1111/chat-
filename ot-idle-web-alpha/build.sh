#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.otweb"
UPSTREAM_COMMIT="f81c4961f63ad4c46ab711b3afec2fd28a625ea5"

rm -rf "$WORK"
git clone --depth 1 https://github.com/davideluque/otclient-web.git "$WORK"
cd "$WORK"
git fetch --depth 1 origin "$UPSTREAM_COMMIT"
git checkout "$UPSTREAM_COMMIT"

node "$ROOT/ot-idle-web-alpha/generate-assets.mjs" "$WORK/public/assets/760"
node "$ROOT/ot-idle-web-alpha/patch.mjs" "$WORK"

npm ci
npm run build

echo "[build] Ascension OT Idle browser Alpha 0.1 ready"
