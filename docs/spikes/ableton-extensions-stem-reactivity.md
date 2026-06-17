# Design Spike: Stem-Level Reactivity via Ableton Extensions

**Issue:** #158
**Tracker:** #160
**Source:** Strategic Review #152 — Recommended Path Forward, item 9
**Sprint:** Break the convert-to-work stall; land the audio/composability/ecosystem frontier
**Persona:** Rezz (Isabelle Rezazadeh)
**Sizing:** S
**Time box:** 1 working day — desk/architecture feasibility only. No code.
**Status:** Spike concluded — see [Conclusion](#conclusion). No implementation commitment.

---

## Why this spike exists (and why it is *re*-filed)

Strategic Review #152 endorsed the **stem-level reactivity wildcard** — visuals that
react to individual instrument buses (kick bus, vocal bus) rather than to an aggregate
master meter. The earlier issue #101 was declined, but the simplest reading is that only
the *spike framing* was declined, not the wildcard itself. This document re-files the
spike under a strict time box so the wildcard stays alive without re-committing to the
framing that stalled.

The brand rationale is concrete and persona-anchored. From `persona-rezz.json`, the
project is "mid-tempo bass, hypnosis-themed dark electronic music" where the kick and
the low end *are* the identity ("Is it heavy enough?", "Will this hit on a festival
rig?", "Show me what it sounds like in the drop, not in the demo."). Aggregate-meter
reactivity smears the kick into everything else. Stem-level reactivity lets the spiral
pulse *on the kick bus* and a separate visual element breathe *on the vocal bus* — which
is exactly the "on-brand, stem-level reactivity" wildcard the review flagged.

**This spike answers one question:** is stem-level reactivity feasible via Ableton
Extensions on top of the bridge architecture we already have, and if so, what is the
thinnest viable path? It does **not** build anything.

---

## What the system does today

Audio reactivity is already wired end-to-end, but only at **track granularity averaged
into three bands**. The relevant path:

```
Ableton Live
  │  UDP OSC  /live/song/get/track_data  → "track.output_meter_level" floats
  ▼
Bridge (index.ts)  processLiveTrackData(args)        ← index.ts:536
  meters[] = per-track output_meter_level (0..1)
  mapping  = ControlState.trackMapping               ← index.ts:90
  bass = meters[mapping.bassTrack]
  mid  = meters[mapping.midTrack]
  high = meters[mapping.highTrack]
  energy = peak*0.72 + avg*0.28
  ── stepAudioEma ──► automationBridge.onAudioFeatures(smoothed)
  ── /bevyosc/demo/audio + downstream control path ──► oscState → WASM renderer
```

The key existing primitive is `TrackMapping` (`index.ts:42`):

```ts
type TrackMapping = {
  deckAStart; deckACount; deckBStart; deckBCount;
  bassTrack;  midTrack;   highTrack;   // ← one Live track index per band
};
```

So the operator can already say "track 3 is my bass, track 5 is my highs." Each of
`bassTrack`/`midTrack`/`highTrack` is a **single AbletonOSC track index** whose
`output_meter_level` becomes a band value.

### The gap, precisely

Three things stand between today's behaviour and the wildcard:

1. **Band ≠ stem.** Today there are exactly three reactive lanes (bass/mid/high), each
   fed by *one* track meter. A "kick bus" and a "vocal bus" are two arbitrary stems that
   do not map onto the bass/mid/high frequency-band metaphor. There is no first-class
   notion of "an arbitrary named stem drives an arbitrary visual target."
2. **Meter granularity.** `track.output_meter_level` is a single post-fader RMS-ish
   level per track. It is enough to know "the kick track is loud right now," which is the
   80% case for stem reactivity. It is **not** enough for sub-band analysis *within* a
   stem (e.g. transient vs. body of the kick) — that needs either per-stem FFT or a
   dedicated analysis device.
3. **Routing discipline.** Stem reactivity only works if each stem is on its own
   metered Live track or return. That is a *project-setup* requirement on the artist
   side, not something the app can synthesize.

None of these three is a blocker; they scope the work. See the feasibility tiers below.

---

## What "Ableton Extensions" can actually provide

"Ableton Extensions" is an umbrella. For this spike the candidates are, from least to
most invasive:

| Mechanism | What it exposes | Lives where | New dependency? |
|---|---|---|---|
| **AbletonOSC (current)** | Per-track `output_meter_level`, tempo, beat, transport, clip/device params via the Live Object Model (LOM) | Remote Script already assumed by the bridge | No — already in use |
| **Per-track / per-return meter polling (LOM)** | Same `output_meter_level` getter, but subscribed/polled for *N* named stem tracks instead of just 3 band indices | AbletonOSC config + bridge | No — same OSC surface, more addresses |
| **Max for Live (M4L) analysis device** | True per-stem spectral/transient features (`zerox~`, `peakamp~`, FFT bands) emitted as OSC | A `.amxd` device dropped on each stem track | Yes — M4L (paid Ableton Suite / add-on) + a custom device |
| **Live Control Surface / Remote Script (Python)** | Programmatic access to mixer routing, track names, device chains; can auto-discover which track is the "kick bus" by name | Custom Remote Script | Yes — Python remote script alongside AbletonOSC |

**Critical finding:** the 80% wildcard — "the spiral pulses on the kick bus, a second
element on the vocal bus" — needs **only the second row**. AbletonOSC already exposes
`output_meter_level` *per track*. The bridge currently throws away all but three of
those meters because `TrackMapping` only has `bassTrack`/`midTrack`/`highTrack` slots.
Widening the mapping from "3 fixed bands" to "N named stems" is a bridge + ControlState
change against an OSC surface we already speak. **No new Ableton dependency is required
for tier 1.**

M4L (third row) is only needed if a stem needs *intra-stem* analysis (kick transient
isolation, vocal sibilance gating). That is the "wildcard within the wildcard" and
should stay out of any first implementation.

---

## Feasibility tiers

### Tier 1 — Named stem meters (feasible now, no new Ableton dependency)

Generalise `TrackMapping` from three fixed band slots to an array of named stems:

```ts
type StemMapping = {
  name: string;        // "kick", "vocal", "bass", …  (operator-facing label)
  track: number;       // AbletonOSC track index
};
// ControlState gains:  stems: StemMapping[]   (replaces or augments trackMapping)
```

The bridge subscribes to / polls `output_meter_level` for each `stems[].track`,
producing a `Record<stemName, level>` alongside the existing `AudioFeatures`. The
existing band path (bass/mid/high) is preserved by defaulting three stems named
`bass`/`mid`/`high` mapped to the old indices — so this is a superset, migratable, with
no behavioural change at the default.

Downstream, stem levels become routing *sources*. This composes directly with the
**Audio-Control Router (#155)** sibling: that issue's `AudioMapping.source` is currently
`keyof AudioFeatures`; widening it to also accept a stem name lets `kick → flashVersion`
or `vocal → intensity` mappings fall out of the same router with no new mechanism. **The
stem wildcard is, at tier 1, mostly a data-source widening on top of #155.**

Touch points (for the *follow-on* issue, not this spike):
`index.ts` (`processLiveTrackData`, polling/subscription setup), `ControlState` schema +
`coerceControlState` clamp, `controls.html` stem-mapping editor, and the #155 router's
`source` union. `src/main.rs` needs **no** change — it still reads getter values.

### Tier 2 — M4L per-stem spectral device (feasible, new paid dependency)

A custom `.amxd` analysis device on each stem track emits richer features (transient
flag, sub-band energy) over OSC into the bridge's existing UDP ingest. This unlocks
"pulse on the *attack* of the kick, not its tail" — the most on-brand Rezz behaviour —
but requires Ableton Suite / the M4L add-on and a device the team must build and ship.
**Out of scope for a first implementation; revisit only if tier 1 reactivity reads as
too smeared on a real Rezz reference track.**

### Tier 3 — Auto-discovery via Remote Script (feasible, highest cost)

A Python Remote Script reads track names from the LOM and auto-binds stems by
convention ("any track named `KICK*` is the kick bus"). Pure quality-of-life; removes
manual index mapping. Lowest priority — `controls.html` manual mapping is acceptable for
a touring operator who sets up once per show file.

---

## Risks and constraints

| Risk | Tier | Severity | Note |
|---|---|---|---|
| Stem reactivity requires artist-side routing (each stem on its own metered track) | all | Required setup | Documentation/UX, not an app blocker. The Rezz workflow already groups kick/bass/vocal buses. |
| `output_meter_level` is coarse (post-fader RMS, no intra-stem detail) | 1 | Medium | Adequate for "is the kick hitting"; insufficient for transient isolation → that is tier 2. |
| OSC meter poll rate vs. festival-rig latency budget | 1 | Medium | Reuses the existing meter path; must respect the **20 ms median E2E latency budget** the CI Projector Performance Gate (manual control-plane follow-up) enforces. Stem count multiplies meter traffic — bound it. |
| M4L is a paid add-on + a device to build/maintain | 2 | High (cost) | Keep tier 2 out of first implementation. |
| ControlState schema growth (`stems[]`) needs migration + clamping | 1 | Low | Standard schema-bump pattern, same as `trackMapping`. |
| Cannot hands-on-validate here | — | — | This CI environment has no Ableton Live. Feasibility below is from the LOM/AbletonOSC surface already in the codebase + documented APIs; a hands-on confirmation against a live set is a follow-on precondition, **not** part of this time-boxed spike. |

---

## Interaction with sibling issues

- **#155 Audio-Control Router Phase 1** — the natural home for stem sources. Tier 1's
  stem levels plug into the router as additional `source` values. Stem reactivity should
  be *implemented as an extension of #155*, not as a parallel routing system. If #155
  lands first, the stem wildcard is a small data-source PR; if it does not, the stem
  work would have to re-derive routing primitives. **Sequence the stem follow-on after
  #155.**
- **#156 OSC-Controlled Preset Morphing** — orthogonal; morph targets are ControlState
  values regardless of whether a stem or a slider drove them.
- **#157 Ableton Link Sync** — orthogonal transport-clock concern; shares the Ableton
  ecosystem surface but not the meter path.
- **CI Projector Performance Gate (manual control-plane follow-up)** — any stem
  implementation must stay inside the 20 ms median E2E budget; more stems = more meter
  traffic. The gate is the guardrail.

---

## Conclusion

**Stem-level reactivity via Ableton Extensions is feasible, and the on-brand 80% case
needs no new Ableton dependency.**

- The "kick bus / vocal bus drives a visual" wildcard is achievable at **tier 1** by
  generalising `TrackMapping` (three fixed bands) into a list of named stems mapped to
  per-track `output_meter_level` meters that **AbletonOSC already exposes**. The bridge
  currently discards these meters; nothing new must be spoken to Live.
- True intra-stem analysis (kick *attack* isolation) is **tier 2** and requires Max for
  Live — a paid add-on plus a device to build. Defer it until tier 1 is validated
  against a real Rezz reference and judged too smeared.
- The cleanest path is to implement the stem source **as an extension of the
  Audio-Control Router (#155)**, sequenced after it, rather than as a separate system.

**Recommendation:** keep the wildcard endorsed and parked. File a follow-on
implementation issue for **tier 1 only**, dependent on #155, with the proposed
acceptance criteria below. Do **not** start any wildcard implementation under this
spike — per the issue's acceptance criteria, the spike concludes here and hands off.

---

## Proposed acceptance criteria for a (future) tier-1 follow-on issue

- [ ] `ControlState` gains a named-stem mapping (`stems: { name, track }[]`) that is a
      superset of today's `trackMapping`; default config reproduces current bass/mid/high
      behaviour exactly (schema bump + migration + `coerceControlState` clamps).
- [ ] Bridge subscribes/polls `output_meter_level` for each mapped stem and exposes a
      `Record<stemName, level>` alongside `AudioFeatures`, bounded so stem count cannot
      blow the 20 ms E2E latency budget.
- [ ] The #155 Audio-Control Router accepts a stem name as a mapping `source`, so
      `kick → flashVersion` / `vocal → intensity` work through the existing router.
- [ ] `controls.html` gains a stem-mapping editor (add/remove named stems, pick track
      index, live per-stem meter readout).
- [ ] `src/main.rs` unchanged; all existing behaviour identical when no extra stems are
      configured.
- [ ] Unit tests: stem-level extraction from `track_data`, default-mapping parity with
      the legacy band path, router firing from a stem source.
- [ ] A hands-on validation note: stem reactivity checked against a real Rezz-style
      multitrack set (kick bus + vocal bus on separate metered tracks), confirming the
      kick pulse reads as on-brand and not smeared.

---

## Acceptance Criteria (from Issue #158)

- [x] A fresh time-boxed spike document filed under `docs/spikes/` (this file; 1-day
      desk-feasibility time box).
- [x] The spike outcome documents the feasibility of stem-level reactivity via Ableton
      Extensions (feasible; tier 1 needs no new Ableton dependency — see Conclusion).
- [x] No wildcard implementation is started until the spike concludes (no code produced;
      output is the proposed tier-1 follow-on issue above).
