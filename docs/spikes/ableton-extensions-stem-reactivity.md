# Spike: Ableton Extensions SDK & Stem-Level Reactivity

**Issue:** #129 (re-files #101, closed NOT_PLANNED)  
**Tracker:** #130  
**Source:** Strategic Review #122, item 8  
**Persona:** Rezz — stem-level kick-bus/vocal-bus reactivity  
**Status:** Spike complete — time-boxed, no implementation produced  
**Date:** 2026-06-12

---

## Spike Question

The endorsed Ableton Extensions wildcard assumed the Ableton Extensions SDK
(https://ableton.github.io/extensions-sdk, the subject of closed spike #101) could
feed stem-level audio data — kick bus, vocal bus — into the renderer so visuals can
react to individual stems rather than the master mix. This spike must explicitly
**confirm or kill** that path before any wildcard implementation work starts.

## Verdict

| Path | Verdict |
|---|---|
| Stem-level reactivity **via the Extensions SDK** | **KILLED** |
| Stem-level reactivity **as a feature** | **CONFIRMED** — viable today without the SDK, via two paths already in this codebase |

---

## Part 1: Ableton Extensions SDK assessment (killed)

Findings as of 2026-06-12, from the public SDK page, Ableton's announcement, and
the Extensions FAQ:

1. **Beta-gated.** The SDK is available exclusively in the **Live 12.4.5 public
   beta** and works with no earlier version. The SDK and its documentation are
   downloadable only through the Ableton Beta Program (Centercode login); there is
   no public API reference. Building the wildcard on it would pin every performer
   to a beta build of Live.

2. **Wrong runtime model for reactivity.** Extensions are JavaScript/TypeScript
   running on Node.js inside Live. The API surface covers Set-level structure:
   tracks, clips, devices, MIDI notes, tempo, transactions with undo, context-menu
   integration, and *offline* audio bouncing (`renderPreFxAudio()`).

3. **Real-time audio is explicitly out of scope.** Ableton's own positioning:
   extensions are *not* designed for continuous, real-time, or signal-processing
   tasks — no real-time audio processing, no analysis of sound while it plays, no
   audio I/O routing manipulation, no headless execution. The SDK is a workflow-
   automation surface complementary to Max for Live, not a live data source.

Stem-level reactivity needs a continuous, low-latency per-bus level/onset stream.
The SDK cannot provide one by design, not merely by current beta limitation. **The
SDK dependency is killed.** Re-evaluate only if a future stable release adds
real-time metering callbacks, which its stated positioning argues against.

Sources:
- https://ableton.github.io/extensions-sdk/
- https://www.ableton.com/en/blog/introducing-extensions-sdk/
- https://help.ableton.com/hc/en-us/articles/27303428331420-Ableton-Extensions-FAQ

## Part 2: Stem-level reactivity without the SDK (confirmed)

The repo already contains two independent transport paths that reach the bridge
and renderer. Neither requires beta software.

### Path A — AbletonOSC track meters (works today, zero new code)

The bridge already polls `track.output_meter_level` for **every track** in the set
every 50 ms (`index.ts:1032`), and `deriveAudioFeaturesFromTrackData`
(`index.ts:537`) maps individual track meters into `AudioFeatures.bass/mid/high`
via `ControlState.trackMapping.{bassTrack,midTrack,highTrack}`.

In Live, group tracks (buses) appear in the track list and report
`output_meter_level` like any other track. A Rezz-style set with a **kick bus**
and **vocal bus** as group tracks gets stem-level reactivity *now* by pointing
`bassTrack` at the kick bus index and `midTrack` (or `highTrack`) at the vocal bus
index from the controls page. No code change.

Limitations, measured against the codebase:

| Limitation | Impact |
|---|---|
| 20 Hz poll rate (50 ms interval) | Fine for level-following (intensity, depth); marginal for sharp kick onsets — worst-case ~50–100 ms visual lag |
| `output_meter_level` has meter ballistics (smoothed, not raw RMS) | Transient detector (`audio-transient-trigger.ts`) sees softened edges; `pulse` is already approximated from energy for this reason (`index.ts:557`) |
| Track indices shift when tracks are added/removed | Existing `trackMapping` limitation, not new |
| Only three mapped slots (`bass`/`mid`/`high`) | Enough for kick + vocal + one more; more stems would need an `AudioFeatures`/mapping extension |

### Path B — per-stem analysis in `bevyosc-vst` (high-fidelity escalation)

The existing VST3 plugin (`plugins/bevyosc-vst/src/lib.rs`) already runs **inside
Live's audio path** — its `process()` (lib.rs:179) currently ignores `_buffer` and
only diffs parameters — and already sends OSC to the bridge's UDP `:12000` socket.
Placing one instance on the kick bus and one on the vocal bus, then computing
block RMS + onset from `_buffer` in `process()`, yields sample-accurate stem
features at audio rate with no beta dependency.

Required changes (S–M, sized for the wildcard, **not** done in this spike):

- A per-instance "stem id" enum param so each instance labels its bus.
- Block RMS/peak + simple onset (energy delta) computed in `process()`; sent as a
  new `/bevyosc/vst/audio/<stem>` address family, rate-limited to ~30–60 Hz so the
  audio thread's existing fire-and-forget UDP sender pattern holds.
- Bridge: validation in `osc-validation.ts` plus a handler in `index.ts` that
  merges stem features into the `AudioFeatures` flow (and the #124 router, once it
  lands).
- Per-stem state is a handful of floats per instance — comfortably inside the
  10 MB idle-memory budget.

### Interaction with sibling issues

- **#124 Audio-Control Router Phase 1:** stem features are just additional
  `AudioFeatures` sources; the router design (see
  `docs/spikes/audio-as-controller.md`) consumes them unchanged. No conflict.
- **#128 Ableton Link Sync:** Link carries tempo/phase, not audio — orthogonal.

## Recommendation for the wildcard

Re-frame the Ableton Extensions wildcard as **"Stem-Level Reactivity"** with no
Extensions SDK dependency:

1. **Phase 1 (config-only):** document and demo the Path A group-bus mapping
   recipe; verify kick-bus onset quality at 20 Hz with the existing transient
   detector.
2. **Phase 2 (only if Phase 1 onset latency is insufficient for the Rezz
   use-case):** implement Path B per-stem VST analysis.

Proposed acceptance criteria for the follow-on wildcard issue:

- [ ] Kick-bus and vocal-bus group tracks mapped via `trackMapping` drive distinct
      renderer parameters in a live set (Path A demo)
- [ ] Measured onset-to-visual latency for Path A recorded; go/no-go threshold for
      Path B agreed (suggest: Path B if > 100 ms perceived)
- [ ] If Path B triggers: stem id param, in-`process()` RMS/onset, rate-limited
      `/bevyosc/vst/audio/<stem>` messages, bridge validation + `AudioFeatures`
      merge, unit tests for the new OSC address family
- [ ] No dependency on Live beta builds or the Extensions SDK

## Acceptance Criteria (from Issue #129)

- [x] Time-boxed spike completed before any wildcard implementation work starts
- [x] Spike outcome explicitly confirms or kills the stem-level reactivity path
      (SDK path killed; feature path confirmed via AbletonOSC meters / VST
      analysis)
- [x] Findings written up under `docs/spikes/`
