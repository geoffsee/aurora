# Performer-Less Set Dry Run

**Issue:** #193 · **Tracker:** #197 · **Source:** Strategic Review #172, item #5

The autonomy subsystems for an unattended set — the audio-control router, preset
morph, the audio transient detector → automation playback, and clock-source
arbitration — all exist and are individually unit-tested. They had **never been
run end-to-end together** through the real bridge: the WebSocket fan-out tests
run against a stub server (`tests/global-setup.ts`), not `index.ts`. This dry run
is the forcing function that wires them together and proves the system can drive
visuals with no human at the controls.

## Run it

```bash
bun run dry-run                       # ~30s window, default
DRY_RUN_DURATION_MS=600000 bun run dry-run   # sustain across an afternoon
DRY_RUN_REPORT=report.json bun run dry-run   # also write a JSON report
```

The harness (`scripts/dry-run.ts`):

1. Boots the real bridge (`index.ts`) on isolated ports (3900/3901, UDP
   11900/11901/12900) so it never clashes with a running dev server. No
   AbletonOSC is required — the bridge's `ECONNREFUSED` polling noise is expected
   and swallowed.
2. Connects as a headless WebSocket client, standing in for the projector page —
   it only *observes* the broadcast `/bevyosc/control/state` stream, which is
   exactly what the WASM renderer reads each frame. A moving control stream means
   the visuals would move.
3. Drives the stack with **zero human input**:
   - enables `demoMode` (the single performer-less audio source that feeds
     *both* the router and the transient detector) and `audioControlMode`;
   - starts automation playback (`/bevyosc/automation/play-loop`);
   - sweeps the preset morph continuously across the cue ring, as an absent
     performer's fader would.
4. After the window, prints a per-subsystem report and exits non-zero only if a
   **required** check failed (bridge never booted, or the control stream never
   moved). Soft per-subsystem signals are reported as `gaps` but do not fail the
   run — the first runs are expected to surface known gaps.

### What each check means

| Check | Proves |
|---|---|
| `bridge_boot` | The real bridge came up and broadcast control state. |
| `visuals_driven` | ≥3 distinct control-state fields moved over the window. |
| `demo_audio` | The demo audio pipeline (`/bevyosc/demo/audio`) is live. |
| `audio_router_continuous` | `energy→intensity` / `bass→depth` mappings drive visuals. |
| `preset_morph` | OSC-controlled preset morph moves the `morph` field. |
| `audio_router_threshold` | The `pulse→flashVersion` threshold mapping fires. |
| `transient_automation` | The transient detector engaged automation (`replaying=true`). |
| `clock_arbiter` | A clock source was selected (internal floor when no Link/MIDI). |

## Reproducibility

The run is reproducible from a clean checkout with a single command — it spawns
its own bridge and tears it down, binds only isolated ports, and needs no
Ableton, MIDI hardware, or GPU. The synthetic audio is time-based (not bit-exact
pixels), but the **pass/fail shape and the gaps it surfaces are stable** across
runs and machines.

## Integration gaps surfaced (filed as issues)

The first end-to-end run did exactly its job — it surfaced two integration gaps
that no unit test could see, both now filed:

- **#199** — the shipped default audio mapping `pulse → flashVersion`
  (`level: 0.75`, `audio-mappings.json`) is **unreachable** under demo /
  performer-less audio: EMA-smoothed `pulse` peaks ~0.48, so the
  out-of-the-box config silently never flashes. Reported by the run as
  `[GAP] audio_router_threshold`.
- **#200** — the Phase 2 browser-audio path (`/bevyosc/audio/features`) drives
  the router but **not** the transient → automation detector, unlike the demo
  and live paths. Found while choosing the harness's audio source; the demo loop
  is the only source that drives both subsystems, which is why the harness uses
  it.

When a future run surfaces a new gap, file it as a `bug` issue referencing #193
and add it to the list above.
