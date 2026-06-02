#!/usr/bin/env bash
# Wrapper for the project's Rust test suites.
#
# Every cargo invocation is listed explicitly so additions and removals are
# obvious in diffs. Crates that are intentionally NOT exercised live in
# this file as commented-out commands with a comment above each explaining
# why; un-comment them only after confirming the required toolchain and
# system libraries are present in the target environment.

set -euo pipefail

log() { printf '\n\033[1;36m[test-rust] %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# xtask (plugins/bevyosc-vst/xtask)
#
# Pure-Rust bundler used by `bun run build:vst`. No external system deps,
# so it builds and tests cleanly on any host that has the Rust toolchain.
# ---------------------------------------------------------------------------
log "cargo test -p xtask"
cargo test -p xtask --verbose

# ---------------------------------------------------------------------------
# bevyosc-launcher (crates/bevyosc-launcher)
#
# Thin wry + tao desktop shell that spawns the compiled Bun bridge sidecar.
# Requires Linux webkit/gtk dev packages on CI (installed in ci.yml).
# ---------------------------------------------------------------------------
log "cargo check -p bevyosc-launcher"
CARGO_TARGET_DIR=target-launcher cargo check -p bevyosc-launcher

# ---------------------------------------------------------------------------
# bevyosc (root crate)
#
# Skipped: the crate targets `wasm32-unknown-unknown` and pulls in Bevy
# with `bevy_winit` + `webgpu`. A native `cargo test` build would try to
# link the desktop windowing/renderer stack, which has no functioning host
# backend in headless CI (and the `webgpu` feature is wasm-only). The wasm
# build is verified separately by `bun run check:wasm` and the deploy/CI
# workflows.
# ---------------------------------------------------------------------------
log "skipping bevyosc native tests (wasm-only crate)"
# cargo test -p bevyosc --verbose

# ---------------------------------------------------------------------------
# bevyosc-vst (plugins/bevyosc-vst)
#
# Skipped: the plugin is a `cdylib` built on top of nih-plug, which links
# against host audio/MIDI system libraries (alsa, xcb, ...) that are not
# provisioned on stock GitHub-hosted runners. Loading and parameter
# behavior is exercised manually via `bun run build:vst` +
# `bun run install:vst:mac` on a workstation with the required libraries.
# ---------------------------------------------------------------------------
log "skipping bevyosc-vst tests (host audio/MIDI libs not provisioned)"
# cargo test -p bevyosc-vst --verbose
