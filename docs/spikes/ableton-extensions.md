# Spike: Ableton Extensions Integration Surface

**Issue:** #177  
**Tracker:** #178  
**Sprint:** Backfill safety nets and convert the autonomy/morph thread into code  
**Personas:** live-performer (Rezz — stem-level, on-brand reactivity); ecosystem depth  
**Status:** Spike — no implementation commitment

---

## Summary

This spike documents the **Ableton Extensions integration surface** — the
mechanisms by which Ableton Live can push richer data to the bridge than the
current read-only AbletonOSC polling provides — assesses feasibility, and
recommends a Phase 1 scope.

The motivating wildcard (carried forward from the twice-declined #101 / #158
framing) is **stem-level reactivity**: letting visuals react to individual
stems or buses (kick-bus, vocal-bus) rather than only a broadband per-track
level or the master mix. The previous declines rejected only the *spike
framing*; the wildcard itself stays endorsed (Strategic Review #172, item 6),
so this document is the re-filed spike, not an implementation.

**Finding:** stem-level reactivity is tractable, but not through AbletonOSC
alone. AbletonOSC exposes one broadband scalar per track
(`track.output_meter_level`) with no frequency split and no semantic identity.
A **Max for Live (M4L) "sender" device** is the lowest-friction extension that
closes the gap, because it can run per-track band analysis inside Live and emit
OSC straight onto the bridge's existing UDP listener with no bridge protocol
change. The recommended Phase 1 is a thin, additive feature-band channel that
reuses the audio path the renderer already consumes.

---

## What "Ableton Extensions" means here

"Ableton Extensions" is an umbrella for the supported ways third-party code runs
inside or alongside Live. The four that matter for this integration:

| Surface | What it is | Can it send data out? | Per-track audio analysis? |
|---|---|---|---|
| **AbletonOSC** (current) | A Control Surface remote script (Python, `_Framework`) exposing the Live Object Model over OSC | Yes — OSC over UDP (what we poll today) | Only `track.output_meter_level`: one broadband RMS-ish scalar per track |
| **Max for Live (M4L) device** | A Max patch loaded as an audio/MIDI/instrument device on a track or bus | Yes — `udpsend`, or `[live.*]` + OSC objects | **Yes** — `[fft~]` / band-split inside the device, per-track because the device sits *on* the track |
| **Control Surface / MIDI Remote script** | Custom Python remote script (AbletonOSC is one) | Yes — but only Live Object Model data, no DSP | No — no audio-thread access to sample buffers |
| **Live "Extensions" / control-surface bundles** | Packaged remote-script + device bundles distributed as a `.amxd` / script pair | Inherits the above per component | Only via an embedded M4L device |

The decisive distinction: **only a Max for Live device sits on the audio signal
path** and can therefore see per-track sample buffers and run an FFT/band split.
Remote scripts (including AbletonOSC) see the Live Object Model — metadata,
parameters, and the pre-computed `output_meter_level` — but never the audio
samples, so they cannot produce a kick-vs-hat split within a single track.

---

## Current System State

### How audio reaches the renderer today

```
Ableton Live
  │  poll every 50 ms: /live/song/get/track_data
  │    (0, numTracks, "track.output_meter_level")
  ▼
Bridge (index.ts:1418-1428)  ──broadcast()──►  WebSocket
                                                   │  /live/song/get/track_data {meters[]}
                                                   ▼
                                             index.html
                                             oscState.meters[0..15]      (index.html:41)
                                             recomputeEnergy()           (index.html:166)
                                               trackMapping → deckA/deckB/bass/mid/high
                                                   │  window.__bevyoscOsc* getters
                                                   ▼
                                             WASM renderer (src/main.rs)
```

So a *form* of per-track reactivity already exists: `oscState.meters` holds up to
16 per-track output-meter values, and `controlState.trackMapping`
(`index.html:90-95`, `312-320`) lets the operator assign track index ranges to
deckA/deckB and single track indices to bass/mid/high.

### The gap

The existing path is limited in three ways that block true stem-level reactivity:

1. **Broadband only.** `track.output_meter_level` is a single scalar per track.
   The bass/mid/high split in `recomputeEnergy()` is derived by assigning whole
   *tracks* to bands (`bassTrack`, `midTrack`, `highTrack`), not by analysing
   frequency content. A kick and a hi-hat on the same track are indistinguishable.
2. **No semantic identity.** Tracks are addressed by integer index. The operator
   must manually discover that "track 3 is the kick bus" and encode it in
   `trackMapping`. Rename or reorder tracks in Live and the mapping silently
   drifts. There is no name/colour metadata flowing to the bridge.
3. **Bus / return tracks not covered.** The poll requests `track_data` for
   regular tracks `0..numTracks`; group/return ("bus") meters — the natural home
   of a kick-bus or vocal-bus — are not specifically requested.

Items 1 and 3 are exactly what a Max for Live device can supply; item 2 can be
supplied by either an M4L device (it knows the track it sits on) or by an
AbletonOSC metadata poll.

---

## Feasibility by surface

### A. Max for Live "feature sender" device — **recommended**

A small `.amxd` audio-effect device dropped on each stem/bus the performer cares
about. Inside the device: an `[fft~]`-based band split (or three `[onepole~]`
band-pass envelopes) produces bass/mid/high envelopes for *that track's* audio,
plus an onset/transient flag. The device sends them over OSC via `[udpsend
127.0.0.1 12000]` (or a dedicated port) using a stable, named address the
performer types into the device — e.g.:

```
/bevyosc/stem/kick   <bass> <mid> <high> <transient>
/bevyosc/stem/vocal  <bass> <mid> <high> <transient>
```

**Feasibility: high.** M4L is the sanctioned per-track DSP extension; band-split
and `udpsend` are standard objects. The performer places the device only on the
buses they want reactive, so the named-stem set is self-describing and survives
track reordering. No Live Object Model polling and no Python remote script
needed. The artifact is a single distributable `.amxd` file under, say,
`extensions/ableton/`.

**Cost:** ships a Max patch (binary-ish `.amxd`) into the repo and a setup note;
requires the performer to own Max for Live (bundled with Live Suite, otherwise a
paid add-on). The bridge must accept a new OSC address family (small, additive).

### B. AbletonOSC metadata enrichment — complementary, not sufficient

AbletonOSC can already answer `track.name`, `track.color`, and return/group
track queries. A one-time poll of `track.name` for all tracks would let the
controls page *label* the existing `trackMapping` indices instead of showing bare
numbers — solving the semantic-identity gap (#2) for the data we already have.

**Feasibility: high, low value on its own.** It improves the operator UX for the
current broadband meters but delivers no new frequency or transient resolution.
Best treated as a small UX add-on to Phase 1, not the core.

### C. Custom Control Surface / remote script — **not recommended**

We could fork AbletonOSC or write a new remote script. It still cannot read audio
samples (no audio-thread access from the `_Framework` API), so it cannot produce
stem-level band data. It would only duplicate what AbletonOSC already gives us
plus the metadata in (B). High maintenance (tracks Live version changes), no
unique capability for this wildcard.

---

## Recommended Phase 1 Scope

A thin, additive **named-stem feature channel** fed by a Max for Live sender
device, reusing the existing audio-to-renderer path.

1. **M4L sender device** (`extensions/ableton/bevyosc-stem-sender.amxd`): three
   band envelopes + transient flag for the track it sits on; OSC out to a fixed
   UDP port with a performer-typed `/bevyosc/stem/<name>` address.
2. **Bridge ingest**: a new UDP handler (mirroring the existing VST control
   listener pattern, `index.ts` `vstControlUdp`) parses `/bevyosc/stem/*`,
   validates and clamps the four floats, and keeps a small map of named stems.
   These are **audio features**, not control state — they must *not* flow through
   `coerceControlState`. They broadcast on a new `/bevyosc/stem/state` WS address.
3. **Browser mirror**: `index.html` stores the named-stem map in `oscState`
   (e.g. `oscState.stems = { kick: {bass,mid,high,transient}, ... }`) and exposes
   it to the renderer via new `window.__bevyoscOscStem*` getters, alongside the
   existing meter getters. The renderer reads them like any other OSC input.
4. **Controls page**: a small "Stems" readout listing live named stems and their
   levels, so the operator can confirm the device is connected and named
   correctly.

Phase 1 deliberately does **not**:
- replace or alter `trackMapping` / `recomputeEnergy` — the broadband path stays
  as a zero-dependency fallback when no M4L device is present;
- add stem data to `ControlState`, presets, or the VST mirror (stems are live
  audio features, like `oscState.meters`, not persisted control values);
- require any change to the WASM renderer's existing getters.

This keeps the existing live set working untouched when the device is absent
(the named-stem map is simply empty), satisfying the "preserve existing
behaviour" convention used throughout the project.

### Where stem data must NOT go

The bridge is the single source of truth for `ControlState`, and every field is
clamped by `coerceControlState`. Stem feature floats are high-rate live input,
analogous to `oscState.meters`, and belong on the **audio path**, not the control
path. Routing them into `ControlState` would bloat the schema, the VST mirror,
and the renderer's control getters for data that is never persisted. (If a
performer later wants a stem transient to *drive* a control — e.g. kick →
flash — that is the job of the Audio-Control Router from #174, which already owns
audio-feature-to-control mapping. This spike feeds that router; it does not
duplicate it.)

---

## Interaction with Sibling / Recent Work

- **Ableton Link sync (shipped, #157 / `ableton-link.ts`):** Link is a *clock*
  extension (shared tempo/beat phase); this spike is an *audio-feature*
  extension. They share the Ableton-ecosystem theme but touch different data and
  do not interact. Together they move the integration from "read tempo + one
  meter per track" toward "shared clock + per-stem reactivity."
- **#174 Audio-Control Router Phase 1:** the natural consumer of stem features.
  The router maps `AudioFeatures` → `ControlState`; a Phase 2 of this work could
  add named stems as additional router sources. No code dependency in either
  direction for Phase 1.
- **#176 Clock-Source Arbitration:** unrelated data path (tempo, not audio
  features). No interaction.

---

## What Blocks Full Implementation

| Blocker | Severity | Resolution |
|---|---|---|
| Bridge has no `/bevyosc/stem/*` ingest path | **Required** | New UDP/WS handler modelled on the existing VST control listener |
| Renderer has no stem getters | **Required** | Add `window.__bevyoscOscStem*` shims + Rust externs (additive, like existing OSC getters) |
| M4L device must be authored and distributed | **Required** | Ship `.amxd` under `extensions/ableton/` + a setup note; performer needs Max for Live |
| Named-stem set is performer-defined, variable length | Medium | Treat as an open map keyed by name; renderer reads a fixed set of "well-known" stem names with graceful absence |
| Per-track `track.name` not currently polled (option B UX) | Low | Optional one-time AbletonOSC `track.name` poll to label `trackMapping` indices |

---

## Recommendation

File a follow-on **implementation** issue for Phase 1 as scoped above: a Max for
Live stem-sender device plus an additive bridge/browser/renderer feature-band
channel, with the broadband `trackMapping` path retained as the no-dependency
fallback. Defer the AbletonOSC `track.name` labelling (option B) to an optional
acceptance criterion, and leave stem-driven *control* mapping to the #174 router.

---

## Proposed Acceptance Criteria for Follow-On Implementation Issue

- [ ] `extensions/ableton/bevyosc-stem-sender.amxd` — M4L audio-effect device
      emitting `/bevyosc/stem/<name>` with bass/mid/high/transient for its track
- [ ] Bridge UDP handler parses, validates, and clamps `/bevyosc/stem/*`; keeps a
      named-stem map; broadcasts `/bevyosc/stem/state` on the WS bus
- [ ] Stem features do **not** pass through `coerceControlState` and are not added
      to `ControlState`, presets, or the VST mirror
- [ ] `index.html` mirrors the named-stem map in `oscState` and exposes
      `window.__bevyoscOscStem*` getters; renderer reads them like existing OSC inputs
- [ ] All existing behaviour is unchanged when no stem device is connected
      (empty stem map; `trackMapping` / `recomputeEnergy` path untouched)
- [ ] Controls page shows a live readout of connected named stems and their levels
- [ ] Unit tests cover stem-message parsing, float clamping, and empty-map default
- [ ] Setup note documents installing the `.amxd` and the OSC port/address convention

---

## Acceptance Criteria (from Issue #177)

- [x] A written spike documenting the Ableton Extensions integration surface
      (AbletonOSC remote script, Max for Live device, custom Control Surface
      script, packaged Extensions) and which surfaces can supply per-stem audio
- [x] Feasibility assessed per surface (M4L: high & sufficient; AbletonOSC
      metadata: high but complementary; custom remote script: not recommended)
- [x] A recommended Phase 1 scope (additive named-stem feature channel via an
      M4L sender device, with the broadband path retained as fallback)
- [x] No production code produced — output is this spike and the proposed
      follow-on implementation issue above
