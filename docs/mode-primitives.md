# Field primitives — registry, params, and product ceiling

Parent tracker: [#233](https://github.com/geoffsee/aurora/issues/233).  
Authoring schema: [`docs/mode-protocol.md`](./mode-protocol.md) · operator pack layout: [`data/README.md`](../data/README.md).

Registry source of truth: [`shared/field-primitive-ids.ts`](../shared/field-primitive-ids.ts).  
Param clamps / defaults: `FIELD_PRIMITIVE_PARAM_SPECS` in [`shared/mode-preset-schema.ts`](../shared/mode-preset-schema.ts).

## Product ceiling (read this first)

A **mode pack** on disk is params + optional shader/mesh layers over **already-shipped** field primitives.

| You can ship without rebuilding WASM | Needs an engine PR |
| --- | --- |
| Param skins (clamp/tune known keys) | New field math / new primitive ID |
| Shader layers that the engine already routes | Novel GPU field algorithms not in FieldRuntime |
| Mesh layers from catalog / pack-local assets | New engine capability flags the runtime does not report |
| Fullscreen / accent layers with known refs | Reassigning or inventing permanent primitive IDs |

**Ceiling copy for UI and docs:** packs configure **params, shaders, and meshes** against registered primitives. **Novel field math requires an engine PR** — there is no user-scripting or pack-local primitive bytecode path in v1.

Static GitHub Pages ships the projector front-end plus a **read-only bundled catalog** (`api/modes/catalog.json` and precompiled wires). Bridged show stacks (`aurora` / `aurora --native`) are where the live data-dir overlay, hot rescan, and control bus run. See [Static vs bridged](../data/README.md#static-vs-bridged).

## Permanent ID rules

- **IDs never reuse.** Deprecate in place; do not reassign a number to a different primitive.
- Append-only registry. Future Rust FieldRuntime parity must mirror names and numbers.
- Reserved ranges (documentation only):
  - `1–99` — shipped / in-flight field primitives
  - `100–199` — Family B/C mesh-primary helpers (future)
  - `200+` — experimental / pack-local (avoid until protocol allows)

## Name → ID table

| Name | ID | Notes |
| --- | ---: | --- |
| `supernova_burst` | 1 | PR6 vertical-slice example (not a legacy catalog index) |
| `point_cloud` | 2 | **Reserved** (not a CPU pose). Shipped look is GPU pack `point-cloud` fullscreen WGSL |
| `beams` | 10 | Family A (legacy control-bus index 0) |
| `tunnel` | 11 | Family A |
| `burst` | 12 | Family A |
| `mirror` | 13 | Family A |
| `wash` | 14 | Family A |
| `strobe` | 15 | Family A |
| `swarm` | 16 | Family A |
| `orbit` | 17 | Family A |
| `pulse` | 18 | Family A |
| `spiral` | 19 | Family A |
| `ripple` | 20 | Family A |
| `shatter` | 21 | Family A |
| `flux` | 22 | Family A |
| `lattice` | 23 | Family A |
| `drift` | 24 | Family A |
| `storm` | 25 | Family A |
| `echo` | 26 | Family A |
| `vortex` | 27 | Family A |
| `fracture` | 28 | Family A |
| `nebula` | 29 | Family A |
| `prism` | 30 | Family A |
| `scanner` | 31 | Family A |
| `comet` | 32 | Family A |
| `bloom` | 33 | Family A |

Authoring JSON uses the **name** (`field.primitive`). Compile resolves it to the permanent numeric `primitiveId` on the wire.

## Param schema (per primitive)

Only keys listed here survive `compileModePreset`. Unknown keys are allowed in authoring and **stripped** at compile. Required keys fail validation if omitted.

| Primitive | Param | Default | Min | Max | Required |
| --- | --- | ---: | ---: | ---: | --- |
| `supernova_burst` | `intensity` | 0.85 | 0 | 1 | yes |
| `supernova_burst` | `spin` | 0.4 | −2 | 2 | |
| `supernova_burst` | `decay` | 0.55 | 0.01 | 1 | |
| `point_cloud` | *(reserved — no CPU params; GPU pack uses control bus + audio uniforms)* | | | | |
| `beams` | `intensity` | 1 | 0 | 1 | |
| `tunnel` | `intensity` | 1 | 0 | 1 | |
| `tunnel` | `depth` | 0.5 | 0 | 1 | |
| `burst` | `intensity` | 1 | 0 | 1 | |
| `mirror` | `intensity` | 1 | 0 | 1 | |
| `wash` | `intensity` | 1 | 0 | 1 | |
| `strobe` | `intensity` | 1 | 0 | 1 | |
| `swarm` | `intensity` | 1 | 0 | 1 | |
| `orbit` | `intensity` | 1 | 0 | 1 | |
| `orbit` | `spin` | 0.3 | −2 | 2 | |
| `pulse` | `intensity` | 1 | 0 | 1 | |
| `spiral` | `intensity` | 1 | 0 | 1 | |
| `spiral` | `spin` | 0.3 | −2 | 2 | |
| `ripple` | `intensity` | 1 | 0 | 1 | |
| `shatter` | `intensity` | 1 | 0 | 1 | |
| `flux` | `intensity` | 1 | 0 | 1 | |
| `lattice` | `intensity` | 1 | 0 | 1 | |
| `drift` | `intensity` | 1 | 0 | 1 | |
| `storm` | `intensity` | 1 | 0 | 1 | |
| `echo` | `intensity` | 1 | 0 | 1 | |
| `vortex` | `intensity` | 1 | 0 | 1 | |
| `vortex` | `spin` | 0.5 | −2 | 2 | |
| `fracture` | `intensity` | 1 | 0 | 1 | |
| `nebula` | `intensity` | 1 | 0 | 1 | |
| `prism` | `intensity` | 1 | 0 | 1 | |
| `scanner` | `intensity` | 1 | 0 | 1 | |
| `comet` | `intensity` | 1 | 0 | 1 | |
| `bloom` | `intensity` | 1 | 0 | 1 | |

Family A param surfaces start minimal (`intensity`, occasional `spin` / `depth`) so compile has a real clamp surface. Deeper knobs land with Family migration PRs (#242–#244).

### Minimal param-skin example

```json
{
  "schemaVersion": 1,
  "id": "beams-hot",
  "slug": "beams-hot",
  "label": "Beams Hot",
  "disposition": "field-primitive",
  "field": {
    "primitive": "beams",
    "params": { "intensity": 1 }
  },
  "legacyIndex": 0
}
```

No Rust changes required: same primitive ID, different clamps/defaults the operator can overlay under `AURORA_DATA_DIR`.

### Novel field example (engine work)

`supernova_burst` (ID 1) is the vertical-slice pattern for a **new** look: register the name/ID in TypeScript **and** implement the math in FieldRuntime (Rust/WASM). Packs may then skin its params without further engine work.

## How to propose a new primitive

1. Open an engine PR that:
   - Appends a permanent entry to `FIELD_PRIMITIVE_IDS` (never reuse an ID).
   - Adds `FIELD_PRIMITIVE_PARAM_SPECS` defaults/clamps.
   - Implements FieldRuntime handling for that `primitiveId`.
   - Updates this table and any parity tests.
2. After the engine ships, authors can publish packs that set `field.primitive` to the new name.
3. Do **not** invent pack-local primitive names hoping the bridge will accept them — `validateModePreset` rejects unknown names.

## Offline validation

```bash
bun run modes:validate              # scan ./data
bun run modes:validate ./my-modes   # scan an overlay root
```

See [`data/README.md`](../data/README.md#validate-cli).

## Non-goals (v1)

Do not claim support for:

- Shared cross-deck library
- Remote marketplace / user scripting
- Deep-merge override JSON onto bundled presets
- VST/MIDI selection of packs that lack `legacyIndex`
