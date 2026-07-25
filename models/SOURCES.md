# Model sources

Local glTF packs under `models/*/`. Prefer self-contained `.glb` files.

## Policy

- **`ship: true`** — committed, included in GitHub Pages via
  `scripts/stage-web-models.ts` (~5 MB total budget; hard fail above 12 MB).
- **`ship: false`** — gitignored local show assets. Work with `bun run dev` when
  files are present; omitted from the static site so web visitors never 404
  multi‑MB binaries.

## Web pack (shipped)

Downloaded from [KhronosGroup/glTF-Sample-Models](https://github.com/KhronosGroup/glTF-Sample-Models)
(`master`, binary glTF). Each model has its own license under
`2.0/<Name>/README.md` — typically CC0 or similar; check before redistribution.

| Catalog id | File | ~Size |
| --- | --- | --- |
| `cesium-man` | CesiumMan.glb | 479 KB |
| `fox` | Fox.glb | 159 KB |
| `duck` | Duck.glb | 118 KB |
| `rigged-figure` | RiggedFigure.glb | 49 KB |
| `damaged-helmet` | DamagedHelmet.glb | 3.6 MB |
| `cesium-milk-truck` | CesiumMilkTruck.glb | 437 KB |

## Local-only (not on Pages)

| Catalog id | File | Notes |
| --- | --- | --- |
| `human-female` | …ae.glb | Private pack ~47 MB |
| `brain-stem` | BrainStem.glb | Khronos sample |
| `boom-box` | BoomBox.glb | Khronos sample ~10 MB |
| `lantern` | Lantern.glb | Khronos sample |
| `water-bottle` | WaterBottle.glb | Khronos sample |
| `avocado` | Avocado.glb | Khronos sample |
| `antique-camera` | AntiqueCamera.glb | Khronos sample ~19 MB |
| `corset` | Corset.glb | Khronos sample |
| `sheen-chair` | SheenChair.glb | Sample Assets |
| `toy-car` | ToyCar.glb | Sample Assets |
| `iridescent-dish` | IridescentDishWithOlives.glb | Sample Assets |

## Re-download web pack

```bash
BASE=https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0
curl -fsSL -o models/cesium-man/source/CesiumMan.glb \
  "$BASE/CesiumMan/glTF-Binary/CesiumMan.glb"
# …same pattern for Fox, Duck, RiggedFigure, DamagedHelmet, CesiumMilkTruck
```

Unit scales differ a lot across samples; `defaultScale` / `figureScale` in the
catalog and controls UI compensate so each asset roughly fills the stage.
