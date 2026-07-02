# Performer-less dry run (`bun run dry-run`)

`scripts/dry-run.ts` boots the real bridge (`bridge/index.ts`) on isolated ports
and drives the whole autonomy stack end-to-end with **no human at the controls**:
demo audio → the audio-control router (continuous + threshold mappings), the
audio transient detector → automation playback, OSC-controlled preset morph, and
clock-source arbitration. The harness connects as a headless WebSocket client
(standing in for the projector page) and watches the broadcast
`/aurora/control/state` stream, proving the visuals would be driven without
anyone touching a knob.

Each subsystem is unit tested in isolation and the WS fan-out tests run against a
stub server, so this is the only thing that exercises them wired together through
the real bridge.

## Two modes

### One-shot (forcing function)

```bash
bun run dry-run
```

A short (~30 s) window. Only the acceptance-criteria **required** checks fail the
run; soft per-subsystem gaps are reported as `GAP` lines but do not fail it — the
first run is expected to surface known gaps to file as issues.

### Standing gate — the 60-minute clean run (#213)

```bash
DRY_RUN_SUSTAINED=1 bun run dry-run
```

A sustained **60-minute** run with horizon stall-detection. This is the standing
gate that keeps the performer-less autonomy stack honest cycle-over-cycle. Under
sustain **every** check is gated: the run passes only with **zero `GAP` lines**,
and the pass/fail verdict is asserted from the accumulated checks (exit code
`0`/`1`), not merely printed. It emits a heartbeat every 5 minutes so an operator
or CI log can see the gate is alive and watch the stalls stay flat.

The graduation bar for the performer-less set is a sustained run that completes
with zero gaps.

## Checks

Required (fail the run in either mode):

- `bridge_boot` — control-state broadcasts were received.
- `visuals_driven` — enough distinct fields moved over the window.
- `demo_audio` — demo audio frames arrived.
- `audio_router_continuous` — the router moved intensity/depth in a router-only
  window.
- `preset_morph` — the preset morph field moved.

Soft (reported as `GAP` one-shot; **fail the sustained gate**):

- `audio_router_threshold` — the `pulse→flashVersion` threshold fired (#199).
- `transient_automation` — the transient detector engaged automation playback
  (`replaying=true` observed) (#200).
- `clock_arbiter` — a clock source was observed in diagnostics.
- `no_broadcast_stall` — the control-state stream never stalled beyond
  `DRY_RUN_STALL_MS` (default 3000 ms).
- `no_movement_stall` — fields never went un-moved beyond
  `DRY_RUN_MOVEMENT_STALL_MS` (default 5000 ms).

The last two are horizon signals: a one-shot window can't catch a freeze at
minute 45, so the sustained gate tracks the longest gap in each liveness signal.

## Environment overrides

| Var | Default | Meaning |
| --- | --- | --- |
| `DRY_RUN_SUSTAINED` | off | `1`/`true` → sustained gate mode (zero-GAP pass condition). |
| `DRY_RUN_DURATION_MS` | 30000 one-shot / 3600000 sustained | Run window. Override for a faster same-logic smoke of the gate. |
| `DRY_RUN_STALL_MS` | 3000 | Max tolerated gap between control-state broadcasts. |
| `DRY_RUN_MOVEMENT_STALL_MS` | 5000 | Max tolerated gap with no field movement. |
| `DRY_RUN_REPORT` | — | Path to write the JSON report to. |
| `DRY_RUN_PORT` etc. | 3900… | Isolated ports so a dry run can sit alongside a dev server. |

The gate verdict logic itself lives in `scripts/dry-run-gate.ts` and is unit
tested in `tests/bridge/dry-run-gate.test.ts`.
