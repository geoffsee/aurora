#!/usr/bin/env sh

# Format Typescript
bunx --bun @biomejs/biome format ./src

# Format Rust
cargo fmt --all

