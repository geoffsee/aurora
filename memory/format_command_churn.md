---
name: Format command reformats the entire repo
description: bun run format / scripts/format-code.sh rewrites all tracked sources, not only changed files — avoid it for scoped changes
type: feedback
---

`bun run format` (scripts/format-code.sh) runs `biome format --write ./index.ts ./vitest.config.ts ./tests/` **and** `cargo fmt --all`. The repo is NOT kept in a fully formatted state, so running it rewrites many untouched files (e.g. src/main.rs and every tests/*.ts), polluting an otherwise minimal diff.

**Why:** A single-issue branch should contain the smallest coherent change and preserve unrelated worktree state. Running the global formatter dumped ~11 unrelated files into the diff in one session and they had to be reverted with `git checkout HEAD -- <files>`.

**How to apply:** For a scoped change, do NOT run `bun run format`. Match the existing tab-indent style by hand, and rely on `bun run typecheck` + `bun run test:web` for verification. If you must format, format only the specific files you authored (e.g. `bunx --bun @biomejs/biome format --write <yourfile>`), never `cargo fmt --all` or the whole `tests/` dir.
