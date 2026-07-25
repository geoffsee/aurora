# 3D model catalog

Source-of-truth assets for mesh-based VJ visuals. Each model is a folder under
`models/<id>/` with a glTF binary (`.glb`) and optional external textures.

## Web vs local

| Kind | What | Size | GH Pages |
| --- | --- | --- | --- |
| **Web pack** (`ship: true`) | Cesium Man, Fox, Duck, Rigged Figure, Damaged Helmet, Milk Truck | ~5 MB total | Deployed |
| **Local-only** (`ship: false`) | Human Female (~47 MB), heavy PBR props | 10–70 MB each | **Not** deployed |

GitHub Pages visitors only receive the web pack. Selecting a “(local)” model on
Pages fails soft (empty figure + stage halo) — no crash, no multi‑MB 404 storm.
On a show machine with the files under `models/`, every catalog entry works.

The projector **lazy-loads** only the selected catalog index when Figure mode
is live, so idle web visits do not download glTF at all.

## Layout

```
models/
  manifest.json          # catalog (ship flag per entry)
  SOURCES.md             # provenance + re-download URLs
  <id>/
    source/*.glb         # primary mesh (embedded textures preferred for WASM)
    textures/            # optional external PBR maps
assets/models/           # runtime mirror Bevy AssetServer loads (symlink → ../models)
```

Bevy loads from `assets/`, so every catalog entry’s `assetPath` is relative to
`assets/` (e.g. `models/cesium-man/source/CesiumMan.glb`). The bridge serves
`assets/**` on the projector origin so WASM can fetch the same paths.

Deploy uses `scripts/stage-web-models.ts` to copy **only** `ship: true` GLBs
into `dist/assets/models` (never the whole symlink tree).

## How visualizations use a model

1. **Register** the model in `models/manifest.json` (and mirror the constants in
   `src/model_layer.rs` + `shared/model-catalog.ts`).
2. **Assign a visual mode** via `visualMode` (CPU deck picker index). Mode 24 is
   `Figure`.
3. **Runtime**: each catalog entry has a `ModelInstance` root. When Figure mode
   is live and the UI selects that index, the glTF is loaded; mesh primitives
   spawn as children (not `SceneRoot`). Other indices stay hidden.
4. **CPU geometry** for that mode is zeroed so the mesh reads as the primary look.

## Adding a new model

1. Drop files under `models/<id>/source/<name>.glb` (and textures if external).
2. Append an entry to `manifest.json` with `ship: true` only if it is small
   enough for Pages (prefer &lt; ~2 MB; total web pack budget ~12 MB).
3. Mirror the entry in `MODEL_CATALOG` inside `src/model_layer.rs`.
4. Mirror the entry in `shared/model-catalog.ts`.
5. If `ship: false`, add the folder to `.gitignore` so it never lands in the
   static site by accident.
6. Keep `assets/models` linked to `../models` (already set up).

## Notes

- Prefer a single self-contained `.glb` under ~10–15 MB for local show use.
  The sample `human-female` pack is large (~47 MB); treat it as a local asset.
- Models render through the existing `Camera3d` + PBR lights. Unlit tunnel rings
  stay independent.
- SDF “characters” (bear/wolf GPU variants) are a different path — procedural
  raymarch, not this mesh catalog.
