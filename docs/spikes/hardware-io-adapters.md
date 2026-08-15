# Hardware I/O adapter layer

Spike for issue #283 — architecture and recommendations, not an integration.

**Deliverable:** an adapter API sketch, a landscape→adapter matrix, a prior-art brief, a possibility ranking, and a recommended first vertical slice.

## The shape of the problem

Aurora has no lighting, laser, DMX, Art-Net, or ILDA surface today. Its nearest I/O neighbour is OSC (AbletonOSC in, VST UDP in), and both of those live directly in `bridge/index.ts`.

That placement is the thing to avoid repeating. Show hardware is a long tail of vendor protocols with wildly different shapes — some are 512 bytes of channel data at 44 Hz, some are 30 kpps of XY/RGB scanner points, some are analog voltages on a DB-25. Putting any of them in the bridge means the bridge grows a dependency on a device that most operators do not own, and a crash in a vendor SDK takes the show's control bus with it.

So: **a sidecar hosting adapters, not plugins inside the bridge.**

## Process boundary

**Recommendation: one sidecar process, many adapters, speaking to the bridge over the existing WebSocket bus.**

| Option | Verdict |
| --- | --- |
| In-bridge plugins | ✗ A native DMX/DAC library that segfaults kills `ControlState` fan-out |
| One sidecar per adapter | ✗ N processes to supervise for a rig that is one physical universe |
| **One sidecar, many adapters** | ✓ One thing to start, per-adapter failure isolation inside it, one place to put timing |
| Wrap an external daemon (OLA) | ✓ *as an adapter*, not as the architecture |

The sidecar is a WS client of the bridge, subscribing to `/aurora/control/state` and the OSC frames it already broadcasts. It needs no new bridge protocol — the bus is already a fan-out of exactly the show intent adapters want. `muxox` already supervises Caddy + bridge (`deploy/muxox.toml`); a third entry is free.

**Language: Rust.** Scanner output and DMX both want predictable timing and the mature crates are Rust or C. Bun is the wrong tool for a 30 kpps sample clock. This also keeps the sidecar out of the wasm build graph — a fourth `CARGO_TARGET_DIR`, per the existing split.

## The contract

Adapters consume **show intent**, never raw show state. The stable Aurora-facing surface:

```rust
/// What an adapter can do. The host never sends a frame stream to a
/// cue-only device, and never asks a frame device to hold a parameter.
pub struct Capabilities {
    pub params: bool,        // named scalar sinks (dimmer, size, position)
    pub cues: bool,          // discrete named events
    pub frame_stream: bool,  // continuous point/pixel frames
    pub bidirectional: bool, // device → Aurora (RDM, desk, timecode)
    pub max_frame_rate_hz: Option<u32>,
}

pub trait Adapter: Send {
    fn describe(&self) -> AdapterInfo;
    fn capabilities(&self) -> Capabilities;

    /// discover → configure → start → (patch|frame)* → stop
    fn discover(&mut self) -> Result<Vec<DeviceRef>>;
    fn configure(&mut self, patch: &PatchConfig) -> Result<()>;
    fn start(&mut self) -> Result<()>;

    /// Coalesced show state. Called at the bus rate, not the wire rate —
    /// the adapter owns its own output clock.
    fn on_intent(&mut self, intent: &ShowIntent) -> Result<()>;

    /// Called when the host needs output to stop *now*. Must be
    /// synchronous, must not allocate, must not fail silently.
    fn blank(&mut self) -> Result<()>;
    fn stop(&mut self) -> Result<()>;
}
```

`ShowIntent` is the projection of `ControlState` plus events that hardware can act on: energy/bass/mid/high/pulse, intensity/depth/speed, palette RGB, per-deck values, blackout, cue fires with names, beat and bar phase. It is deliberately *smaller* than `ControlState` — deck slugs and GPU shader indices mean nothing to a lighting rig, and exporting them would invite adapters to depend on the show's internals.

### Four things the trait encodes on purpose

**Capability negotiation before configuration.** DMX generally *selects stored cues* on a laser and controls size/position/colour/rotation/intensity; it does not stream graphics. Modelling that as "this adapter has `params` and `cues` but not `frame_stream`" stops the host from ever trying to push a point cloud down 512 channels.

**The adapter owns its output clock.** The bus ticks when state changes; DMX wants a steady ~40 Hz refresh whether or not anything changed, and a scanner wants a fixed sample rate. `on_intent` updates a target; a per-adapter thread drives the wire.

**`blank()` is separate from `stop()` and cannot be async.** This is the safety hook. Scanner output that fails to blank is an eye hazard, not a rendering artefact. It must be reachable from the panic path with no await, no allocation, and no chance of being queued behind a slow `on_intent`.

**Failure is per-adapter.** An adapter that panics is caught, marked failed, blanked, and reported; the sidecar and every other adapter keep running.

## Landscape → adapter matrix

The point of the matrix is that **transports are shared and personalities are layered**, so the count of adapters is much smaller than the count of supported devices.

| Adapter class | Covers | Capabilities |
| --- | --- | --- |
| **Art-Net transport** | Art-Net universes; laser personalities (e.g. Pangolin FB4's 16- and 39-channel profiles) and conventional fixtures both ride it | params, cues |
| **sACN / E1.31 transport** | The other networked-DMX standard; less universal in laser gear, first-class for lighting-heavy rigs | params, cues |
| **DMX serial** | USB-DMX interfaces (Enttec-class) for rigs with no network | params, cues |
| **Laser frame — Ether Dream / Helios** | Open, documented Ethernet/USB DACs; real point streams | frame_stream |
| **Laser frame — vendor Ethernet** | Pangolin FB4 via QuickShow/BEYOND, ShowNET, Lasergraph DSP. Proprietary framing; wrap vendor SDKs | frame_stream |
| **ILDA analog (DB-25)** | Electrical, not a protocol: analog X/Y, RGB, blanking. The adapter owns DAC, timing, scan-rate limits, blanking safety | frame_stream |
| **IDN (ILDA Digital Network)** | Open digital streaming standard; the network-era successor to analog ILDA. Standardised but not the dominant installed interface | frame_stream |
| **Show control in** | MSC, SMPTE/LTC/MTC, desk-driven Art-Net/sACN → `ControlState` | bidirectional |

**Personality packs** are data, not adapters: a fixture profile names channels and maps them to `ShowIntent` fields. One Art-Net adapter plus a profile directory covers generic dimmers, moving heads, and FB4's laser personalities without new code.

## Prior art worth wrapping

| Project | License | Runtime fit | Note |
| --- | --- | --- | --- |
| Open Lighting Architecture (`ola`) | LGPL-2.1 / GPL-2.0 | external daemon | Enormous device coverage. Wrap as *one adapter*, do not adopt as the architecture — it is a C++ daemon with its own lifecycle |
| `artnet` / `sacn` Rust crates | MIT/Apache | in-process | Small, direct; the likely basis for the transport adapters |
| Ether Dream | documented protocol | in-process | Open protocol, well-specified, hardware is obtainable |
| Helios DAC SDK | open SDK | FFI | Cheap hardware, good for a test rig |
| Pangolin FB4 | proprietary SDK / Art-Net profiles | FFI or Art-Net | Most prevalent in the field. **The Art-Net path needs no SDK at all** — that is the leverage |
| QLC+, xLights/FPP, WLED | GPL / various | reference only | Read for patch/profile modelling, not to link |
| GDTF / MVR | open spec | data | Fixture definition interchange; worth reading before inventing a profile format |
| Resolume / TouchDesigner / MadMapper | closed | pattern source | Their device-plugin shapes are the ones to steal: capability declaration + patch + per-device thread |

## Possibility ranking

Impact × effort × risk, laser and lighting both.

| Track | Impact | Effort | Risk | Notes |
| --- | --- | --- | --- | --- |
| **Art-Net params + FB4 personality** | high | low | low | Reaches both conventional fixtures *and* the most common laser controller with one adapter and no vendor SDK. Testable with a software node |
| sACN transport | med | low | low | Nearly the same code path once Art-Net exists |
| Ether Dream / Helios frames | high | med | **med-high** | Real laser output; needs the safety model to be right before it runs at a venue |
| Show control in (MSC/timecode) | med | med | low | Makes Aurora a follower in a bigger show |
| ILDA analog DAC | med | high | **high** | Electrical interface, custom timing, worst safety exposure. Last |
| IDN | med | high | med | Standardised and the right long-term bet, but the installed base does not justify going first |
| Wrapping OLA | med | med | med | Buys breadth quickly; costs an external daemon dependency |

## Recommended first vertical slice

**An Art-Net parameter adapter, plus a no-op adapter, plus the registry.**

Concretely:

1. `sidecar/` Rust binary: WS client of the bridge, adapter registry, per-adapter thread, blank-on-blackout wired to the existing panic path.
2. **`null` adapter** — declares every capability, writes to a log. Proves the registry, the lifecycle, and the intent projection with no hardware in the room.
3. **`artnet` adapter** — one universe, a small profile (dimmer, RGB, strobe), driven by `intensity`, palette RGB, and blackout. Verified against a software Art-Net node so CI and a laptop are enough.
4. Patch/profile config under `AURORA_DATA_DIR/hardware/`, matching where package installs already live.
5. A fake-adapter test double plus a recorded universe fixture, so adapter tests need no hardware.

That slice answers every open architectural question — registry, lifecycle, capability split, intent projection, safety path, config location — while producing something an operator can actually use on a rig. A frame adapter answers fewer of them and carries the safety burden.

## Decisions on the issue's open questions

| Question | Answer |
| --- | --- |
| Interface shape | Coalesced intent push (`on_intent`), adapter-owned output clock. Not sync-per-field, not duplex-by-default |
| Process boundary | One sidecar, many adapters. Never in-bridge |
| Contract with Aurora | `ShowIntent`, a deliberately narrower projection of `ControlState`, over the existing WS bus. No new bridge protocol |
| Config persistence | `AURORA_DATA_DIR/hardware/`, alongside deck installs |
| LAN-only? | **Yes, and documented as a non-goal for Pages/relay.** Scanner and DMX output over a public relay is not something to make possible by accident |
| Test strategy | Null adapter + fake device doubles + recorded universes. No hardware in CI |

## Non-goals, chosen after the survey

- No universal driver: adding hardware means shipping an adapter, and that is the design working
- No frame streaming over the relay — LAN only
- No RDM discovery in the first slice (it is a bidirectional feature; land the one-way path first)
- No attempt to make DMX carry laser graphics

## Follow-on issues

1. Sidecar skeleton: registry, lifecycle, `ShowIntent` projection, null adapter, blank-on-panic
2. Art-Net transport adapter + profile format (read GDTF first)
3. Fixture personality packs incl. FB4 16/39-channel
4. sACN transport adapter
5. Ether Dream / Helios frame adapter — **gated on a written laser safety policy**, not just code
6. Show-control input (MSC / timecode → `ControlState`)

## References

- Bridge I/O today: `bridge/index.ts`, `plugins/aurora-vst/`
- Control bus: `ControlState`, `coerceControlState`, WS fan-out
- Related: #288 (the word "cue" collides with the lighting sense — Aurora keeps its meaning, adapters name theirs explicitly)
- Specs to read before implementing: ILDA (analog DB-25 and IDN), Artistic Licence Art-Net, ESTA/TSP E1.11 / E1.20 / E1.31, GDTF/MVR
