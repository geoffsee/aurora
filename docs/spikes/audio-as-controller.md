# Design Spike: "Audio as the Only Controller"

**Issue:** #109  
**Tracker:** #110  
**Sprint:** Shader visual regression harness, audio transient burst trigger, composite presets  
**Personas:** Alessandro Cortini, Brian Eno  
**Status:** Spike — no implementation commitment

---

## Summary

This spike evaluates whether audio feature vectors (onset, band energy, transients) can
serve as the sole control surface for the VJ renderer, removing the requirement for MIDI
hardware, a VST plugin, or manual controls-page interaction during a live set.

The feature is tractable. The system already has all the required data types and routing
primitives in separate subsystems that have never been connected. Two phases exist:

- **Phase 1 (bridge-side routing, Ableton still required):** Audio features already
  reaching the browser are reported back to the bridge, which applies configurable
  mappings to `ControlState`. No new hardware or audio capture required.
- **Phase 2 (browser-native audio capture):** `getUserMedia` + Web Audio API in
  `index.html` provides a third audio source (after AbletonOSC and demo mode) that
  runs with zero external software.

Phase 1 is the tractable implementation target for a follow-on issue. Phase 2 is a
self-contained extension that can be scoped separately.

---

## Current System State

### Audio data flow (live mode)

```
Ableton Live
  │
  │ UDP OSC /live/song/get/track_data
  ▼
Bridge (index.ts)  ──broadcast()──►  WebSocket
                                          │
                                          │ /live/song/get/track_data {meters[]}
                                          ▼
                                    index.html
                                    recomputeEnergy()
                                    oscState.{energy, bass, mid, high, deckA, deckB}
                                          │
                                          │ window.__bevyoscOsc*() — polled every frame
                                          ▼
                                    WASM renderer (src/main.rs)
                                    VjState.{osc_energy, osc_bass, …}
```

### Audio data flow (demo mode)

```
Bridge setInterval (index.ts:1012)
  synthesizes rawFeatures: AudioFeatures
  stepAudioEma() → smoothed
  ──► WebSocket  /bevyosc/demo/audio {energy, bass, …}
                        │
                        ▼
                  index.html  sets oscState directly
                  (same downstream path as live mode)
```

### Control data flow

```
Controls page / VST / MIDI / automation
  │
  │ WebSocket /bevyosc/control/state  or  UDP VST OSC
  ▼
Bridge (index.ts)
  mergeControlState() → coerceControlState()
  ──► broadcast /bevyosc/control/state → all WebSocket clients
                                              │
                                              │ window.__bevyoscControl*() — polled every frame
                                              ▼
                                        WASM renderer
                                        VjState.{crossfade, palette, deckAMode, …}
```

### The gap

Audio features and ControlState travel through **entirely separate channels**. There is
no path from `oscState.{energy, bass, high, …}` in `index.html` to a `ControlState`
mutation. A transient detected by `recomputeEnergy()` cannot currently trigger a cue
change, deck mode switch, or crossfader jump without a human or a MIDI note.

The bridge has the `AudioFeatures` type (`audio-ema.ts`) and the `mergeControlState`
function, but nothing connects them in the live-mode path. Demo mode computes
`AudioFeatures` in the bridge but does not feed them into routing; live mode computes
them only in the browser.

---

## Phase 1: Bridge-Side Audio-to-Control Routing

### Required data path addition

The browser page already computes current audio features on every frame via
`recomputeEnergy()` and the `oscState` object. Sending them back to the bridge on a
fixed interval closes the loop:

```
index.html  setInterval ~50ms
  │  WebSocket  /bevyosc/audio/features  { energy, bass, mid, high, pulse }
  ▼
Bridge  new handler in websocket.message
  AudioControlRouter.onFeatures(features)
  ── applies configured mappings ──► mergeControlState(diff)
```

The bridge already has all the primitives:

| Existing piece | Role in the new path |
|---|---|
| `AudioFeatures` type (`audio-ema.ts`) | Type for the incoming features message |
| `mergeControlState()` (`index.ts`) | Write target — same path as all other state mutations |
| `broadcastControl()` → `coerceControlState()` | Guarantees all fields stay in range regardless of router output |
| `stepAudioEma()` + `AudioEmaAlphas` (`audio-ema.ts`) | Optional: bridge can apply a second EMA pass to smooth routing inputs independently of renderer EMA |
| Demo mode `rawFeatures` (`index.ts:1020`) | Already live — demo mode can feed the router at no extra cost |

### New module: `audio-control-router.ts`

```typescript
export type AudioMapping = {
  source: keyof AudioFeatures;     // "energy" | "bass" | "mid" | "high" | "pulse"
  target: keyof ControlState;      // "crossfade" | "palette" | "intensity" | …
  mode: "continuous" | "threshold";

  // continuous: target = lerp(targetMin, targetMax, clamp(source, 0, 1))
  targetMin: number;
  targetMax: number;

  // threshold: fires mergeControlState once per rising edge above level
  level: number;                   // 0..1
  onRise: (current: ControlState) => Partial<ControlState>;  // function form supports increment semantics (e.g. flashVersion + 1)
  offDelay: number;                // ms to wait before firing onRise again (debounce)
};

export interface AudioControlRouter {
  setMappings(mappings: AudioMapping[]): void;
  onFeatures(features: AudioFeatures): void;   // called by bridge on each audio tick
  isActive(): boolean;
}
```

The router holds per-mapping edge state (last value, last-fired timestamp) for debounce
and rising-edge detection. It calls `mergeControlState` only when a mapping produces
a diff — no no-op broadcasts.

### Transient / onset integration (#107)

Issue #107 delivers a transient burst detection primitive. In this routing context,
the transient signal maps naturally to `threshold` mode:

```typescript
// Example: transient burst → flash
{
  source: "pulse",    // pulse is the sharpest transient indicator in AudioFeatures
  mode: "threshold",
  level: 0.75,
  onRise: (s) => ({ flashVersion: s.flashVersion + 1 }),
  offDelay: 200,
}
```

The routing module is the consumer of the #107 primitive; the two issues compose
cleanly. Neither blocks the other — the routing layer works with any `AudioFeatures`
value regardless of how `pulse` is computed.

### ControlState integration

One new field added to `ControlState`:

| Field | Type | Purpose |
|---|---|---|
| `audioControlMode` | `boolean` (default `false`) | Global enable/disable; existing behavior is fully preserved when `false` |

`audioControlMode` is a plain boolean, no clamping required.

`CONTROL_STATE_SCHEMA_VERSION` bumps from current to current + 1. Migration: if
incoming state lacks `audioControlMode`, default to `false`. Existing presets and
recordings are unaffected.

Routing configuration (`AudioMapping[]`) is **not** stored in `ControlState`. It lives
in a separate `audio-mappings.json` bridge config file, loaded at bridge startup and
reloaded via a new `/bevyosc/audio/config` WS address. This keeps routing config out
of `coerceControlState` validation complexity and out of the WASM renderer's getter
surface.

### Controls page changes

A new "Audio Control" panel in `controls.html`:

- Toggle for `audioControlMode`
- Live audio feature meters (reads back from `/bevyosc/audio/features` messages)
- Per-mapping editor: add/remove mappings, configure source, target, mode, thresholds
- Optional: visual indicator showing which mappings are currently active/firing

The panel renders only when `audioControlMode` is `true` to reduce noise for operators
who do not use the feature.

### Bridge integration points

| Location | Change |
|---|---|
| `index.ts` websocket.message handler | Add `case "/bevyosc/audio/features":` branch — validates payload as `AudioFeatures`, calls `router.onFeatures()` |
| `index.ts` demo mode setInterval | After `stepAudioEma`, also call `router.onFeatures(smoothed)` — demo mode works automatically |
| `index.ts` module-level setup | Instantiate `AudioControlRouter`; pass `mergeControlState` as callback; load initial mappings from `audio-mappings.json`; reload via `/bevyosc/audio/config` WS message |
| `osc-validation.ts` | Add `"audio_control_mode"` to `VST_CONTROL_NAMES` and matching case in `applyVstControlMessage` so the VST can toggle the mode |

### Files touched (Phase 1)

| File | Change |
|---|---|
| `audio-control-router.ts` | New module — `AudioMapping` type, `AudioControlRouter` implementation |
| `audio-mappings.json` | New config file — default empty array; loaded at bridge startup; mutated via `/bevyosc/audio/config` |
| `index.ts` | New WS message handlers for `/bevyosc/audio/features` and `/bevyosc/audio/config`; router instantiation and wiring; demo-mode router feed |
| `osc-validation.ts` | Schema version bump; add `audio_control_mode` to `VST_CONTROL_NAMES` |
| `control-state-schema.ts` | Migration for `audioControlMode` field only |
| `index.html` | New `setInterval` to send `/bevyosc/audio/features` from `oscState` to bridge WS |
| `controls.html` | Audio Control panel UI |
| `tests/` | Unit tests for `AudioControlRouter`: threshold rising-edge, debounce, continuous mapping, empty mappings no-op |

`src/main.rs` and `assets/shaders/` require **no changes**. The WASM renderer is
unaware of where ControlState values come from; it only reads the getter values.

---

## Phase 2: Browser-Native Audio Capture

Phase 2 decouples the audio source from Ableton entirely. The Web Audio API provides
microphone or line-in input via `getUserMedia`. An `AnalyserNode` produces an FFT
buffer from which band energies are derived — the same quantities that `recomputeEnergy()`
computes from AbletonOSC meter data.

### Changes confined to `index.html`

```javascript
// New "Web Audio" source alongside existing "Ableton OSC" and "Demo" sources
async function startWebAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const bins = new Float32Array(analyser.frequencyBinCount);
  setInterval(() => {
    analyser.getFloatFrequencyData(bins);
    // derive bass/mid/high from bin ranges
    // write into oscState.*
    // the same /bevyosc/audio/features path to bridge picks it up automatically
  }, 50);
}
```

The computed values write into `oscState` — the same object that AbletonOSC and demo
mode populate. All downstream paths (renderer getters, bridge audio features, routing)
are unchanged. Phase 2 is a new input source, not a new routing path.

### Blocker: user media permission

`getUserMedia` requires a user gesture and explicit permission prompt. The projector
page (`:3000`) is a fullscreen canvas — adding a permission request there would disrupt
the presentation surface. The correct placement is a new toggle in `controls.html`
(`:3001`) that initiates the capture and sends the resulting features over the existing
WebSocket bus.

This is a UX design decision, not a technical blocker. The API is available in all
supported browsers (Chrome, Firefox, Safari ≥ 14.1).

**Deployment constraint:** `getUserMedia` requires a **secure context** — either
`localhost` or an HTTPS origin. Serving the controls page from a LAN IP without TLS
(e.g. rehearsal setup at `192.168.x.x:3001`) will fail silently with `NotAllowedError`.
The follow-on implementer must document that any non-localhost deployment of the
controls page requires HTTPS or a localhost tunnel.

### Files touched (Phase 2 only)

| File | Change |
|---|---|
| `controls.html` | "Web Audio Input" toggle in Audio Control panel; `getUserMedia` capture; features sent as `/bevyosc/audio/features` |
| `index.html` | Optional: local Web Audio capture for operator-solo mode (projector page with no controls page open) |

Phase 2 **does not require any bridge changes** beyond what Phase 1 already delivers.

---

## What Blocks Full Implementation

| Blocker | Phase | Severity | Resolution |
|---|---|---|---|
| Bridge does not receive audio features in live mode | Phase 1 | **Required** | Add `/bevyosc/audio/features` WS message from `index.html` → bridge |
| `ControlState` schema lacks `audioControlMode` | Phase 1 | **Required** | Schema bump + migration (standard pattern) |
| Routing config file (`audio-mappings.json`) needs schema and reload endpoint | Phase 1 | Medium | New `/bevyosc/audio/config` WS address; JSON validation in bridge |
| `flashVersion` is an edge-trigger counter — `onRise` must return an increment, not a static set | Phase 1 | Medium | Resolved by `onRise: (current) => Partial<ControlState>` function signature |
| Web Audio capture requires user permission and a UX flow | Phase 2 | Gating | Controls-page toggle; outside Phase 1 scope |
| No native audio analysis in bridge process (no `@types/node` audio API) | Phase 2 | Phase 2 only | Resolved by browser-side capture in `controls.html` |

---

## Interaction with Sibling Issues

**#107 Audio Transient Burst Trigger**: delivers `pulse`/onset as a reliable high-pass
signal in `AudioFeatures`. This spike assumes `pulse` maps to `threshold` mode triggers.
If #107 adds a dedicated `transient: number` field to `AudioFeatures`, the router gains
a cleaner onset source without changes to the routing module itself.

**#108 Shader + Audio Preset Bundles**: preset bundles set `ControlState` values
including `audioControlMode`. A bundle that sets `audioControlMode: true` activates
the routing layer; the specific mapping graph is loaded separately from
`audio-mappings.json` and is not encoded in the bundle. No conflict; bundles use the
standard ControlState preset path.

**C-2 Automation time-stretch** (from audit #91): time-stretch is on the playback
path; audio routing is on the live-input path. They do not interact unless a performer
runs both simultaneously. When `replaying: true`, the bridge should continue applying
audio routing unless the operator explicitly disables it — the two control paths are
additive.

---

## Recommendation

Implement Phase 1 as the follow-on implementation issue. Phase 2 can be scoped
separately or appended as an optional acceptance criterion.

The key design decision for the follow-on issue: **where does routing config live?**
The two options are:

| Option | Pro | Con |
|---|---|---|
| `audioMappings` in `ControlState` | Synced to controls page via existing WS; saves/loads with presets; VST can toggle `audioControlMode` | Schema bump; complex `coerceControlState` validation; WASM renderer receives unnecessary config data |
| Separate bridge config file (`audio-mappings.json`) | Bridge-only concern; no schema bump; no renderer overhead | Controls page needs new WS API to read/write config; not portable as presets; VST cannot modify mappings |

**Recommendation:** `ControlState` for `audioControlMode` (boolean, simple, VST-accessible);
separate bridge config for `audioMappings` (complex nested structure, not performance
state, loaded once at bridge startup or via a new `/bevyosc/audio/config` WS address).
This follows the existing pattern: `emaAlphas` lives in `ControlState` because they are
live-tunable per-band scalars; a mapping graph is configuration, closer to `trackMapping`
in complexity but more volatile.

---

## Proposed Acceptance Criteria for Follow-On Implementation Issue

- [ ] New `audio-control-router.ts` module with `AudioMapping` type and
      `AudioControlRouter` interface
- [ ] Bridge feeds audio features to router from demo-mode timer and from new
      `/bevyosc/audio/features` WebSocket message
- [ ] `index.html` sends computed `oscState` features to bridge on a ~50 ms interval
      when bridge WebSocket is open
- [ ] `audioControlMode: boolean` added to `ControlState` (schema bump + migration);
      router ignores all messages when `false`
- [ ] Routing config loaded from `audio-mappings.json` at bridge startup; reloaded via
      new `/bevyosc/audio/config` WS address
- [ ] `threshold` mode correctly debounces rising-edge detection; fires `onRise` diff
      at most once per `offDelay` ms
- [ ] `continuous` mode clamps output to `[targetMin, targetMax]` and calls
      `mergeControlState` only when value changes by more than a small epsilon (no
      no-op broadcast spam)
- [ ] `flashVersion` and other edge-trigger counters handled as increment-not-set
- [ ] Controls page shows audio feature meters and `audioControlMode` toggle
- [ ] All existing behaviour unchanged when `audioControlMode` is `false` (default)
- [ ] Unit tests cover: rising-edge trigger, debounce guard, continuous mapping,
      empty-mappings no-op, disabled-mode passthrough
- [ ] Demo mode works end-to-end with a sample mapping config

---

## Acceptance Criteria (from Issue #109)

- [x] Spike explores feasibility of "Audio as the Only Controller" using audio feature
      vectors as the sole trigger/control surface with no MIDI or OSC required
- [x] Identifies required system changes in `index.ts` bridge, controls page, and WASM
      renderer (renderer: no changes; bridge: new WS handler + router module; controls
      page: feature meters + mode toggle)
- [x] Identifies what blocks full implementation (audio features not reaching bridge in
      live mode; schema changes for routing config; edge-trigger counter semantics)
- [x] Proposes concrete acceptance criteria for a follow-on implementation issue
- [x] No implementation produced — output is the proposed implementation issue above
