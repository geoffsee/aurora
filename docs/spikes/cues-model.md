# What a Cue is

Design clarification for issue #288. This is the model; it is not a rewrite plan.

**Status:** proposed. Nothing in code changes until this is agreed.

## The problem in one paragraph

"Cue" currently names six unrelated mechanisms that happen to share a UI panel: hardcoded `ControlState` patches, a renderer sync counter (`cueVersion`), a momentary flash counter (`flashVersion`), saved preset slots, transition curves, and beat/bar quantization. Anyone extending the system — pads, VST triggers, audio thresholds (#285), mobile (#282), lighting adapters (#283) — has to guess which of the six they mean, and the answers diverge.

## The five things, named

| Term | What it is | Owns |
| --- | --- | --- |
| **Cue** | A named show moment, fired as a whole, optionally quantized | `web/controls/lib/cues.ts`, `queueCue` |
| **Preset** | A saved, recallable *complete* look with a slot number | `shared/preset-bundle-schema.ts` |
| **Flash** | A momentary, self-reverting hit | `flashVersion` |
| **Look commit** | "The live look changed non-continuously; resync" | `cueVersion` |
| **Safety** | An operator-protective override | Panic Dim, blackout, freeze, strobe lockout |

The proposal is that these five stay five, and that the overloading is resolved by **renaming the mechanism, not merging the concepts**.

### Cue vs Preset

A **Preset** is a *complete* look: recalling slot 3 fully determines what you see. A **Cue** is a *partial patch*: `drop` sets crossfade, intensity, feedback, depth, palette, and both deck modes, and deliberately leaves everything else — brightness, layer weights, figure params — where the operator had it.

That difference is the whole reason both exist. A preset is "go here". A cue is "do this to wherever we are". Merging them would cost the second capability, which is the one that matters mid-set.

**Decision: keep both.** The six named pads stay as *first-class show grammar*, not as shortcuts onto presets.

### Flash is not a cue subtype

`flashVersion` is a separate primitive: momentary, self-reverting, no state to return from. It is currently *coupled* to cues by accident — `applyCue` bumps it for every cue except `panic`:

```ts
next.flashVersion += name === 'panic' ? 0 : 1;
```

That special case is the tell. Flash-on-fire is a property some cues want and one does not, so it should be **a field on the cue definition** (`flash: boolean`), not a name comparison in the apply path. A cue can request a flash; a flash is not a kind of cue.

### `cueVersion` is misnamed

`cueVersion` is not about cues. It is a **look-commit epoch**: a monotonic counter telling the renderer "the live look just changed discontinuously, stop interpolating and stomp". It is bumped by cue fires, by deck mode changes, by deck slug changes, and by MIDI bindings flagged `bumpCue` in `PARAM_META`.

Those are all correct uses of a look-commit signal and none of them are cues.

**Decision: rename to `lookEpoch`** (wire-compatible alias during migration), and keep every current bump site. The renderer contract does not change; only the name stops lying. Half the confusion in this issue is downstream of a field named `cue*` that fires when someone changes a deck.

### Panic Dim is both, and that is fine

`panic` is in `cuePresets` and it is also a safety action: it sets `maxBrightness: 0.35`, `strobe: false`, `strobeLockout: true`, and suppresses the flash.

**Decision: Panic is a cue whose definition includes safety fields, plus a *separate* always-available safety surface.** The mobile `PanicBar` and the console's blackout/freeze/strobe are the safety surface; they must never be behind a tab switch or a beat wait. Panic-as-a-pad is a convenience alias for the same patch.

The rule that follows: **safety actions never quantize.** A photosensitivity response that waits for the next bar is not a safety response.

## Fire semantics

What always happens when a cue fires:

1. Patch its declared `ControlState` fields
2. Mirror the patch into the `cue*` snapshot fields (`cueIntensity`, `cuePalette`, …)
3. Bump `lookEpoch` (today `cueVersion`)
4. Bump `flashVersion` **iff** the cue declares `flash: true`
5. Clear any pending cue
6. Start the transition, if the cue declares one

### Quantization

| Action | Waits for beat/bar? |
| --- | --- |
| Named cue, `beatSync` off | no — immediate |
| Named cue, `beatSync` on | next beat, or next bar when `barSync` |
| Preset recall | **should**, today does not |
| Flash | never — a quantized hit is a late hit |
| Safety (panic bar, blackout, strobe lockout) | never |
| Look commit from a deck change | never — it is a consequence, not an action |

**The one real gap:** preset recall does not queue, so an operator who wants a look on the downbeat can queue a cue but not a preset. Presets and cues should share `queueCue`'s pending slot — one pending action, last write wins, visible in `StatusHeader`.

**Immediate override:** firing anything while something is pending replaces the pending action. Firing the *same* action twice means "stop waiting, do it now". That is the behaviour operators expect from every desk and it costs one comparison.

### Transitions

**Decision: cues snap by default; presets interpolate by default.**

This follows from what they are. A cue is a moment — a `drop` that eases in over 800 ms has missed the drop. A preset is a destination, and getting there smoothly is usually the point. Both should be overridable per definition, but the defaults should match the primitive rather than being a single global `transitionDurationMs` applied to everything under the panel.

## Multi-client

Today the last writer wins, because `ControlState` is a single value on the bridge and every surface publishes into it.

**Decision: keep last-write-wins for cue fires.** Two operators fighting over cues is a human problem, and the frontier voting thread addresses a different scenario (many casual participants, not two operators). What is worth adding is *attribution* — a pending cue should say which surface queued it, so "why did that fire" has an answer. That is a display concern, not a protocol change.

## Authoring

**Decision: the six pads stay hardcoded, for now.**

They are show grammar — `warmup`, `drop`, `tunnel`, `burst`, `wash`, `panic` are a vocabulary, and a vocabulary that varies per install is not a vocabulary. What *should* become possible is **adding** cues, not editing the six:

- "Save current look as a cue" writing a partial patch (only fields the operator marks) into `AURORA_DATA_DIR`
- MIDI/VST binding to cue *names*, so a user cue is reachable from hardware

That ordering matters: user-defined cues need the partial-patch authoring problem solved (which fields does "save as cue" capture?), and that question is worth answering on its own before the storage location matters.

**Mobile vs Console: phone fires, Console authors.** Same model, same names, same quantization. The phone gets no cue *definition* UI, consistent with preset save/rename already staying on Console.

## Naming

**Decision: keep "Cue".** It collides with the lighting world's stored-look sense (#283), but the collision is mild — a lighting cue is also "a named show moment you fire", and the industry meaning is closer to Aurora's than `Moment`, `Look`, or `Hit` would be. Hardware adapters should name their own domain explicitly (`fixture cue`, `DMX cue`) rather than Aurora renaming a concept its operators already have a word for.

**The Console panel should not be called Cues**, though — it currently also hosts preset slots and transition curves. Suggested split:

| Panel | Contents |
| --- | --- |
| **Cues** | the six pads, beat/bar sync, pending state |
| **Looks** | preset slots 1–6, save/rename, transition duration and curve |

## What this implies, in order

Filed as follow-ons only after the model is agreed:

1. Rename `cueVersion` → `lookEpoch` (alias during migration; no behaviour change)
2. Move flash-on-fire from the `name === 'panic'` comparison into a `flash` field on the cue definition
3. Make preset recall use the same pending slot as cues, so it can be quantized
4. Split the Console panel into Cues and Looks
5. Cue defaults: snap; preset defaults: interpolate
6. Pending-action attribution in `StatusHeader`
7. (Later, own design) "Save current look as a cue" and the partial-patch capture question

Items 1–3 are the ones that unblock #285 (audio thresholds need to know what they may fire) and #283 (adapters need to know what a cue event carries).

## References

- `web/controls/lib/cues.ts` — the six pads
- `web/controls/context/ControlsContext.tsx` — `applyCue`, `queueCue`, `flushPendingCue`
- `web/controls/lib/param-meta.ts` — `bumpCue` flags
- `shared/preset-bundle-schema.ts` — the preset side
- `docs/backlog/frontier-threads.md` — multi-client voting (adjacent, not a substitute)
