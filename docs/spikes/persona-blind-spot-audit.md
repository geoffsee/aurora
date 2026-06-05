# Ideation: Persona Blind-Spot Audit — Cortini and Eno Lenses

**Issue:** #91  
**Tracker:** #92  
**Sprint:** Live-performance triggers, curve shaping, EMA hot-tuning  
**Personas:** Alessandro Cortini, Brian Eno  
**Status:** Ideation only — no implementation commitment

---

## Summary

Neither the Cortini nor the Eno persona is engaged by the current
parameter-exposure model. Cortini works within imposed constraints until the
constraint itself becomes the composition. Eno needs the system to surprise him
— emergent behavior from simple rules, running unattended. Both lenses surface
gaps the roadmap has not yet named.

The audit uses two lens questions:

- **Cortini:** "Is the limitation interesting?" / "Can I do a whole record on
  just this?"
- **Eno:** "Can the system surprise me?" / "Can it surprise me after an
  afternoon?"

---

## Current System State (Relevant Constraints)

| Capability | What exists today |
|---|---|
| Visual modes | 5 deck modes per deck (Beams, Tunnel, Burst, Mirror, Wash), crossfader |
| Audio reactivity | EMA-smoothed bass/mid/high per deck, hot-tunable decay constants (#89) |
| Automation | In-browser record/replay of ControlState diffs; bridge-side engine designed in spike #57 |
| Presets | 6 snapshot slots saved in browser / disk |
| Shader mapping | Audio-reactive uniform curve mapping (#88); runtime shader swapping (#73) |
| Triggers | MIDI/OSC playback triggers (#87) |
| Autonomous behavior | None — the system only responds to input; no self-evolving state |
| Randomness | None — every output is deterministic given the same inputs |
| Durational tools | No parameter that evolves over minutes without human touch |

---

## Cortini Lens

### Design Question C-1: What is the minimum expressive surface for a 45-minute set?

Cortini's *FORMA* and *Scuro Chiaro* albums both demonstrate that a single
analog voice, constrained to its own feedback loops, is sufficient for a full
work. The question for this system: **which parameters are load-bearing for a
complete live visual performance, and which are noise?**

A "minimum viable set" audit would temporarily hide everything except
crossfader + one decay constant + the automation recorder, and ask whether a
45-minute piece can emerge from that surface alone. The current tool has no
"monochrome mode" — a deliberate reduction of the control surface to a
configured subset. Every parameter is always visible.

**Candidate feature:** A named performance profile that locks all controls
except a user-designated set (e.g., crossfade + EMA decay + one cue). The
controls page renders only those fields. The operator cannot accidentally touch
the hidden parameters. Profiles are saved alongside presets.

**Why it matters for Cortini:** The constraint is the instrument. A performer
who must express everything through timing, crossfader position, and a single
decay knob will develop a fundamentally different vocabulary from one who has
30 controls. The feature forces compositional choices before the set starts
rather than during it.

**Open questions:**
- Should locked controls still react to automation playback, or are they frozen
  at their last value?
- Is the correct granularity "hide" (invisible) or "lock" (visible but
  non-interactive)? Locking keeps the performer aware of state; hiding reduces
  cognitive load.

---

### Design Question C-2: Can a looping automation gesture be time-stretched?

The automation recorder captures a diff sequence at real-wall-clock time. A
gesture that took 4 seconds to perform takes 4 seconds to replay. There is no
way to replay the same gesture over 4 minutes — making it unfold at 1/60th
speed — without re-recording it in slow motion.

This is the core Cortini workflow gap: the machine should be able to take a
human gesture and expand it into geological time. "Can I do a whole record on
just this?" only works if "this" can be stretched to fill the record.

**Candidate feature:** A `timeScale` multiplier on the automation player
(`AutomationPlayer.play({ loop: true, timeScale: 0.1 })`). A 4-second
recording played at `timeScale: 0.1` unfolds over 40 seconds; at `timeScale:
0.01` it unfolds over 400 seconds (~6.5 minutes).

**Implementation surface (bridge-side only):** The `positionMs()` calculation
in `AutomationPlayer` becomes `(Date.now() - startedAt) * timeScale`; also
update `const elapsed = Date.now() - startedAt` in `tick()` to
`const elapsed = (Date.now() - startedAt) * timeScale` — or refactor `tick()`
to call `positionMs()` directly instead of maintaining a separate local
variable. A future implementor who updates only `positionMs()` will have a
broken player: frames drain at real-time speed while `positionMs()` reports
virtual time.

(An alternative formulation compares unscaled `positionMs` against
`frame.tMs / timeScale`, but this also requires adjusting the loop-wrap check
to `positionMs >= durationMs / timeScale`). Both formulations are equivalent —
multiply both sides of the unscaled comparison `positionMs_real >= durationMs / timeScale`
by `timeScale` to obtain `positionMs_virtual >= durationMs`. Under the recommended
formulation `positionMs()` returns virtual time (`real_elapsed * timeScale`), so the
loop-wrap expression stays `positionMs >= durationMs` — unchanged from a non-stretched
player. The comparison holds because `positionMs` (virtual ms,
`real_elapsed * timeScale`) reaches `durationMs` (the recording's real-ms
duration, which is the virtual-time loop boundary) exactly when real elapsed
time equals `durationMs / timeScale` — the intended playback duration.

The reset therefore must replace `startedAt = Date.now()` in the loop-wrap
branch with `startedAt += recording.durationMs / timeScale` (real ms), not a
fresh `Date.now()` snapshot. Using `Date.now()` absorbs tick-jitter overshoot
into the next iteration; the phase-accurate increment keeps loop boundaries
consistent across all iterations. Over a 45-minute Cortini set (~7 iterations
at `timeScale: 0.1`) the drift compounds, so correctness here matters.
`durationMs` itself is left unchanged because `positionMs()` already
incorporates `timeScale`, so `durationMs` serves unmodified as the
virtual-time loop boundary.

No recording format changes required — this is a playback parameter, not a storage parameter.

**Why it matters for Cortini:** Time-stretch + loop produces the hypnotic,
slowly-evolving repetition that defines the aesthetic. A 2-second crossfader
sweep, stretched to 90 seconds and looped, becomes a 3-minute visual arc with
no ongoing human input.

**Open questions:**
- Should `timeScale` be a static value set at playback start, or a live knob
  that changes while the loop is running? A live knob enables real-time tempo
  of the loop, analogous to slowing a tape.
- Frame thinning at high stretch factors: at `timeScale: 0.001` the ~16ms tick
  may apply many near-simultaneous frames before advancing meaningfully. Is
  frame-rate normalization needed, or does the visual simply hold steady between
  frame applies?

---

### Design Question C-3: Is the "barely-reacting" state musically interesting on its own?

With very long EMA decay constants (τ → ∞), visuals stop reacting to audio.
The display becomes a slow, self-contained texture. This "drone visual" mode is
not currently a named state — it emerges only when EMA is set to near-maximum
by hand, and nothing in the UI labels it as an intentional choice.

**Candidate feature:** A dedicated "drone mode" toggle that sets all EMA
constants to a configured near-static value and optionally disables audio-band
routing entirely. The visual runs off a fixed or slowly-evolving internal state
rather than audio energy. A single "reactivity" slider then brings the system
back toward audio responsiveness, functioning like a filter on the connection
between music and image.

**Why it matters for Cortini:** The moments when the visual stops tracking the
audio and becomes its own object — independent, unhurried — are compositionally
distinct from reactive passages. Making "drone mode" a first-class state
acknowledges that disconnecting the visual from the audio is an artistic choice,
not a malfunction.

---

## Eno Lens

### Design Question E-1: Can parameters wander autonomously within user-defined envelopes?

The system has no autonomous behavior. Every visual state requires a live
human input or an explicit automation playback command. If you leave the room,
the visuals freeze at their last value. Eno's generative pieces ("Music for
Airports") were designed to run unattended and produce variety over hours.

**Candidate feature:** A `WanderConfig` per parameter, defined in the bridge,
that specifies a center value, a range (± deviation), and a drift speed
(units/second). A background tick in `index.ts` moves each wandering parameter
by a small random step each tick, clamped to its envelope. The operator sets up
the envelopes before leaving the room; the system evolves within them
indefinitely.

```typescript
type WanderConfig = {
  center: number;
  radius: number;    // max deviation from center
  speed: number;     // max change per second
  enabled: boolean;
};

// per-parameter in a new WanderState alongside ControlState
type WanderState = Partial<Record<keyof ControlState, WanderConfig>>;
```

The wandering produces valid `ControlState` values at all times (the existing
`coerceControlState` clamps everything), so no new validation is required. The
bridge's `mergeControlState` path is unchanged; wander is just another writer.

**Why it matters for Eno:** "Can the system surprise me after an afternoon?" The
answer is currently no. A WanderConfig on crossfade (center: 0.5, radius: 0.3,
speed: 0.01/s) would make the visual slowly drift across the crossfade range
over tens of minutes, never repeating exactly.

**Open questions:**
- Should wander interact with live input? One model: live touch temporarily
  overrides the wander center (the envelope re-anchors around the new value).
  Another model: wander is always active; live input fights against it. The
  first is more controllable; the second is more surprising.
- Should wander state be serializable alongside presets, so a prepared
  installation configuration can be recalled?

---

### Design Question E-2: Can automation replay acquire configurable probability and timing jitter?

The automation recorder produces deterministic output — the same frames, in
the same order, at the same times. Eno's generative systems are characterized
by simple rules that produce unpredictable combinations. A deterministic loop
repeated 100 times produces boredom; a loop that fires each frame with 85%
probability produces variation.

**Candidate feature:** Per-frame metadata in the automation recording format:

```jsonc
{
  "tMs": 1240,
  "diff": { "crossfade": 0.62 },
  "prob": 0.85,          // apply this frame with 85% probability; default 1.0
  "jitterMs": 200        // apply within ±200ms of tMs; default 0
}
```

When the player drains a frame, it rolls against `prob`. If the roll fails, the
frame is skipped. `jitterMs` adds a uniform random offset to `tMs` before
comparison, so frames arrive slightly early or late. Both values default to
deterministic behavior (`prob: 1.0`, `jitterMs: 0`), preserving full backward
compatibility with existing recordings.

**Why it matters for Eno:** With `prob: 0.7` on all frames, each loop iteration
is a unique subset of the recorded gestures. After 10 iterations the operator
has heard (seen) 10 different variations on the same composition without
touching anything.

**Open questions:**
- Should `prob` and `jitterMs` be recorded into the JSON file (persistent
  per-frame intent) or applied as a live playback parameter (e.g.,
  `play({ globalProb: 0.85, globalJitterMs: 100 })`)?  Live parameters are
  simpler to expose via OSC and do not require a recording format bump.
- At very low `prob` values a loop iteration may apply almost no frames, leaving
  the visual in an unexpected stable state for an entire loop duration. Is this
  a feature (emergent stasis) or a bug to guard against?

---

### Design Question E-3: Does adding a second audio band path to a single parameter create interesting lag-and-catch dynamics?

Currently each visual parameter is driven by at most one audio band. The EMA
decay constants (#89) let the operator control how fast each band responds, but
a single parameter cannot simultaneously track both the fast transient of a
snare and the slow build of a bass sustain.

**Design question:** What happens when two audio band paths (e.g., bass at
τ = 50ms and mid at τ = 2000ms) feed into the same visual parameter with
independent weights? The parameter would show fast snare-triggered flashes
layered onto a slow mid-range swell — two rhythmic strata in one visual
dimension.

**Candidate feature:** The curve mapping system (#88) gains an optional
secondary source per parameter. The final value is a weighted sum of the primary
and secondary mapped values. The operator sets the weight balance (0 = only
primary, 1 = only secondary, 0.5 = equal blend).

**Why it matters for Eno:** "Can the system surprise me?" Systems that produce
unexpected behavior from simple inputs meet this bar. A parameter driven by both
a fast and a slow band will occasionally produce coincidences — both sources
peak at the same time — that the operator did not arrange. These coincidences are
surprises.

---

## Prioritization Notes for Future Sprints

| Candidate | Lens | Effort estimate | Dependency |
|---|---|---|---|
| C-2: Automation time-stretch | Cortini | S — bridge-only `timeScale` multiplier | Automation player (#57 / #87) |
| E-1: Parameter wandering | Eno | M — new bridge module, WanderState | None |
| E-2: Probabilistic replay | Eno | S — recording format extension + player change | Automation player (#57 / #87) |
| C-1: Monochrome performance profiles | Cortini | M — controls page + bridge profile storage | None |
| E-3: Dual audio band path per parameter | Eno | M — curve mapping UI (#88) extension | #88 |
| C-3: Drone mode | Cortini | S — EMA shortcut + reactivity slider | #89 |

Time-stretch (C-2) and probabilistic replay (E-2) are the highest-signal, lowest-effort candidates: both build directly on the automation player design already spiked and require no new data models. Wandering (E-1) is the most distinctively Eno-aligned and has no dependency, making it a strong standalone item.

---

## Acceptance Criteria (from Issue #91)

- [x] At least two concrete design questions or candidate features from the Cortini lens
- [x] At least two concrete design questions or candidate features from the Eno lens
- [x] No implementation produced
