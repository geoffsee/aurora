# Backlog: Longer-Horizon Frontier Threads

**Issue:** #216
**Tracker:** #217
**Source:** Strategic Review #172 — Recommended Path Forward, item 7
**Sizing:** M per thread (carry-forward, picked up one at a time — not all at once)
**Status:** Warm carry-forward — kept reachable, not scheduled

---

## Why this file exists

Per the endorsed feedback for this sprint, no proposal is dropped for being
uncertain. This file is the durable, in-repo home for each longer-horizon
frontier thread's **next-step entry point** so a later cycle can pick one up
opportunistically without re-deriving where it lands in the tree.

This file supersedes the purged `docs/backlog/longer-horizon-threads.md`, which was
its previous incarnation: commit `ff5e771` ("Delete docs directory") deliberately
removed the entire `docs/` tree. Reviving `docs/backlog/` here is a sanctioned
exception under issue #216's mandate for a durable in-repo home — noted so a future
reader who finds both in git history understands the lineage.

**None of these threads blocks any higher-priority item.** They are additive and
sit outside the live render / state-fan-out hot path. Pick one up only once the
safety-net and audio-honesty work (#199, #200, and the sprint's dry-run /
coverage / composability items) is underway. When you take one, convert its
"Next-step entry point" into a filed implementation issue, implement against the
cited files, and update this file if the entry point moves so the next cycle
inherits an accurate start.

Symbol references were current as of issue #216; verify against the tree before
acting on them.

---

## Thread 1 — Generative Preset Interpolation

**What it is.** Interpolate across a *set* / path of presets, or synthesize
intermediate states procedurally, rather than the current two-endpoint blend.

**Shipped preconditions.**
- Two-endpoint continuous blend positioned by an external scalar:
  `bridge/preset-morph.ts` (`morphPresetStates`, `MORPH_KEYS`, `applyMorphCurve`,
  `MorphCurve`).
- Weighted N-layer compositing over a base state: `bridge/preset-layers.ts`
  (`PresetLayer`, `LAYER_KEYS`, `PRESET_LAYER_MAX`).
- A wall-clock/automation source that can drive a position: `bridge/automation-player.ts`.

**Next-step entry point.**
1. Generalize `morphPresetStates` from two endpoints to an *ordered list* of
   states plus a global position that walks the segments; `applyMorphCurve`'s
   snap/linear/ease machinery already shapes each segment. Decide first whether a
   "generative" path means (a) interpolating a fixed sequence of saved presets or
   (b) synthesizing intermediates — that choice sets scope.
2. Drive the position from `bridge/automation-player.ts` rather than only an OSC fader so
   a path can run unattended.

**Non-blocking.** Reuses `MORPH_KEYS`, so discrete deck modes stay untouched and a
sweep never disturbs the live decks; purely additive to the blend path.

---

## Thread 2 — Uniform Type Registry

**What it is.** One declarative table describing each control/uniform field's
type, range, default, and clamp, that every site derives from — replacing the
current spread across three-plus places.

**Shipped preconditions.**
- Per-field UI metadata already exists for the assignable controls:
  `web/controls/lib/param-meta.ts` (`PARAM_META`, `MappableParam`, `ParamMeta`
  with `min`/`max`/`step`/`integer`/`format`).
- Authoritative clamps live server-side: `coerceControlState`
  (`bridge/index.ts:463`).
- Per AGENTS.md, adding a control today means editing all three of: the JS state
  object in `web/index.html`, the `window.__aurora*` getter, and the Rust extern in
  `src/main.rs` — the duplication this thread targets.

**Next-step entry point.**
1. Treat `PARAM_META` as the seed. Extend it into a single shared registry that
   also carries default + clamp, and have `coerceControlState` and the controls UI
   both read from it, so a new uniform is declared once.
2. Confirm scope first: does the registry also generate the Rust extern list and
   the reserved WGSL uniforms (`assets/shaders/vj_palette.wgsl`), or only the
   TS/bridge side? That decides small-refactor vs new subsystem.

**Non-blocking.** A refactor of existing wiring behind the same runtime behavior —
no change to the state fan-out or render path.

---

## Thread 3 — Preset Diff/Merge CLI

**What it is.** A command-line tool to diff two preset bundles and produce a
merged bundle (pick fields, blend numerics).

**Shipped preconditions.**
- A versioned, migratable bundle format: `shared/preset-bundle-schema.ts`
  (`PresetBundle`, `PRESET_BUNDLE_SCHEMA_VERSION`, `migratePresetBundle`).
- Known field sets to diff on: `MORPH_KEYS` (`preset-morph.ts`) /
  `MAPPABLE_PARAMS` (`param-meta.ts`) for numerics, `curves` on the bundle.
- A precedent for a standalone script: `scripts/dry-run.ts`.

**Next-step entry point.**
1. Add a script under `scripts/` that loads two bundles through
   `migratePresetBundle` (so both are version-normalized first), diffs on the known
   field set, and writes a merged bundle.
2. Use the blend-eligible key set (`MORPH_KEYS`/`LAYER_KEYS`) to decide which
   fields can be numerically merged vs which are discrete and must be picked.

**Non-blocking.** Offline tool; it only emits standard `PresetBundle`s that load
in the controls page unchanged.

---

## Thread 4 — Presets-as-Functions

**What it is.** Make a preset *computed* — a small declarative form evaluated at
runtime against live inputs — rather than a frozen `Record<string, unknown>` of
`ControlState` scalars.

**Shipped preconditions.**
- Versioned/migratable bundles: `preset-bundle-schema.ts`
  (`PRESET_BUNDLE_SCHEMA_VERSION`, `migratePresetBundle`), mirrored in
  `web/controls.html` `normalizePreset`.
- A runtime that already maps inputs → `ControlState` declaratively:
  `bridge/audio-control-router.ts` (`AudioMapping[]`, `bridge/audio-mappings.json`).
- Continuous blending between states by an external scalar: `bridge/preset-morph.ts`.

**Next-step entry point.**
1. The cheapest framing of a "function preset" is a base snapshot **plus** a saved
   `AudioMapping[]` (the router's own shape) — the evaluation engine then already
   exists and only persistence + UI are new. Confirm or reject that framing first;
   it decides small feature vs new subsystem.
2. If accepted: introduce a v2 bundle whose `state` may carry the declarative form,
   bump `PRESET_BUNDLE_SCHEMA_VERSION` to `2`, add a v1→v2 branch in
   `migratePresetBundle`, and mirror both in `web/controls.html` `normalizePreset`
   plus the inline replica in `tests/shared/preset-bundle.test.ts` (see AGENTS.md
   "Preset bundle schema versioning").

**Non-blocking.** Purely additive — v1 bundles keep loading through
`migratePresetBundle`; the static-snapshot path is the fallback when a bundle
carries no function form.

---

## Thread 5 — Eliminate-the-Bridge

**What it is.** Remove the Bun bridge as a *mandatory* intermediary so the browser
projector can run standalone when no bridge is present.

**Shipped preconditions.**
- A bridge-less static build already ships: `.github/workflows/deploy.yml`
  publishes the HTML/CSS + wasm bundle to Pages with no bridge.
- Browser-side audio-feature extraction already exists: `web/controls/lib/mic.ts`
  drives `bridge/mic-features.ts`-shaped `AudioFeatures`.
- The renderer reads inputs through `window.__aurora*` shims, not sockets
  (`src/main.rs`), so its input source is swappable.

**Next-step entry point.**
1. Decide the fallback boundary: when `/ws` is absent, have the projector's
   `window.__aurora*` shims read a browser-local state store instead of the WS
   mirror. The gap versus today is a browser-local `ControlState` owner mirroring
   `coerceControlState` (`bridge/index.ts:463`).
2. Start with control-state ownership only (keyboard fallback already works with no
   controls page); audio-feature self-extraction is a second, separable step.

**Non-blocking.** Additive fallback path — with a bridge connected, nothing
changes.

---

## Thread 6 — Ableton Extensions Native Build

**What it is.** Move Ableton integration from read-only AbletonOSC polling toward a
richer extension that pushes per-stem audio features to the bridge.

**Shipped precondition.** The spike is **done** (#177). Its doc previously lived at
`docs/spikes/ableton-extensions.md` and was removed in the docs-directory purge
(commit `ff5e771`); it is recoverable from git history, and **#177 is the
authoritative record**. The spike already writes a *"Proposed Acceptance Criteria
for Follow-On Implementation Issue."*

**Next-step entry point.**
1. File the Phase 1 implementation issue directly from #177's proposed acceptance
   criteria — no fresh design is needed.
2. First code touch: a new UDP `/aurora/stem/*` ingest handler in `bridge/index.ts`,
   modeled on the existing VST control listener `vstControlUdp`
   (`bridge/index.ts:245`). Per the spike, stem features are **audio features, not
   control state** — they must **not** pass through `coerceControlState`, and must
   broadcast on their own `/aurora/stem/state` WS address. The "native build"
   framing maps to authoring/distributing the Max for Live sender device under
   `extensions/ableton/`.

**Non-blocking.** Additive across bridge/browser/renderer; with no stem device
connected the named-stem map is empty and the existing
`trackMapping`/`recomputeEnergy` broadband path is untouched.

---

## Thread 7 — AI Preset Composer

**What it is.** Generate a `PresetBundle` from a stated goal (mood/energy/brief)
plus a window of live audio features, instead of hand-dialing controls.

**Shipped preconditions.**
- The composer's **input is now real**: `/aurora/audio/features` is a live WS path
  (broadcast at `bridge/index.ts:795`, ingested at `bridge/index.ts:1555`) carrying
  `AudioFeatures` (`{ energy, bass, mid, high, pulse }`, `bridge/audio-ema.ts`).
- The composer's **output is a known artifact**: a `PresetBundle`
  (`shared/preset-bundle-schema.ts`) — exactly what the controls page already loads
  and migrates — so nothing renderer-side changes to consume a composed preset.

**Next-step entry point.**
1. Start with an **offline generator** (a script under `scripts/`, not bridge
   code): given a target brief and a captured window of `/aurora/audio/features`,
   emit a `PresetBundle` (optionally an `AudioMapping[]` to compose with Thread 4).
   Prove it by round-tripping through `migratePresetBundle` — if it survives
   migration it loads in the controls page unchanged.
2. Keep inference **off the bridge hot path**. The bridge is the single source of
   truth for `ControlState` and clamps every field via `coerceControlState`; a
   composer must produce a standard bundle a human could equally have saved, never
   reach into the state fan-out. Decide where inference runs (separate process, or
   the controls page calling an external API) on that constraint.

**Non-blocking.** Lives entirely outside the live render / fan-out path and emits
only standard bundles.

---

## Thread 8 — Collaborative Preset Voting

**What it is.** Multiple connected clients vote on the next preset/cue; the winner
is applied.

**Shipped preconditions.**
- One shared WebSocket bus already fans out to every client (`bridge/index.ts`);
  the controls and projector pages are all clients of it.
- Cues already apply a bundle/preset through a single path
  (`web/controls/lib/cues.ts`, `preset-bundle-schema.ts`).

**Next-step entry point.**
1. Model a vote message on the existing control/trigger addresses — a new
   `/aurora/vote/*` address the bridge tallies in memory, then applies the winner
   through the same path a cue applies a preset.
2. Keep tallies in bounded bridge memory (respect the idle-memory budget); no
   persistence is needed for a first version.

**Non-blocking.** Additive WS address; clients that don't vote are unaffected.

---

## Thread 9 — Smartphone Gesture Input

**What it is.** A phone web page that turns touch/gestures into control mutations —
a lightweight, mobile control surface.

**Shipped preconditions.**
- The controls app is the model: `web/controls/` writes `ControlState` over the
  `/aurora/control/state` WS address.
- Gesture-to-patch mapping already has a helper: `buildParamPatch` over
  `MappableParam`s (`web/controls/lib/param-meta.ts`).

**Next-step entry point.**
1. Serve a minimal mobile page from the bridge (new route/port) that maps gestures
   to `MappableParam`s via `buildParamPatch` and writes the resulting patch over
   the existing `/aurora/control/state` WS address.
2. Because it speaks the existing control-state address, the bridge clamps its
   input through `coerceControlState` like any other client — no new server-side
   trust boundary.

**Non-blocking.** Just another WS client of the single `ControlState`; adds no
dependency to any sprint item.

---

## Out of scope

No persona creation/maintenance — persona synthesis is owned by the UX
`persona-synthesis` workflow, not sprint planning.
