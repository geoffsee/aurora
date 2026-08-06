---
name: aurora-create-visualization
description: >
  Create Aurora fullscreen packages (new deck visualizations) via pack-v1 WGSL,
  `.aurora-package` archives, Preset Studio, and bridge import — never by hand-editing
  dual-deck folders. Use when the user asks to add/create a visualization, package,
  pack, mode, deck shader, VJ visual, water/starfield/plasma-style fullscreen effect,
  export/import an `.aurora-package`, or runs /aurora-create-visualization.
---

# Create an Aurora visualization (package)

A **package** is a fullscreen GPU pack that rides the **pack-v1** uniform bus (same bus as show `VjPackFullscreen*` materials). The happy path is:

**author WGSL → build `.aurora-package` → import → catalog → launchpad**

Do **not** manually create both `data/decks/deck-a/<slug>/` and `data/decks/deck-b/<slug>/` for new packages. Prefer archive + import.

Canonical docs (read when details are missing):

- `docs/aurora-package.md` — archive format + import API  
- `docs/preset-studio.md` — React Studio + Bevy parity host  
- `shared/aurora-package.ts` — build/parse/validate/remap  
- `bridge/package-import.ts` — dual-deck install  

Pack-v1 bus + WGSL templates: `references/pack-v1-wgsl.md` (this skill).

---

## Decide the delivery target

| Goal | Path |
| --- | --- |
| **New selectable deck pack** (default) | Author package → import under `AURORA_DATA_DIR` → select on launchpad |
| **Ship with the repo (bundled)** | Same archive, then install into **both** `data/decks/deck-a/<slug>/` and `data/decks/deck-b/<slug>/` via import to a data dir, **or** write the same files with `installAuroraPackageArchive` / script, then commit. Never only one deck. |
| **Interactive tweak only** | `bun run studio` (WebGPU preview); export when ready |
| **Pixel-parity with Bevy** | `bun run preset-studio:bevy` (optional; not required for archive/import) |

Out of scope for this skill: TypeGPU palette variants under `shaders/variants/`, field-primitive CPU modes, mesh-primary glTF modes, Shadertoy GLSL import (`/api/shadertoy/import` is a different pipeline).

---

## Prerequisites

1. Repo root is the workspace (Aurora monorepo).  
2. For **import into a running show**:
   - Bridge up (`aurora` / `bun run aurora` / whatever the user uses).  
   - **`AURORA_DATA_DIR`** set to a writable overlay (never write into bundled `data/` via the import API).  
   - Import URL: `http://127.0.0.1:3000/api/packages/import` (projector/visual server).  
3. For **agent-only** (no UI): Bun + `shared/aurora-package.ts` is enough to build an archive file.

---

## Workflow A — Agent builds archive + imports (preferred for coding agents)

### 1. Choose identity

- `label`: operator-facing name (e.g. `Glass Drift`)  
- `slug`: kebab-case `[a-z0-9]+(?:-[a-z0-9]+)*` (e.g. `glass-drift`)  
- `character`: one-line brief (optional)  
- `uiGroup`: default `field-motion`

### 2. Write authoring WGSL

Start from `PACK_V1_AUTHORING_TEMPLATE` in `shared/aurora-package.ts` (or `references/pack-v1-wgsl.md`).

**Must:**

- Define `@fragment fn fragment(...)`  
- Name all five uniforms: `params`, `palette_extra`, `audio_uniforms`, `palette_rgb`, `pack_drive`  
- Use **authoring** form for Studio/agent authoring:
  - `@group(0) @binding(0..4)`  
  - `fn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32>`  
- React to **`pack_drive`** (intensity/depth/feedback/speed) and **audio** (`energy` with **−1 = idle**) so launchpad knobs and meters matter  
- Clamp knobs; keep alpha sensible for crossfade  

**Must not:**

- Use Bevy `#import` in authoring form (import remaps authoring → show)  
- Assume textures/samplers (v1 pack bus is uniforms only)  
- Exceed 256 KiB WGSL / 1 MiB archive  

### 3. Build the archive (TypeScript one-shot)

Prefer the helper script:

```bash
bun run .agents/skills/aurora-create-visualization/scripts/build-package.ts \
  --slug glass-drift \
  --label "Glass Drift" \
  --character "soft refractive glass" \
  --wgsl path/to/package.wgsl \
  --out /tmp/glass-drift.aurora-package
```

Or inline with Bun:

```ts
import {
  buildAuroraPackageArchive,
  buildManifest,
  PACK_V1_AUTHORING_TEMPLATE,
} from './shared/aurora-package.ts';
import { writeFileSync } from 'node:fs';

const slug = 'glass-drift';
const archive = buildAuroraPackageArchive({
  manifest: buildManifest({
    slug,
    label: 'Glass Drift',
    character: 'soft refractive glass',
    wgslForm: 'authoring',
  }),
  wgsl: /* your WGSL or */ PACK_V1_AUTHORING_TEMPLATE,
  defaults: { intensity: 0.7, depth: 0.4, feedback: 0.35, speed: 0.5 },
});
writeFileSync(`${slug}.aurora-package`, archive);
```

Validate by parsing:

```ts
import { parseAuroraPackageArchive } from './shared/aurora-package.ts';
const r = parseAuroraPackageArchive(archive); // r.ok must be true; form becomes "show" after remap
```

### 4. Import into Aurora

**HTTP (running bridge + `AURORA_DATA_DIR`):**

```bash
curl -sS -X POST "http://127.0.0.1:3000/api/packages/import" \
  -H "Content-Type: application/zip" \
  --data-binary @glass-drift.aurora-package
```

Or JSON base64:

```bash
B64=$(base64 < glass-drift.aurora-package | tr -d '\n')
curl -sS -X POST "http://127.0.0.1:3000/api/packages/import" \
  -H "Content-Type: application/json" \
  -d "{\"archiveBase64\":\"$B64\"}"
```

**Helper (build + optional import):**

```bash
# requires AURORA_DATA_DIR for --import-dir / bridge for --import-http
bun run .agents/skills/aurora-create-visualization/scripts/build-package.ts \
  --slug glass-drift --label "Glass Drift" --wgsl ./package.wgsl \
  --out /tmp/glass-drift.aurora-package \
  --import-http http://127.0.0.1:3000
```

**Direct install (no HTTP)** — writes dual-deck packs under a data dir:

```ts
import { installAuroraPackageArchive } from './bridge/package-import.ts';
installAuroraPackageArchive(bytes, { dataDir: process.env.AURORA_DATA_DIR! });
// Bridge process must rescan; HTTP import already rescans.
```

### 5. Verify

Success JSON includes `ok: true`, `slug`, `overwritten`, `catalog.epoch`.  

Then:

- Controls launchpad should list the slug (after catalog WS update).  
- Select on deck A/B; confirm pack_drive knobs move the package.  
- If import returns **503**: `AURORA_DATA_DIR` is not set on the bridge.  
- If **400**: fix validation errors in `errors[]` (slug, missing uniform names, bad WGSL shape).

Re-import of the same slug **overwrites**.

---

## Workflow B — Preset Studio (human / visual)

```bash
bun run studio          # http://127.0.0.1:3010
```

1. New sketch → edit WGSL + knobs.  
2. **Export .aurora-package** (download).  
3. **Import to Aurora** (bridge origin default `http://127.0.0.1:3000`) **or** curl the file as in Workflow A.

Sketches live in browser `localStorage` only — they are **not** the show catalog until imported.

---

## WGSL design checklist (quality)

Before calling a package “done”:

- [ ] **Idle path:** `energy_raw = audio_uniforms.x`; when `< 0`, look still readable (not black).  
- [ ] **Live path:** bass/mid/high or pulse change motion/brightness when energy ≥ 0.  
- [ ] **Intensity** scales presence/density/gain.  
- [ ] **Depth** scales layers/parallax/thickness.  
- [ ] **Feedback/trails** scales sustain/smear/echo.  
- [ ] **Speed** scales time-driven motion (preview multiplies time by speed; show does similar).  
- [ ] Uses `palette_rgb` / sat / bright so Color + GPU palette knobs matter.  
- [ ] Aspect-correct: `params.w` is aspect; center UVs with `(uv - 0.5) * vec2(aspect, 1)`.  
- [ ] No unbounded `exp`/`pow` blowups; clamp outputs to 0..1.

Reference show pack: `data/decks/deck-a/point-cloud/point_cloud.wgsl` (show form `@group(2)`).

---

## Install layout (what import writes)

```text
$AURORA_DATA_DIR/decks/deck-a/<slug>/preset.json
$AURORA_DATA_DIR/decks/deck-a/<slug>/<slug_underscored>.wgsl
$AURORA_DATA_DIR/decks/deck-b/<slug>/preset.json
$AURORA_DATA_DIR/decks/deck-b/<slug>/<slug_underscored>.wgsl
```

`preset.json`: `disposition: fullscreen-primary`, one fullscreen layer ref, `suppressLegacyField: true`, `engineMinCapabilities: ["dual-fullscreen"]`.

---

## Common failures

| Symptom | Cause / fix |
| --- | --- |
| 503 on import | Set `AURORA_DATA_DIR` for the **bridge** process |
| 400 missing uniform name | WGSL must contain all five bus names as identifiers |
| 400 show form requires @group(2) | Export as `authoring` and let import remap, or write proper show form |
| Preview OK, show broken | Authoring remap failed; export `wgslForm: "show"` with Bevy entry manually |
| Catalog missing look | Import wrote override only; rescan/WS; confirm slug kebab-case |
| Only one deck works | You hand-wrote one deck; always use import (dual-deck) |

---

## Report back to the user

When finished, state:

1. **slug** + **label**  
2. Path to `.aurora-package` (if written)  
3. Import result (`overwritten`, catalog epoch) or that only the archive was produced  
4. How to select it (launchpad / deck mode)  
5. Any open follow-ups (bundled commit, Bevy parity check)

---

## Related commands

```bash
bun run studio                 # React Preset Studio :3010
bun run build:studio           # dist/studio
bun run preset-studio:bevy     # optional Bevy host
bunx vitest run tests/shared/aurora-package.test.ts tests/bridge/package-import.test.ts
```
