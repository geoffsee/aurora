# Design Spike: Parameter Automation Recorder

**Issue:** #57  
**Sprint:** #58 (Audio-reactivity gap / generative foothold)  
**Personas:** Brian Eno, Kaitlyn Aurelia Smith  
**Status:** Spike — no implementation commitment

---

## Executive Summary

A parameter automation recorder captures time-series mutations to `ControlState`, stores them as a compact diff sequence, and replays them back through the bridge so every connected client receives the same deterministic, loopable performance. The mechanism enables generative durational behavior (Eno: "Can the system surprise me after an afternoon?") and tactile-to-generative handoff (Smith: "Is this composed, or just random?").

---

## Current State

`controls.html` already contains a client-side prototype:

| Symbol | Location | Behavior |
|---|---|---|
| `recording` | `controls.html` in-memory array | `Array<{ t: number, state: ControlState }>` — full snapshots, one per control event |
| `isRecording` | local flag | set by `startRecording()` |
| `playReplay()` | `controls.html` | schedules each frame with `setTimeout`, applies full state via `Object.assign`, sets `state.replaying = true` |
| `stopReplay()` | `controls.html` | clears all timers, sets `state.replaying = false` |
| `syncFromRemote()` | `controls.html` | drops incoming bridge state while `state.replaying === true` to prevent live input clobbering playback |

Limitations of the prototype:

- Recordings are browser-session-scoped; page reload loses everything.
- Full-snapshot frames are wasteful — a crossfade touch stores all 30+ fields even if only one changed.
- Playback is `setTimeout`-driven, which drifts under tab throttling.
- Only one client drives playback; other connected clients see the state changes but do not know a replay is in progress.
- No looping, punch-in/out, or slot management.
- The bridge (`index.ts`) does not participate beyond accepting the resulting state broadcasts.

---

## Recording Format

### Design Decision: Diffs, Not Snapshots

Store only changed fields per frame. This reduces file size by roughly 10–30x for typical VJ sessions (where a single knob is touched at a time) and makes punch-in/out trivial — replace only the frames in the punch region with new diff frames covering the same fields.

### File Schema (JSON)

```jsonc
{
  "formatVersion": 1,
  "controlStateSchemaVersion": 1,   // must match CONTROL_STATE_SCHEMA_VERSION at record time
  "capturedAt": 1717100000000,      // Unix ms, informational
  "durationMs": 32400,              // last frame tMs, used for loop wrap
  "frames": [
    { "tMs": 0,     "diff": { "crossfade": 0.5, "intensity": 0.82 } },
    { "tMs": 1240,  "diff": { "crossfade": 0.62 } },
    { "tMs": 4800,  "diff": { "palette": 0.3, "depth": 0.4 } },
    { "tMs": 32400, "diff": { "crossfade": 0.5 } }
  ]
}
```

**Field notes:**

- `formatVersion` — recording wire-format version, separate from `controlStateSchemaVersion`.
- `controlStateSchemaVersion` — checked at load time; a mismatch is a hard error (log and refuse, do not silently discard frames).
- `tMs` — milliseconds from the start of the recording, zero-based.
- `diff` — a `Partial<ControlState>` excluding `schemaVersion`, `replaying`, and the monotonic version counters (`flashVersion`, `resetVersion`, `cueVersion`). Those are always excluded from recording because they are edge triggers, not steady-state values.
- `trackMapping` is recorded as a nested diff object mirroring the existing `TrackMapping` shape.

### What Is and Is Not Recorded

| Included | Excluded |
|---|---|
| All continuous parameters (crossfade, intensity, palette, etc.) | `schemaVersion` |
| `deckAMode`, `deckBMode` | `replaying` |
| Boolean flags: rings, strobe, blackout, freeze, etc. | `flashVersion`, `resetVersion`, `cueVersion` (edge triggers) |
| `trackMapping` | `strobeLockout` (safety interlock — never automate) |
| `bpm`, `speed` | |

`strobeLockout` is excluded permanently: automating a safety interlock could be hazardous in a dark venue.

### Capture Logic (How Diffs Are Derived)

On each control event during recording, compute `diff = changedKeys(previousState, newState)`. A naïve implementation does a shallow field comparison; for `trackMapping` it descends one level. Frames with an empty diff are dropped.

---

## Playback Engine

### Placement: Bridge Module (`automation-player.ts`)

Playback belongs in the bridge process (`index.ts`), not in the browser. Reasons:

1. `index.ts` is the single source of truth for `ControlState` — playback must write through `mergeControlState()`, not around it.
2. Browser `setTimeout` drifts under tab-throttling policies; `Bun.setInterval` in the bridge does not.
3. All connected clients (controls page, projector page, future VST clients) need to receive playback simultaneously. Bridge-driven playback achieves this without coordination.

### Module Interface

```typescript
// automation-player.ts (proposed)
export type AutomationRecording = { /* schema above */ };

export interface AutomationPlayer {
  load(recording: AutomationRecording): void;
  play(opts: { loop: boolean }): void;
  stop(): void;
  isActive(): boolean;
  positionMs(): number;  // current playhead position
}
```

The player is instantiated once in `index.ts` and injected with a `mergeControlState` callback.

### Tick Mechanism

Use a single `setInterval` at approximately 16 ms (one animation frame) in the bridge. On each tick:

1. Advance the playhead: `playheadMs = Date.now() - playbackStartedAt`.
2. Drain all frames whose `tMs <= playheadMs` and have not been applied yet.
3. Call `mergeControlState(frame.diff)` for each drained frame in order.
4. If `playheadMs >= recording.durationMs`:
   - **Loop mode:** wrap `playbackStartedAt` so the next tick restarts from `tMs = 0`.
   - **One-shot mode:** call `stop()`.

The player holds a cursor index into the sorted `frames` array to avoid re-scanning from the beginning on every tick. On loop wrap, the cursor resets to 0.

### Loop Behaviour

- Looping is a per-playback flag passed to `play({ loop: true })`.
- At the loop boundary the bridge applies no gap: the last diff frame executes, then `tMs = 0` frame executes immediately on the next tick.
- A `loopCount` counter is tracked internally for diagnostics but not exposed to clients in v1.

### `replaying` Flag

The bridge sets `replaying: true` in `ControlState` at the moment `play()` is called and `replaying: false` when `stop()` is called. This is already wired in `controls.html`'s `syncFromRemote()`: it drops incoming state updates while `replaying === true`, preventing the live knob position from overwriting playback. No change is needed to the existing guard.

---

## Punch-In / Punch-Out

### Definition

- **Punch-in:** while playback is running, the operator begins recording. Live control events from this point forward replace frames in the current recording at the corresponding time window.
- **Punch-out:** recording stops; playback continues from the punch point using the new frames.

### Implementation Strategy

When punch-in is triggered:

1. Record the punch-in playhead position: `punchInMs`.
2. Begin capturing live diffs as usual.
3. At punch-out, record `punchOutMs`.
4. Splice the new diff frames into the recording: remove all existing frames where `punchInMs <= tMs <= punchOutMs`, insert the new frames (with `tMs` re-based to absolute recording time).
5. If `punchOutMs > recording.durationMs`, extend `durationMs` to `punchOutMs`.

Punch-in during loop playback is scoped to the current loop iteration — the bridge pauses the loop counter advancement while punch recording is active and resumes after punch-out.

---

## Bridge Integration Points

### New WebSocket Addresses

| Address | Direction | Payload | Notes |
|---|---|---|---|
| `/bevyosc/automation/record/start` | client → bridge | `{}` | Begin capture |
| `/bevyosc/automation/record/stop` | client → bridge | `{}` | End capture, retain in bridge memory |
| `/bevyosc/automation/play` | client → bridge | `{ loop: boolean }` | Begin playback |
| `/bevyosc/automation/stop` | client → bridge | `{}` | Stop playback |
| `/bevyosc/automation/punch/in` | client → bridge | `{}` | Begin punch-in during active playback |
| `/bevyosc/automation/punch/out` | client → bridge | `{}` | End punch-in |
| `/bevyosc/automation/save` | client → bridge | `{ slot: 1–6 }` | Persist recording to disk slot |
| `/bevyosc/automation/load` | client → bridge | `{ slot: 1–6 }` | Load recording from disk slot into memory |
| `/bevyosc/automation/status` | bridge → all clients | `{ active, loop, positionMs, durationMs, slot }` | Emitted on every tick while active; once on stop |

These addresses follow the existing `/bevyosc/*` namespace convention. The bridge's `websocket.message` handler in `index.ts` grows one new routing branch for `address.startsWith("/bevyosc/automation/")`.

### `ControlState` Changes Required

No new fields needed. `replaying: boolean` already exists and is already guarded in `syncFromRemote()`. The bridge drives it; the client prototype's local management of `state.replaying` becomes redundant after migration but does not break anything.

---

## Storage: Preset-Adjacent vs. Separate Store

### Recommendation: Separate Slot Store

Automation recordings are not presets. Presets are instantaneous snapshots; recordings are time-series artifacts that may span minutes. Storing them in the same 1–6 slot namespace would collide with preset recall in the VST and controls page.

**Proposed layout:**

```
recordings/
  rec-1.json
  rec-2.json
  ...
  rec-6.json
```

Six slots mirror the preset slot count (defined by `PRESET_SLOT_MIN/MAX` in `osc-validation.ts`), giving operators a 1:1 mental model: Preset 3 pairs naturally with Recording 3 for a given song section.

Recording files are written by the bridge process on `/bevyosc/automation/save` and read on `/bevyosc/automation/load`. The directory is created on first save; its absence is not an error on startup.

**Alternatives considered:**

| Option | Pro | Con |
|---|---|---|
| Embed in preset JSON (`presets/slot-N.json`) | Single file per section | Bloats preset files; preset recall must skip the recording field |
| In-memory only (no disk) | Zero storage complexity | Recordings lost on bridge restart — unacceptable for durational/installation use |
| Named files (user-chosen names) | More expressive | Requires a file-browser UI that does not exist |
| Separate store (recommended) | Clean separation, matches preset mental model | Requires new directory and new save/load logic |

---

## Migration Path from Client-Side Prototype

The browser-side `recording`, `playReplay()`, and `stopReplay()` in `controls.html` should remain functional until the bridge-side engine ships (issue #57 is a spike; no implementation is committed here). When the implementation issue lands:

1. The controls page sends `/bevyosc/automation/record/start` instead of setting `isRecording` locally.
2. The bridge sends diff frames back via `/bevyosc/automation/status` so the controls page can render a timeline.
3. `playReplay()` and `stopReplay()` are replaced by sending `/bevyosc/automation/play` and `/bevyosc/automation/stop` to the bridge.
4. The local `replayTimers` array and `setTimeout` scheduling are removed from `controls.html`.

The migration is additive — the WebSocket message protocol already carries everything needed.

---

## Open Questions (Not Blocking the Spike)

1. **Tempo alignment:** Should `tMs` timestamps be stored in absolute milliseconds or as beat-relative positions (bar + beat offset)? Beat-relative positions survive tempo changes during loop playback at the cost of requiring a live tempo reference. Recommendation: absolute ms in v1; beat-relative as a `formatVersion: 2` upgrade once the MIDI clock sync is stable.

2. **Automation of `bpm`:** Recording BPM changes during MIDI-slaved sessions may produce playback artifacts if the MIDI clock is active during playback. Suggest recording `bpm` but suppressing playback of `bpm` diffs when `isMidiClockActive()` returns true.

3. **Undo:** Punch-in is destructive (replaces frames). A single undo level (keep the pre-punch recording in memory) costs negligible memory for typical session lengths and prevents show-stopping accidents.

4. **Export / import:** Recordings as JSON files are human-readable and can be version-controlled alongside presets, enabling Eno-style archival and resurrection of old patches.

5. **Multi-layer automation:** A single recording layer is sufficient for v1. A future design could stack layers (one per parameter group), but this is out of scope and probably over-engineering for the generative use case here.

---

## Acceptance Criteria (from Issue #57)

- [x] Spike documents the recording format (time-series `ControlState` diffs).
- [x] Spike documents the playback architecture (bridge-side `AutomationPlayer`, `mergeControlState` integration).
- [x] Spike documents the bridge integration point (new `/bevyosc/automation/*` WebSocket addresses, `automation-player.ts` module).
- [x] Spike addresses looping (per-playback flag, cursor-reset on wrap).
- [x] Spike addresses punch-in/out (frame splice at punch window).
- [x] Spike addresses persistence (separate `recordings/rec-N.json` slot store, rationale vs. preset-adjacent).
