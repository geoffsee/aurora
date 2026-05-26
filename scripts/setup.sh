#!/usr/bin/env bash
# One-command onboarding: installs all dependencies and verifies the toolchain.
#
# Run via: bun run setup
#
# Steps:
#   1. bun install (npm deps + git hooks via postinstall)
#   2. Verify wasm-bindgen-cli version matches the pinned WASM_BINDGEN_VERSION

set -euo pipefail

WASM_BINDGEN_VERSION="$(awk -F'"' '/^wasm-bindgen = /{print $2; exit}' Cargo.toml)"

log()  { printf '\n\033[1;36m[setup] %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m[setup] %s\033[0m\n' "$*"; }
err()  { printf '\033[1;31m[setup] %s\033[0m\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# Step 1: install Node/Bun dependencies
# ---------------------------------------------------------------------------
log "bun install"
bun install

# ---------------------------------------------------------------------------
# Step 2: verify wasm-bindgen-cli version
# ---------------------------------------------------------------------------
log "checking wasm-bindgen-cli version"

if ! command -v wasm-bindgen &>/dev/null; then
    err "wasm-bindgen not found."
    err "Install the pinned version with:"
    err "  cargo install wasm-bindgen-cli --version ${WASM_BINDGEN_VERSION} --locked"
    exit 1
fi

installed="$(wasm-bindgen --version | awk '{print $2}')"

if [[ "${installed}" != "${WASM_BINDGEN_VERSION}" ]]; then
    err "wasm-bindgen-cli version mismatch."
    err "  Expected : ${WASM_BINDGEN_VERSION}"
    err "  Installed: ${installed}"
    err "Fix with:"
    err "  cargo install wasm-bindgen-cli --version ${WASM_BINDGEN_VERSION} --locked"
    exit 1
fi

ok "wasm-bindgen-cli ${installed} ✓"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
printf '\n\033[1;32m[setup] Setup complete. You are ready to develop.\033[0m\n'
printf '\033[1;32m[setup] Try: bun run dev\033[0m\n\n'
