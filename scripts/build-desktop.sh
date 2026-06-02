#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

case "$(uname -s)-$(uname -m)" in
Darwin-arm64) PLATFORM="${PLATFORM:-macos-aarch64}" ;;
Darwin-x86_64) PLATFORM="${PLATFORM:-macos-x64}" ;;
Linux-x86_64 | Linux-amd64) PLATFORM="${PLATFORM:-linux-x64}" ;;
MINGW*-x86_64 | MINGW*-aarch64 | *-NT-*)
	PLATFORM="${PLATFORM:-windows-x64}"
	;;
*)
	echo "unsupported host for local desktop packaging: $(uname -s)-$(uname -m)" >&2
	echo "set PLATFORM explicitly (macos-aarch64|macos-x64|linux-x64|windows-x64)" >&2
	exit 1
	;;
esac

bun run build:web
bash scripts/build-bridge.sh
CARGO_TARGET_DIR=target-launcher cargo build --release -p bevyosc-launcher
bash scripts/package-desktop.sh "$PLATFORM"
