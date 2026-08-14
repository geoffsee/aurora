# Audio → show control

How live audio drives `ControlState`, and the controls an operator has over that
path. Show-global; the pack-author equivalent is
[audio-mapping.md](./audio-mapping.md).

```text
source ─► EMA ─► shaping ─► mappings ─► ControlState ─► coerce (clamp)
```

| Stage | Where | Owns |
| --- | --- | --- |
| source | AbletonOSC meters, browser mic, demo audio | raw `energy/bass/mid/high/pulse` |
| EMA | `bridge/audio-ema.ts` | attack (`emaAlphas`) and release (`audioShaping[band].release`) |
| shaping | `bridge/audio-shaper.ts` | gain, gate, ceiling, curve, mute, solo |
| mappings | `bridge/audio-control-router.ts` | source → target, ranges, thresholds, combine |
| coerce | `bridge/index.ts` | the final clamp on every field |

All three sources share one EMA and one shaping stage, so they cannot drift into
different response curves.

## Band shaping (Console → Band Shaping)

A mapping's output range changes what the target *does*. Shaping changes what the
band *is*. When a phone mic in a loud room pins every band near 0.8, no amount of
mapping tweaking gives the signal its range back — gain and gate do.

| Control | Range | Effect |
| --- | --- | --- |
| **Gain** | 0–4× | Scales the band before the gate |
| **Gate** | 0–1 | Noise floor. At or below → silence |
| **Ceiling** | 0–1 | Hard clip, applied after gain |
| **Release** | 0.01–1 | EMA alpha while falling. Lower fades out more slowly between songs |
| **Mute / Solo** | — | Contribute nothing / contribute *only* |

**Gain runs before gate.** Gating first would throw away the signal you were
about to amplify, which is the whole reason gain exists on a timid source.

**Gate is a floor, not a subtraction.** Below it the band is silent; above it the
value is untouched. Subtracting would move every mapping's response curve as a
side effect of setting a noise floor.

**Defaults are exactly identity** — gain 1, gate 0, ceiling 1, and the release
alphas the bridge already hardcoded. An operator who never opens the panel gets
the behaviour that shipped before shaping existed, and **Reset** returns there.

### One home per control

The issue behind this listed seven fine controls; three already existed
somewhere. Rather than create a second place to set the same number:

| Control | Lives on | Why |
| --- | --- | --- |
| gain, gate, ceiling, mute, solo | `audioShaping` (new) | nothing owned them |
| **attack** | `emaAlphas` (existing) | already on ControlState, already has a Console control |
| **release** | `audioShaping` (new) | was a module constant — never operator-facing |
| **curve** | `bandCurves` (existing) | already exists and is already editable |

`bandCurves` is the interesting one: it *was* editable, but only ever reached the
renderer, never the router. The shaping stage now reads the same field, so one
curve control affects both paths instead of two controls disagreeing.

## Targets

Any `ControlState` field is a valid mapping target except the forbidden set. Ones
worth knowing:

**Global** — `intensity`, `depth`, `feedback`, `speed`, `paletteBrightness`,
`paletteSaturation`, `palette`, `maxBrightness`, `ringOpacity`, `morph`,
`layerWeight0`…`layerWeight7`, `flashVersion` (threshold + `increment`).

**Per-deck** — `deckAIntensity` / `deckADepth` / `deckAFeedback` / `deckASpeed` /
`deckAPalette` and the `deckB*` equivalents, plus `figureScale`, `figureSpin`,
`figureHalo`, `figureAudio` when the Figure layer is live.

**Forbidden**, and staying that way: `audioControlMode`,
`audioTransientAutomation` (audio must not drive its own arm switch — that is a
feedback loop), `crossfade`, `deckAMode` / `deckBMode`,
`deckAPresetSlug` / `deckBPresetSlug`, `activeShader`,
`deckAGpuShader` / `deckBGpuShader`, `showGpuPalette`. These are operator-chosen
layout, not parameters.

## Combine rules

When two mappings write the same target in one frame, `combine` decides the
result. Before this existed the answer was "whichever mapping sat later in the
array silently wins" — a behaviour nobody chose, which made two-band targets an
accident rather than a technique.

| `combine` | Result |
| --- | --- |
| `last` (default) | later mapping wins — the historical behaviour |
| `max` | loudest contribution; the natural choice for two bands on one visual, since neither cancels the other |
| `min` | quietest contribution; useful as a duck |
| `sum` | added, then clamped by `coerceControlState` |

Two details that are easy to get wrong:

- A **steady** mapping still participates when its target is contested. No-op
  suppression is a bandwidth optimisation for a single mapping; on a contested
  target it would make `max` follow only whichever half happened to move this
  frame.
- **Increment targets never fold.** Counters like `flashVersion` always take the
  running value — folding two bumps with `max` would silently drop one.

## Presets

Shaping is part of `ControlState`, so preset save captures it and recall restores
it with no bespoke plumbing. A preset saved before shaping existed simply has no
`audioShaping` key, so recalling it leaves the operator's current shaping alone
rather than silently resetting it to identity.

## Defaults

`bridge/audio-mappings.json` still ships the five-band → five-target set that
predates all of this, and it behaves identically: shaping is identity and every
mapping is `combine: 'last'` on a distinct target.

| Source | Target |
| --- | --- |
| energy | `intensity` |
| bass | `depth` |
| mid | `feedback` |
| high | `paletteBrightness` |
| pulse | `flashVersion` (threshold, increment) |

## Not yet

- **Sidechain / duck across bands.** `min` covers the common case within a
  target; a real sidechain wants one band to attenuate another's *contribution*,
  which is a different shape and is better designed alongside stems.
- **Stem-separated sources.** Thread 6 / #177. The shaping stage is per-source by
  construction, so stems plug into the same model when `/aurora/stem/*` lands —
  no new concept required.
- **Mobile.** Shaping is console-only. A phone fires and mixes; it does not
  re-tune the signal path mid-set.
