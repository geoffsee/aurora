# Carry-Forward: Longer-Horizon Autonomy / Ecosystem Threads

**Issue:** #196
**Tracker:** #197
**Source:** Strategic Review #172 — Recommended Path Forward, item #8
**Status:** Warm carry-forward — kept reachable, not scheduled

---

## Why this file exists

Three longer-horizon threads on the **autonomy / ecosystem-depth** axis now have
their shipped preconditions in the tree, but none is urgent. Per Strategic Review
#172 item #8 they are kept **warm as carry-forward** so the autonomy axis retains
momentum without crowding out the safety-net (CI performance gate) and
composability (Composite Preset Layers, Multi-Output Routing) work that owns the
current sprint.

This file is the durable home for each thread's **next-step entry point** so a
later cycle can pick one up opportunistically without re-deriving where it lands.

**None of these threads blocks any higher-priority item.** Each is additive and
sits outside the live render / state-fan-out hot path. Pick one up only once the
higher-priority sprint items (#190–#195 and the manual CI gate) are underway.

---

## Thread 1 — Presets-as-Functions

**What it is.** Today a preset is a *static snapshot*: `PresetBundle.state` is a
frozen `Record<string, unknown>` of `ControlState` values
(`preset-bundle-schema.ts`). "Presets-as-Functions" makes a preset *computed* —
a small declarative form evaluated at runtime against live inputs — rather than a
fixed set of scalars.

**Shipped preconditions.**
- Versioned, migratable bundles: `preset-bundle-schema.ts`
  (`PRESET_BUNDLE_SCHEMA_VERSION`, `migratePresetBundle`), mirrored in
  `controls.html` `normalizePreset`.
- A runtime that already maps inputs → `ControlState` declaratively:
  `audio-control-router.ts` (`AudioMapping[]`, `audio-mappings.json`).
- Continuous blending between two states by an external scalar: `preset-morph.ts`.

**Next-step entry point.**
1. Open `preset-bundle-schema.ts`. The cheapest framing of a "function preset" is
   a base snapshot **plus** a saved `AudioMapping[]` (the router's own shape) — at
   which point the evaluation engine already exists and only persistence + UI are
   new. Confirm or reject that framing first; it decides whether this is a small
   feature or a new subsystem.
2. If accepted: introduce a v2 bundle whose `state` may carry the declarative form,
   bump `PRESET_BUNDLE_SCHEMA_VERSION` to `2`, add a v1→v2 branch in
   `migratePresetBundle`, and mirror both in `controls.html` `normalizePreset` plus
   the inline replica in `tests/preset-bundle.test.ts` (see AGENTS.md "Preset
   bundle schema versioning").

**Non-blocking.** Purely additive — v1 bundles keep loading through
`migratePresetBundle`, and the static-snapshot path is the fallback when a bundle
carries no function form.

---

## Thread 2 — AI Preset Composer

**What it is.** Generate a `PresetBundle` from a stated goal (mood / energy / brief)
plus a window of live audio features, instead of an operator hand-dialing controls.

**Shipped preconditions.**
- The composer's **input is now real**: `/bevyosc/audio/features` is a live WS path
  (`index.ts` around the browser-audio-feature window, ~`index.ts:634`) carrying
  `AudioFeatures` (`{ energy, bass, mid, high, pulse }`, `audio-ema.ts`).
- The composer's **output is a known artifact**: a `PresetBundle`
  (`preset-bundle-schema.ts`) — exactly what the controls page already loads and
  migrates — so nothing renderer-side has to change to consume a composed preset.

**Next-step entry point.**
1. Start with an **offline generator** (a script / separate process), not bridge
   code: given a target brief and a captured window of `/bevyosc/audio/features`,
   emit a `PresetBundle` (optionally an `AudioMapping[]` if it composes with Thread
   1). Prove it by round-tripping the output through `migratePresetBundle` — if it
   survives migration it will load in the controls page unchanged.
2. Keep inference **off the bridge hot path**. The bridge is the single source of
   truth for `ControlState` and clamps every field via `coerceControlState`; a
   composer must produce a standard bundle a human could equally have saved, never
   reach into the state fan-out. Decide where inference runs (separate process, or
   the controls page calling an external API) on that constraint.

**Non-blocking.** Lives entirely outside the live render / fan-out path and emits
only standard bundles; it adds no dependency to any sprint item.

---

## Thread 3 — Ableton Extensions Native Build

**What it is.** Move the Ableton integration from read-only AbletonOSC polling
toward a richer extension that pushes per-stem audio features to the bridge —
the stem-level reactivity wildcard.

**Shipped precondition.** The spike is **done**: `docs/spikes/ableton-extensions.md`
(#177). It assesses every integration surface, recommends a Phase 1 (an additive
named-stem feature channel fed by a Max for Live "sender" device), and already
writes a **"Proposed Acceptance Criteria for Follow-On Implementation Issue."**

**Next-step entry point.**
1. The entry point already exists verbatim — the spike's
   *"Proposed Acceptance Criteria for Follow-On Implementation Issue"* section. File
   that Phase 1 implementation issue and start there; no fresh design is needed.
2. First code touch: a new UDP `/bevyosc/stem/*` ingest handler in `index.ts`,
   modelled on the existing VST control listener (`vstControlUdp`). Per the spike,
   stem features are **audio features, not control state** — they must **not** pass
   through `coerceControlState` and must broadcast on their own `/bevyosc/stem/state`
   WS address. The "native build" framing maps to authoring and distributing the
   `.amxd` sender device under `extensions/ableton/`.

**Non-blocking.** Additive across bridge / browser / renderer; with no stem device
connected the named-stem map is empty and the existing `trackMapping` /
`recomputeEnergy` broadband path is untouched.

---

## Picking one up

When an item #1–#5 is underway and there is slack, pull a single thread (sizing is
**M per thread**, not all at once). Convert its "Next-step entry point" into a
filed implementation issue, then implement against the cited files. Update this
file if a thread's entry point moves so the next cycle inherits an accurate start.
