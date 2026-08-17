# Audio Reactivity Mapping v1

The author-facing contract for wiring live audio onto a pack's own parameters.

Source of truth: [`shared/audio-mapping-v1.ts`](../shared/audio-mapping-v1.ts) — schema, validator, and evaluator in one module.
Related: [aurora-package.md](./aurora-package.md) · [preset-studio.md](./preset-studio.md)

## What problem this solves

Before this, reactivity was split across five surfaces with no shared vocabulary:

| Surface | What it gave you | Why it wasn't enough |
| --- | --- | --- |
| pack-v1 `audio_uniforms` | raw `vec4` of energy/bass/mid/high | every pack reinvented the math, inside WGSL |
| `pack_drive` / Studio knobs | intensity, depth, feedback, speed | operator knobs, not an audio graph |
| `bridge/audio-control-router.ts` | features → `ControlState` | show-global, operator-facing, not pack-local |
| Three.js `aurora-frame-v1` | audio in the host frame | a different bus, no shared schema |
| `PARAM_META` | MIDI-assignable ControlState | not an authoring API |

So Studio could not preview the mapping the show would run, and a pack's reactivity was not readable by anything except a WGSL compiler.

## The model

```text
feature ──► [ input window ] ──► [ invert ] ──► [ curve ] ──► [ smooth ] ──► [ combine ] ──► knob
```

- **Sources** — `energy` `bass` `mid` `high` `pulse`. Same ids as `AudioFeatures` in `bridge/audio-ema.ts`, so a mapping means the same thing whether features come from a mic, AbletonOSC, or demo audio.
- **Targets** — `intensity` `depth` `feedback` `speed` `hue` `sat` `bright`. Exactly the fields of `AuroraPackageDefaults`: audio animates the same knob a human sets.
- **Modes** — `continuous` (map the level) or `threshold` (fire on a rising edge and hold).

### Pack-local, deliberately

Mappings **cannot** write `ControlState`. A pack is a look, not a show — letting one reach into crossfade, deck selection, or cue state would make *installing* it a show-wide side effect, and would re-open the feedback loops `FORBIDDEN_MAPPING_TARGETS` closes on the router side.

The boundary is structural rather than a blocklist: `crossfade` simply is not in `AUDIO_MAPPING_TARGETS`, so naming it is an ordinary unknown-target error and there is no second list to keep in sync.

Show-global audio control stays with the bridge router (#285). The two meet at the feature bus, not at the targets.

## `mappings.json`

Optional, sits beside `manifest.json` in the archive.

```json
{
  "version": 1,
  "mappings": [
    {
      "source": "bass",
      "target": "depth",
      "mode": "continuous",
      "inMin": 0.1,
      "inMax": 0.85,
      "outMin": 0,
      "outMax": 0.45,
      "curve": "exp",
      "smooth": 0.15,
      "combine": "add"
    }
  ]
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `source` | — | feature id (required) |
| `target` | — | pack knob (required) |
| `mode` | `continuous` | `continuous` \| `threshold` |
| `inMin` / `inMax` | `0` / `1` | input window on the 0..1 feature; outside clamps to the edge |
| `outMin` / `outMax` | `0` / `1` | output range |
| `curve` | `linear` | `linear` \| `exp` (x²) \| `log` (√x) \| `smoothstep` |
| `smooth` | `0` | `0` instant … `1` ≈ 500 ms time constant |
| `invert` | `false` | flip the normalised input before the curve |
| `combine` | `add` | `add` \| `max` \| `replace` |
| `level` | `0.5` | threshold: normalised level that fires |
| `holdMs` | `120` | threshold: how long the fired value is held |

## Rules that matter

**Idle audio.** `energy === -1` is the pack-v1 idle sentinel and it is load-bearing. When it is set, every mapping contributes nothing and the operator's knobs pass through untouched — otherwise a silent room reads as `energy: 0`, every mapping lands on its `outMin`, and an idle projector sits at a look nobody chose. Going idle also clears smoothing envelopes so the next onset starts clean.

**The operator knob is the base.** Audio decorates a look the operator chose; it does not silently take it over. `add` (the default) makes the knob a floor. `max` never drops below it. `replace` is the escape hatch for a pack whose knob is meaningless without audio.

**Two mappings on one target fold in declaration order.** Deterministic, and explainable to an author reading their own file top to bottom. Every result is clamped to 0..1.

**Smoothing is frame-rate independent.** A one-pole with a real time constant, not a per-frame alpha — a mapping tuned on a 120 Hz preview must not turn to mush on a 30 Hz projector. Frame deltas are clamped at `AUDIO_MAPPING_MAX_FRAME_MS` (250 ms) so a backgrounded tab does not snap every envelope on return.

**Validation is strict.** Unlike the operator-facing router, which drops bad rows so a hand-edited config degrades rather than throws, a `mappings.json` is *build output*. Silently ignoring a typo'd target means shipping a pack whose reactivity quietly does nothing, so every problem is an error with a path.

## Migration

Fully opt-in. A pack with no `mappings.json` is valid and behaves exactly as before; archives built from the same inputs are byte-identical to pre-#284 ones. Packs that read `audio_uniforms` (binding 2) and do their own math keep working, and can keep doing so forever.

Declaring mappings is how you get knobs an operator can see, a Studio preview that matches the show, and reactivity that survives being read by something other than a shader compiler.

## Reference set

`AUDIO_MAPPING_REFERENCE` is the default for new Studio sketches. It is built to animate the **stock pack-v1 authoring template with no shader change at all** — that template already reads `pack_drive.x/.y`, so three declared rows turn a static look reactive. That is the argument for the schema in one example.

The tuning is also the house style worth copying:

- `energy → intensity`, `smoothstep`, `add` — a gentle lift on top of the knob.
- `bass → depth`, `exp` — a linear bass map feels mushy; the curve keeps rumble quiet and lets kicks read.
- `pulse → bright`, `threshold`, 90 ms hold — a flash, not a strobe. A single frame at full value is not perceivable, which is what `holdMs` is for.

## Using the evaluator

```ts
import {
  createAudioMappingEvaluator,
  emptyAudioMappingSet,
} from '../shared/audio-mapping-v1.ts';

const evaluator = createAudioMappingEvaluator(pack.audioMappings ?? emptyAudioMappingSet());

// per frame — returns effective knob values, never mutates its inputs
const driven = evaluator.evaluate({ energy, bass, mid, high, pulse }, knobs, performance.now());
```

State (smoothing envelopes, threshold edges) lives in the evaluator, which is why it is a factory: two decks running the same pack need independent envelopes. Call `reset()` on a pack swap.

## Status

| Consumer | State |
| --- | --- |
| Schema + validator + evaluator | shipped |
| `.aurora-package` (`mappings.json`) | shipped — build, parse, validate |
| Preset Studio preview | shipped — runs the same evaluator |
| Studio mapping editor UI | not yet; sketches carry the reference set, editing is next |
| Bevy/WASM show path | not yet — see below |
| Three.js `aurora-frame-v1` | not yet; same ids are intended to carry over |

### Show-path wiring (next)

Today the show path builds `pack_drive` in Rust (`src/main.rs`) from per-deck `ControlState`. The intended wiring is **not** to port the evaluator to Rust — a second implementation is exactly what this schema exists to prevent. Instead, evaluate in JS in `web/index.html` (which already has the pack metadata and the feature bus) and expose the effective per-deck drive through a `window.__auroraPackDrive*` getter, alongside the existing `__auroraControl*` family, with Rust reading it instead of recomputing. One evaluator, both surfaces.
