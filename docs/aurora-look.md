# `.aurora-look` archive format

Interchange format between **Preset Studio** (export) and **Aurora** (import).  
A look is a fullscreen pack that uses the **pack-v1** uniform bus (same as show `VjPackFullscreen*` materials).

Related: [preset-studio.md](./preset-studio.md) · [mode-protocol.md](./mode-protocol.md)

## File

- **Name:** `<slug>.aurora-look`
- **Container:** ZIP, **store only** (no deflate) in v1 — built by `shared/zip-store.ts` / `buildAuroraLookArchive`

```text
manifest.json     # required
look.wgsl         # required
defaults.json     # optional knob defaults
preview.png       # optional (reserved; ignored by v1 importer if present as non-text)
```

## `manifest.json` (schemaVersion 1)

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | |
| `kind` | `"aurora-look"` | |
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

## Limits

- WGSL ≤ 256 KiB  
- Archive ≤ 1 MiB  

## Install shape (importer)

For each deck `deck-a` / `deck-b`:

```text
$AURORA_DATA_DIR/decks/<deck>/<slug>/preset.json
$AURORA_DATA_DIR/decks/<deck>/<slug>/<slug_with_underscores>.wgsl
```

`preset.json` is produced by `auroraLookToModePreset` (fullscreen layer ref + `dual-fullscreen` capability).

Re-import of the same slug **overwrites**. Never writes into bundled `data/` — only the override root (`AURORA_DATA_DIR`).

## Bridge import API

Requires the bridge process with **`AURORA_DATA_DIR` set** (writable overlay). Without it, import returns **503**.

```http
POST http://127.0.0.1:3000/api/looks/import
```

| Body | Content-Type | Notes |
| --- | --- | --- |
| raw `.aurora-look` bytes | `application/zip`, `application/octet-stream`, or `application/x-aurora-look` | preferred for Studio / `curl --data-binary` |
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
curl -sS -X POST "http://127.0.0.1:3000/api/looks/import" \
  -H "Content-Type: application/zip" \
  --data-binary @glass-drift.aurora-look

# Base64 JSON (agents)
B64=$(base64 < glass-drift.aurora-look | tr -d '\n')
curl -sS -X POST "http://127.0.0.1:3000/api/looks/import" \
  -H "Content-Type: application/json" \
  -d "{\"archiveBase64\":\"$B64\"}"
```

### TypeScript install helper (no HTTP)

```ts
import { installAuroraLookArchive } from '../bridge/look-import.ts';

const result = installAuroraLookArchive(bytes, { dataDir: process.env.AURORA_DATA_DIR! });
// then rescanModeCatalog() in the bridge process
```

## TypeScript API (format)

```ts
import {
  buildManifest,
  buildAuroraLookArchive,
  parseAuroraLookArchive,
  remapAuthoringWgslToShow,
  auroraLookToModePreset,
  PACK_V1_AUTHORING_TEMPLATE,
  PACK_V1_SHOW_TEMPLATE,
} from '../shared/aurora-look.ts';
```

## Agent / human workflow

1. Author in **Preset Studio** (`bun run studio` → http://127.0.0.1:3010) or craft an archive with this format.  
2. **Export** `.aurora-look` (toolbar download) or call `exportSketchToLook` / `buildAuroraLookArchive` / the skill script.  
3. **Import:** Studio “Import to Aurora”, or `POST /api/looks/import` with `AURORA_DATA_DIR` set → catalog rescan → select on launchpad.  

**Agent skill:** `.agents/skills/aurora-create-visualization/` (`/aurora-create-visualization`).

```bash
bun run .agents/skills/aurora-create-visualization/scripts/build-look.ts \
  --slug glass-drift --label "Glass Drift" --wgsl ./look.wgsl \
  --out /tmp/glass-drift.aurora-look --import-http http://127.0.0.1:3000
```

Do **not** hand-edit dual-deck folders for the happy path; prefer archive + import.
