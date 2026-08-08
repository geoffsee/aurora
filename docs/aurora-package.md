# `.aurora-package` archive format

Interchange format between **Preset Studio** (export) and **Aurora** (import).  
A package is either a WGSL fullscreen pack (schema v1) or a trusted Three.js module (schema v2).

> [!WARNING]
> Three.js packages execute same-origin JavaScript. Treat them like plugins and import only code you trust.

Related: [preset-studio.md](./preset-studio.md) · [mode-protocol.md](./mode-protocol.md)

## File

- **Name:** `<slug>.aurora-package`
- **Container:** ZIP, **store only** (no deflate) in v1 — built by `shared/zip-store.ts` / `buildAuroraPackageArchive`

```text
manifest.json     # required
package.wgsl       # required
defaults.json     # optional knob defaults
```

Schema v2 uses `visualization.ts` as canonical source, `visualization.js` plus an optional source map as the executable, and optional declared binary files under `assets/`.

## `manifest.json` (schemaVersion 1)

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | |
| `kind` | `"aurora-package"` | |
| `slug` | kebab-case | must match `MODE_PRESET_SLUG_RE` |
| `label` | string | operator-facing name |
| `character` | string? | short brief |
| `target` | `"pack-fullscreen"` | only v1 target |
| `uniformBus` | `"pack-v1"` | |
| `disposition` | `"fullscreen-primary"` | |
| `suppressLegacyField` | `true` | |
| `uiGroup` | string? | default `field-motion` |
| `wgslForm` | `"show"` \| `"authoring"` | see below |
| `createdAt` | ISO-8601? | |
| `studioVersion` | number? | |

## pack-v1 uniform bus

| Binding | Name | Meaning |
| ---: | --- | --- |
| 0 | `params` | x=hue, y=time, z=unused, w=aspect |
| 1 | `palette_extra` | x=sat, y=bright, z=pulse, w=alpha |
| 2 | `audio_uniforms` | x=energy (**−1 idle**), y=bass, z=mid, w=high |
| 3 | `palette_rgb` | xyz duotone base |
| 4 | `pack_drive` | x=intensity, y=depth, z=feedback, w=speed |

### `wgslForm`

| Value | Meaning |
| --- | --- |
| `authoring` | Studio preview: typically `@group(0)`; fragment may take `position` + `uv` |
| `show` | Bevy ready: `#import bevy_sprite::mesh2d_vertex_output::VertexOutput`, `@group(2)`, `fn fragment(frag: VertexOutput)` |

Import with default options **remaps** `authoring` → `show` via `remapAuthoringWgslToShow`.

## `manifest.json` (schemaVersion 2, Three.js)

The v2 target is `threejs`, runtime `three-v1`, input bus `aurora-frame-v1`, and renderer `webgl2` or `webgpu`. `requiresNativeWebGPU` rejects Three's WebGL2 fallback when true. `entry` and `source` are fixed to `visualization.js` and `visualization.ts`. Every asset is declared with a safe `assets/…` path, media type, and exact byte count.

Only pinned `three`, `three/webgpu`, `three/tsl`, and the curated addon registry accepted by `validateThreeImports` may be imported. URL, relative, arbitrary npm, and dynamic imports are rejected. Aurora stages revision 0.180.0 locally; packages never depend on a CDN.

The default export is an async factory. Aurora supplies the renderer, canvas, abort signal, asset resolver/loading manager, resource tracker, and viewport. The result provides either `scene` and `camera`, or `render(frame)`, and may provide synchronous `update`, `resize`, and `dispose` hooks. Packages must not create an animation loop or resize the renderer.

WebGPU packages should use TSL/node materials. WebGL `ShaderMaterial` and `EffectComposer` semantics do not carry over to WebGPU.

## Limits

- WGSL ≤ 256 KiB
- TypeScript and JavaScript ≤ 512 KiB each
- Asset ≤ 32 MiB; at most 64 assets
- Archive ≤ 64 MiB

Archives are store-only ZIPs. Import rejects duplicate entries, unsafe/traversal paths, unsupported compression, invalid CRCs, size mismatches, and undeclared files.

## Install shape (importer)

For each deck `deck-a` / `deck-b`:

```text
$AURORA_DATA_DIR/decks/<deck>/<slug>/preset.json
$AURORA_DATA_DIR/decks/<deck>/<slug>/<slug_with_underscores>.wgsl
```

Three installs use the same transactional dual-deck layout with `visualization.ts`, `visualization.js`, its source map, and `assets/`; the preset requests `threejs-runtime-v1`.

`preset.json` is produced by `auroraPackageToModePreset` (fullscreen layer ref + `dual-fullscreen` capability).

Re-import of the same slug **overwrites**. Never writes into bundled `data/` — only the override root (`AURORA_DATA_DIR`).

## Bridge import API

Requires the bridge process with **`AURORA_DATA_DIR` set** (writable overlay). Without it, import returns **503**.

```http
POST http://127.0.0.1:3000/api/packages/import
```

| Body | Content-Type | Notes |
| --- | --- | --- |
| raw `.aurora-package` bytes | `application/zip`, `application/octet-stream`, or `application/x-aurora-package` | preferred for Studio / `curl --data-binary` |
| `{ "archiveBase64": "…" }` | `application/json` | agent-friendly; alias field `archive` |

Query / JSON field `remapAuthoring` (default **true**): set `false` / `0` to skip authoring→show remap.

**Success (200):**

```json
{
  "ok": true,
  "slug": "glass-drift",
  "label": "Glass Drift",
  "overwritten": false,
  "wgslFile": "glass_drift.wgsl",
  "wgslForm": "show",
  "decks": ["deck-a", "deck-b"],
  "catalog": { "epoch": 2, "contentHash": "…", "scannedAt": "…" }
}
```

After a successful install the bridge **rescans** the mode catalog and WS-broadcasts the public catalog when the epoch advances. Select the new slug on the launchpad like any other pack.

**Errors:** `400` validation / bad archive · `413` archive too large · `503` no `AURORA_DATA_DIR`.

### curl examples

```bash
# Raw zip
curl -sS -X POST "http://127.0.0.1:3000/api/packages/import" \
  -H "Content-Type: application/zip" \
  --data-binary @glass-drift.aurora-package

# Base64 JSON (agents)
B64=$(base64 < glass-drift.aurora-package | tr -d '\n')
curl -sS -X POST "http://127.0.0.1:3000/api/packages/import" \
  -H "Content-Type: application/json" \
  -d "{\"archiveBase64\":\"$B64\"}"
```

### TypeScript install helper (no HTTP)

```ts
import { installAuroraPackageArchive } from '../bridge/package-import.ts';

const result = installAuroraPackageArchive(bytes, { dataDir: process.env.AURORA_DATA_DIR! });
// then rescanModeCatalog() in the bridge process
```

## TypeScript API (format)

```ts
import {
  buildManifest,
  buildAuroraPackageArchive,
  parseAuroraPackageArchive,
  remapAuthoringWgslToShow,
  auroraPackageToModePreset,
  PACK_V1_AUTHORING_TEMPLATE,
  PACK_V1_SHOW_TEMPLATE,
} from '../shared/aurora-package.ts';
```

## Agent / human workflow

1. Author in **Preset Studio** (`bun run studio` → http://127.0.0.1:3010) or craft an archive with this format.  
2. **Export** `.aurora-package` (toolbar download) or call `exportSketchToPackage` / `buildAuroraPackageArchive` / the skill script.  
3. **Import:** Studio “Import to Aurora”, or `POST /api/packages/import` with `AURORA_DATA_DIR` set → catalog rescan → select on launchpad.  

**Agent skill:** `.agents/skills/aurora-create-visualization/` (`/aurora-create-visualization`).

```bash
bun run .agents/skills/aurora-create-visualization/scripts/build-package.ts \
  --slug glass-drift --label "Glass Drift" --wgsl ./package.wgsl \
  --out /tmp/glass-drift.aurora-package --import-http http://127.0.0.1:3000
```

Do **not** hand-edit dual-deck folders for the happy path; prefer archive + import.
