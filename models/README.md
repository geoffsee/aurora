# 3D model catalog

Source-of-truth assets for mesh-based VJ visuals. Each model is a folder under
`models/<id>/` with a glTF binary (`.glb`) and optional external textures.

## Layout

```
models/
  manifest.json          # catalog consumed by TS tests + docs
  <id>/
    source/*.glb         # primary mesh (embedded textures preferred for WASM)
    textures/            # optional external PBR maps
assets/models/           # runtime mirror Bevy AssetServer loads (symlink → ../models)
```

Bevy loads from `assets/`, so every catalog entry’s `assetPath` is relative to
`assets/` (e.g. `models/human-female/source/….glb`). The bridge serves
`assets/**` on the projector origin so WASM can fetch the same paths.

## How visualizations use a model

1. **Register** the model in `models/manifest.json` (and mirror the constants in
   `src/model_layer.rs` + `shared/model-catalog.ts`).
2. **Assign a visual mode** via `visualMode` (CPU deck picker index). Mode 24 is
   `Figure` and ships with `human-female`.
3. **Runtime**: each catalog entry loads a `Handle<Gltf>`. When ready, mesh
   primitives are spawned as children of a `ModelInstance` root (not `SceneRoot`
   — scene spawn requires Reflect type registration that is brittle with
   `default-features = false` / WASM). When either deck is on the bound mode,
   the root is shown and driven (yaw/scale/nudge from intensity + bands) with
   crossfade weight. Other deck modes hide it.
4. **CPU geometry** for that mode is zeroed so the mesh reads as the primary look.

## Adding a new model

1. Drop files under `models/<id>/source/<name>.glb` (and textures if external).
2. Append an entry to `manifest.json`.
3. Mirror the entry in `MODEL_CATALOG` inside `src/model_layer.rs`.
4. Mirror the entry in `shared/model-catalog.ts`.
5. If you need a **new** deck mode (beyond reusing `Figure`), add it to
   `VisualMode` / `VISUAL_MODES` and bump the deck-mode clamps in the bridge and
   projector page (same places as any other control range).
6. Keep `assets/models` linked to `../models` (already set up).

## Notes

- Prefer a single self-contained `.glb` under ~10–15 MB for projector load times.
  The sample `human-female` pack is large (~49 MB); treat it as a local asset,
  not something to ship on GitHub Pages.
- Models render through the existing `Camera3d` + PBR lights. Unlit tunnel rings
  stay independent.
- SDF “characters” (bear/wolf GPU variants) are a different path — procedural
  raymarch, not this mesh catalog.
