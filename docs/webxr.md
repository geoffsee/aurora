# Aurora Spatial (`/webxr/`)

Aurora Spatial is a separate immersive renderer. It does not copy, composite, or texture pixels
from the Bevy projector or Three.js deck canvases. The headset receives renderer-neutral show data
and builds a surrounding scene locally.

## Data path

1. The bridge remains the source of truth for `ControlState` and broadcasts
   `/aurora/control/state` to every display.
2. Live Ableton meter, tempo, beat, and transport messages already on the shared WebSocket bus are
   reduced into a spatial frame by `web/webxr/data-bridge.ts`.
3. Browser microphone capture publishes the existing scalar `/aurora/audio/features` message plus
   `/aurora/audio/spectrum`, a versioned 64-bin logarithmic spectrum defined in
   `shared/audio-spectrum.ts`. The Bun bridge validates and fans this message out; static Pages uses
   the same BroadcastChannel transport as the projector.
4. When no spectrum exists, the reducer derives a 64-bin envelope from the scalar bass, mid, high,
   and energy bands. This also keeps Ableton and demo sources useful without inventing pixel data.
5. `?output=<id>` is resolved through the shared output-routing schema before deck weights, palette,
   shader seed, and blackout reach the scene. Access-token query parameters stay on the WebSocket
   URL and on the `/webxr` 308 redirect.

Spectrum payloads use this wire shape:

```json
{
  "address": "/aurora/audio/spectrum",
  "args": [{
    "schemaVersion": 1,
    "source": "browser-mic",
    "bins": ["64 normalized values"],
    "minHz": 20,
    "maxHz": 20000
  }]
}
```

## Rendering

The display reducer commits new values at 45 Hz. The WebXR animation loop remains independent and
runs at the headset cadence, using the latest committed frame for smooth head tracking. Deck A and
Deck B render as independent spatial layers whose opacity and bounded particle budgets follow the
existing crossfader. Weight changes are smoothed at render cadence, so both formations coexist
during a transition instead of collapsing into one blended layout.

The native scene exposes 33 spatial instruments rather than reducing the launchpad to a handful of
generic tunnels. The performance family has dedicated Beams, Tunnel, Burst, Mirror, Atmosphere,
Strobe, Swarm, Orbit, Pulse, Spiral, Ripple, Shards, Flux, Lattice, Rain, Echo, Vortex, Prism,
Scanner, Comet, Bloom, and Sculpture compositions. The extended catalog adds Polytope, Manifold,
Tiling, Fractal, Linked Rings, Graph, Flow Field, Hierarchy, Clock, Point Cloud, and Flora.

All stable control-bus modes 0–48 have an explicit mapping. The first 25 retain nearly one-to-one
spatial identities; the mathematical modes use the composition that expresses their catalog
character (for example, `CalabiYau` uses Manifold, `PenroseTiling` uses Tiling,
`LorenzAttractor` uses Flow Field, and `PAdicNumbers` uses Hierarchy). Package slugs are routed by
specific visual terms before generic ones, so `Prism Tunnel`, `Crystal Bloom Engine`, `Data Rain`,
`Glass Ribbons`, `Point Cloud Quantum Mycelium`, and `Bass Monolith` select intentional native
looks. Unknown package slugs use a stable deterministic fallback.

Each instrument consumes the existing deck palette and intensity/depth/feedback/speed controls plus
the shared audio spectrum. It also has a restrained layer profile rather than drawing every
primitive at once. Atmospheric and point-cloud looks omit rings; rain uses falling streaks; mirror
uses paired wings; ripple occupies a floor plane; scanner is a moving wall; sculpture and manifold
looks use solid forms. Wireframe shells are disabled across the set, and only 11 instruments use
sparse, intentional rings. Particle silhouettes vary among streaks, facets, soft spheres, tiles,
drops, nodes, and shards while sharing one bounded adaptive instance budget.

## Performance controls

WebXR controls are part of the shared show state rather than a headset-local configuration. They
can be driven by the controls page, MIDI assignment, saved presets, automation recording/replay, or
the `aurora VJ Bridge` VST:

| Control | Range | Behavior |
| --- | --- | --- |
| XR Follow Deck Modes | on/off | On maps the selected deck/package identity automatically; off enables the explicit formation indices. |
| XR Formation A/B | 0–32 | Selects the append-only spatial instrument order in `shared/webxr-spatial-contract.ts`. |
| XR Density A/B | 0–1 | Scales each deck's share of the bounded particle budget. |
| XR Structure A/B | 0–1 | Scales structural opacity and instance count for spectrum bars, rings, and solid forms. |
| XR Spatial Extent | 0.65–1.75 | Contracts or expands positions around the fixed comfort boundary. |
| XR Audio Reactivity | 0–1 | Scales spectrum levels, band motion, pulse, flash response, and reactive brightness. |

Continuous XR controls participate in preset transition curves. Formation changes and follow mode
remain discrete. The comfort radius is deliberately not automatable: artists can shape the room,
but cannot move content through the viewer safety boundary.

This shared-state boundary is also the platform seam for artist-built performance surfaces. A web
controller, DAW, MIDI device, recorded set, or future remote collaboration client can express the
same show intent without depending on Three.js or headset implementation details.

All content uses additive instanced geometry on a black background and keeps a comfort radius
around the local eye-level origin; Aurora never animates the XR camera.

`WebGPURenderer` is the default backend. The session requests `immersive-vr` from the Enter VR
button with only the optional `webgpu` feature and uses a `local` reference space. If a headset
accepts WebXR but not the WebGPU XR binding, Three.js replaces the renderer with its WebGL2 backend
without replacing the scene or data bridge. No controller or hand-tracking feature is requested.

## Build and serve

```bash
bun run build:webxr
```

The output is `dist/webxr/`. The Bun visual server serves it at `/webxr/` and redirects `/webxr` to
the directory URL with status 308. The Docker build and GitHub Pages workflow both run the same
target. The CLI prints tokenized LAN headset URLs alongside the projector and controls URLs.
