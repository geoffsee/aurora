# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Commands

Web dev loop (the most common):

```bash
bun run dev          # build:web + serve in one step
bun run build:web    # cargo build --release --target wasm32-unknown-unknown + wasm-bindgen into dist/pkg
bun run serve        # bun run index.ts (projector :3000, controls :3001, OSC bridge)
bun run check:wasm   # fast cargo check against wasm32-unknown-unknown
bun run typecheck    # tsc --noEmit (also runs as the pre-commit hook)
```

Tests:

```bash
bun run test         # test:rust then test:web (this is what CI and the pre-push hook run)
bun run test:rust    # scripts/test-rust.sh — currently only `cargo test -p xtask`
bun run test:web     # vitest run (happy-dom)

bunx vitest run tests/smoke.test.ts   # single file
bunx vitest run -t "happy-dom"        # single test by name
```

### Shader visual-regression baselines

`tests/shader-regression.test.ts` renders a fixed set of representative shaders
(`tests/shader-render.ts`) on the CPU at a fixed resolution and time, then diffs
the output against committed PNG baselines in
`tests/__screenshots__/shader-regression.test.ts/`. The live Bevy/WASM GPU
renderer cannot run under vitest's happy-dom, so this CPU harness is the
safety-net that catches silent drift in the *rendered output* of these CPU
shader reimplementations (one of which is a Shadertoy-style archetype). It fails
when more than 0.5% of pixels move beyond a small per-channel tolerance. This CPU
harness does NOT exercise the real Shadertoy import/transform pipeline or the GPU
WGSL — those share no code with these stand-ins.

That gap is covered by a companion harness, `tests/shadertoy-import-regression.test.ts`,
which drives a real imported Shadertoy Image-pass fixture
(`tests/fixtures/shadertoy/palette-swirl.frag`) through the *actual* transform in
`shadertoy-import.ts` and text-snapshots its output, so a regression in the import
path moves a baseline. Two stages:

- `*.wrapped.glsl` — output of `wrapGlsl`. Pure TypeScript, so it always runs
  (no `naga`) and guards the GLSL scaffold/preamble.
- `*.wgsl` — the full GLSL→WGSL transform (`wrapGlsl` → `naga` → `adaptNagaWgslForBevy`
  → validate). naga's WGSL output is version-specific, so this baseline is pinned to
  **naga-cli 26.0.0** (matches the `naga` crate in `Cargo.lock`; install with
  `cargo install naga-cli@26.0.0`). The stage runs the snapshot **only** when the
  local naga-cli is exactly that version, and **skips** otherwise (absent, or a
  different release) rather than emitting a version-driven false positive. **CI does
  not install naga** (`.github/workflows/ci.yml` installs Rust, wasm-bindgen, bun and
  Playwright only), so this WGSL stage is **skipped in the CI gate** — only stage 1
  (`*.wrapped.glsl`) is exercised there. If you bump the pinned naga-cli version,
  update `PINNED_NAGA_VERSION` in `tests/shadertoy-import-regression.test.ts` and
  regenerate the `*.wgsl` baseline in the same change.

To intentionally update the baselines after a deliberate shader/renderer or
import-transform change (one command refreshes both the PNG and the import baselines):

```bash
UPDATE_SHADER_BASELINES=1 bun run test:web tests/shader-regression.test.ts
UPDATE_SHADER_BASELINES=1 bun run test:web tests/shadertoy-import-regression.test.ts  # *.wgsl baseline needs naga-cli 26.0.0 on PATH
```

Review the regenerated PNGs / WGSL, then commit them. Locally, a missing baseline is
written and passes on first run; in CI a missing baseline fails the build (so an
uncommitted or deleted baseline can't go green). An unexpected diff fails the build.

Note: `test:rust` intentionally skips the root `bevyosc` crate (wasm-only, links the desktop windowing/renderer stack natively) and the `bevyosc-vst` crate (links host audio/MIDI libs not present on CI runners). The justification lives at the top of `scripts/test-rust.sh` — if you add cargo invocations there, follow the existing format: one explicit line per crate with a comment block explaining why it is enabled or skipped.

VST plugin (macOS):

```bash
bun run check:vst        # cargo check -p bevyosc-vst
bun run build:vst        # uses xtask bundler; writes target-vst/bundled/bevyosc VJ Bridge.vst3
bun run install:vst:mac  # copies the bundle into ~/Library/Audio/Plug-Ins/VST3
```

**First-time setup:** run `bun run setup` once before anything else. It executes both onboarding steps in order and exits non-zero on the first failure:

1. `bun install` — installs npm/Bun deps and wires up git hooks via `postinstall` (`.dev/setup-git-hooks.sh` points `core.hooksPath` at `.dev/hooks/`, giving pre-commit → typecheck and pre-push → full test).
2. Verifies that the installed `wasm-bindgen-cli` version matches the pinned `0.2.122`. A mismatch produces opaque link errors — the script prints the exact `cargo install` command to fix it.

The web target requires `wasm-bindgen-cli` **pinned to 0.2.122** (matches the `wasm-bindgen` crate version in `Cargo.toml` and the `WASM_BINDGEN_VERSION` env var in both GitHub workflows). Bump all three together if you ever change it: the `wasm-bindgen` crate in `Cargo.toml` and `WASM_BINDGEN_VERSION` in both GitHub workflows. `scripts/setup.sh` reads the version directly from `Cargo.toml` and requires no separate update.

## Architecture

This is a Bevy app compiled to WebAssembly, served and orchestrated by a Bun process. There are four runtime pieces that talk to each other through well-defined edges; the boundaries matter more than any individual file.

**1. Bevy/WASM renderer (`src/main.rs`, single 1000-line file).** Runs in the browser tab on port 3000. Generates all visuals procedurally on the CPU and feeds material parameters to Bevy — no GPU shader pass is wired up yet (`assets/shaders/vj_palette.wgsl` is reserved). It does not open any sockets itself. Instead it reads its inputs by calling a fixed set of `window.__bevyosc*` getter functions every frame, declared as `wasm_bindgen` externs at the top of `main.rs`. Two families: `__bevyoscOsc*` (live audio data — tempo, beat, energy, deck/bass/mid/high meters, pulse) and `__bevyoscControl*` (VJ control surface state — crossfade, BPM, intensity, deck modes, cue versions, etc.). Adding a new control means adding the param to all three: the JS state object in `index.html`, the `window.__bevyosc*` getter, and the Rust extern declaration.

**2. Bun bridge (`index.ts`).** Single process, two HTTP servers, two UDP sockets, one shared WebSocket fan-out:
- `:3000` serves the projector page (`index.html` + `dist/pkg/`) and accepts a `/ws` upgrade.
- `:3001` serves the controls page (`controls.html`). The controls page connects back to the WS on `:3000` — there is one WebSocket bus, not two.
- UDP `:11001` receives AbletonOSC replies; sends polls/subscriptions to `127.0.0.1:11000`. Every UDP message is JSON-encoded and broadcast to all WS clients.
- UDP `:12000` receives parameter changes from the VST plugin. Messages with `/bevyosc/vst/control/*`, `/bevyosc/vst/trigger/*`, `/bevyosc/vst/cue/*` are translated into mutations on the shared `ControlState` and re-broadcast as `/bevyosc/control/state`.

The bridge is the **single source of truth for `ControlState`**. `coerceControlState` in `index.ts` clamps every field on every update — if you add a control, add a clamp here too or the value will pass through unchecked. Browser, VST, and controls page are all clients of this state; they never own it.

**3. Projector page (`index.html` + `styles.css`).** Hosts the WASM, holds the in-browser mirrors of OSC state and control state, and exposes them to Rust via the `window.__bevyosc*` shims. Has no visible HUD by design — keyboard shortcuts still work as a fallback when the controls page is unavailable.

**4. Controls page (`controls.html` + `controls.css`).** Show-operation UI on `:3001`. Reads/writes `ControlState` over the WS connection to `:3000` using the `/bevyosc/control/state` address. Sends OSC messages by writing the OSC address directly — the bridge forwards anything that is not the control-state address to AbletonOSC via UDP.

**5. VST plugin (`plugins/bevyosc-vst/`).** A `cdylib` nih-plug VST3 audio effect. Lives in the Cargo workspace alongside the root crate. Parameters mirror the `ControlState` fields. On change, the audio thread serializes the value into an OSC message and sends it to `127.0.0.1:12000` over a UDP socket. The momentary "cue"/"flash"/"reset" parameters are float params used as triggers — the bridge interprets them as edges. The `xtask` sibling crate is a pure-Rust bundler invoked by `bun run build:vst` to produce the `.vst3` artifact.

### Cargo workspace and target dirs

The root `Cargo.toml` declares a workspace with three members: the root `bevyosc` crate (wasm target), `plugins/bevyosc-vst` (host target, links audio libs), and `plugins/bevyosc-vst/xtask` (host target, plain Rust).

`bevy` is listed with **`default-features = false`**, which also turns off `bevy_winit`'s normal `winit` feature stack. The dependency therefore includes **`x11`** so bare host **`cargo check`** on Linux still enables **`winit`'s X11 path** (automation that types `cargo check` before push). The runtime build for the browser stays **`wasm32-unknown-unknown`** via `bun run build:web` / `bun run check:wasm`.

**`.cargo/config.toml`** defines **`cargo check-wasm`** / **`cargo build-wasm`** / **`cargo clippy-wasm`** aliases. Don't set **`[build] target = "wasm32-unknown-unknown"`** globally: it tries to compile `xtask` as wasm and `nih_plug_xtask` does not support that triple.

The scripts deliberately use **separate `CARGO_TARGET_DIR`s** — `target/` for the wasm build, `target-vst/` for VST builds — to keep their incompatible build graphs from invalidating each other's caches. Preserve this split when adding new build commands.

### Preset bundle schema versioning

`PRESET_BUNDLE_SCHEMA_VERSION` is declared in two places that must stay in sync:

1. `preset-bundle-schema.ts` — canonical TypeScript source; `migratePresetBundle` is the reference migration path.
2. `controls.html` — inline JavaScript mirror (`normalizePreset`); update the constant and the migration logic whenever `preset-bundle-schema.ts` changes.

When bumping to v2 or beyond, update both files and add a new migration branch in `migratePresetBundle`. The parity test suite in `tests/preset-bundle.test.ts` tests an inline replica of `normalizePreset` against `migratePresetBundle`. When editing `controls.html`'s `normalizePreset`, update the inline replica in that test suite too.

### Deploy

`.github/workflows/deploy.yml` publishes only the **static front-end** (HTML/CSS + the wasm bundle) to GitHub Pages. The OSC/WebSocket bridge in `index.ts` cannot run there — Pages is just for the visual page, no Ableton, no controls round-trip. The deploy step rewrites `./dist/pkg/` to `./pkg/` in `dist/index.html` to match the flattened Pages layout.
