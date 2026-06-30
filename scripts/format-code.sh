#!/usr/bin/env sh

# Format Typescript — JS sources live alongside the Bun bridge (`bridge/index.ts`, tests).
# `./src/` is Rust (Bevy), so passing it triggers Biome "paths ignored" warnings.
bunx --bun @biomejs/biome format --write ./bridge/index.ts ./vitest.config.ts ./tests/ ./scripts/

# Format Rust
cargo fmt --all

