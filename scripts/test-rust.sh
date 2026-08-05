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
# xtask (plugins/aurora-vst/xtask)
#
# Pure-Rust bundler used by `bun run build:vst`. No external system deps,
# so it builds and tests cleanly on any host that has the Rust toolchain.
# ---------------------------------------------------------------------------
log "cargo test -p xtask"
cargo test -p xtask --verbose

# ---------------------------------------------------------------------------
# aurora (root crate) — FieldRuntime + ModeDirector + model layer unit tests
#
# Full native `cargo test -p aurora` used to be skipped because the crate is
# primarily wasm/Bevy. Unit tests under `src/field_runtime.rs` (and existing
# mode_catalog/mode_director/model_layer modules) compile as bin tests without
# spawning a window. We run:
# - FieldRuntime parity/golden suite for PR6 (#240)
# - ModeDirector figure/mesh-primary weight 0 for PR11 (#245)
# - model_layer mesh-ref resolve + soft-fail for PR11 (#245)
# Wasm build remains verified by `bun run check:wasm` / CI workflows.
#
# Refresh goldens: UPDATE_FIELD_GOLDS=1 cargo test -p aurora --bin aurora golden_poses -- --nocapture
# ---------------------------------------------------------------------------
log "cargo test -p aurora --bin aurora field_runtime"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-target}" cargo test -p aurora --bin aurora field_runtime

# ModeDirector legacy_field_weight (figure/mesh + fullscreen suppress) + model layer
log "cargo test -p aurora --bin aurora mode_director"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-target}" cargo test -p aurora --bin aurora mode_director

log "cargo test -p aurora --bin aurora model_layer"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-target}" cargo test -p aurora --bin aurora model_layer

# ---------------------------------------------------------------------------
# aurora-vst (plugins/aurora-vst)
#
# Skipped: the plugin is a `cdylib` built on top of nih-plug, which links
# against host audio/MIDI system libraries (alsa, xcb, ...) that are not
# provisioned on stock GitHub-hosted runners. Loading and parameter
# behavior is exercised manually via `bun run build:vst` +
# `bun run install:vst:mac` on a workstation with the required libraries.
# ---------------------------------------------------------------------------
log "skipping aurora-vst tests (host audio/MIDI libs not provisioned)"
# cargo test -p aurora-vst --verbose
