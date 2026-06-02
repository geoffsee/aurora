#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${BRIDGE_OUT_DIR:-$ROOT/dist/desktop}"
mkdir -p "$OUT_DIR"

if [[ "${OS:-}" == "Windows_NT" || "$(uname -s 2>/dev/null || echo)" == MINGW* ]]; then
	OUTFILE="$OUT_DIR/bevyosc-bridge.exe"
else
	OUTFILE="$OUT_DIR/bevyosc-bridge"
fi

cd "$ROOT"

if [[ -n "${BUN_COMPILE_TARGET:-}" ]]; then
	bun build --compile --minify --target="$BUN_COMPILE_TARGET" index.ts --outfile "$OUTFILE"
else
	bun build --compile --minify index.ts --outfile "$OUTFILE"
fi

echo "built bridge: $OUTFILE"
