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
runs at the headset cadence, using the latest committed frame for smooth head tracking. A black
scene contains additive instanced particle, spectrum, ring, and wireframe-shell fields. All content
keeps a comfort radius around the local eye-level origin; Aurora never animates the XR camera.

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
