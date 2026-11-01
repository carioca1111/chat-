#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/.otweb"
exec npm run preview -- --host 0.0.0.0 --port "${PORT:-10000}"
