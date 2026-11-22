#!/usr/bin/env bash
# Start a bxapi server for bxvtt development, in anonymous local mode with its own database.
# Usage: scripts/dev-bxapi.sh [port]   (default port: 8651)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BXAPI_DIR="${BXAPI_DIR:-$HOME/repos/bxapi}"
PORT="${1:-${BXAPI_PORT:-8651}}"
mkdir -p "$ROOT/.data"
cd "$BXAPI_DIR"
exec env BXAPI_PORT="$PORT" BXAPI_DATABASE="${BXAPI_DATABASE:-$ROOT/.data/bxapi-dev-$PORT.db}" BXAPI_ALLOW_ANONYMOUS=true BXAPI_RATE_LIMIT_PER_MINUTE=0 uv run bxapi
