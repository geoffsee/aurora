# Mode protocol — version axes

Parent tracker: [#233](https://github.com/geoffsee/aurora/issues/233).  
Authoring + wire types land in [#236](https://github.com/geoffsee/aurora/issues/236) (this PR).

Three independent version surfaces — do not collapse them into one integer.

| Axis | Constant / field | Where it lives | When to bump |
|------|------------------|----------------|--------------|
| **Authoring** | `MODE_PRESET_SCHEMA_VERSION` / `schemaVersion` | On-disk `preset.json` (`shared/mode-preset-schema.ts`) | Breaking change to the authoring JSON shape |
| **Wire** | `COMPILED_MODE_WIRE_VERSION` / `wireVersion` | `CompiledModeWire` over HTTP/WS (`shared/compiled-mode-wire.ts`) | Breaking change to the compiled payload sent to projectors / WASM |
| **Engine** | `engineMinCapabilities?: string[]` | On both authoring preset and compiled wire | When a pack needs a new runtime feature flag the engine may not have |

## Authoring (`schemaVersion`)

Operators and pack authors edit `preset.json` under a data-dir deck folder:

```text
<data-dir>/decks/deck-a/<slug>/preset.json
```

`validateModePreset` enforces kebab-case `slug`, `id === slug`, known dispositions,
known field primitives, and required params. Unknown *param keys* are allowed in
authoring and stripped at compile.

## Wire (`wireVersion`)

`compileModePreset(preset, { epoch, deck, assetBase })` produces a
JSON-serializable `CompiledModeWire`:

- Resolves `field.primitive` name → permanent numeric `primitiveId`
- Clamps known params; strips unknown keys
- Fails if required params are missing

WASM ingest of `CompiledModeWire` is off-frame (PR6 / FieldRuntime): the
projector fetches `/api/modes/compiled` on slug change / reload-active and calls
`aurora_set_compiled_mode(deck, json)`. Parse failures keep the previous active
definition. Disk/catalog epoch bumps alone do not swap the active renderer.

## Engine capabilities

Packs may list tags such as `"field-runtime"` or `"dual-fullscreen"`. The engine
reports which capabilities it supports; a compile/apply path can refuse a wire
whose `engineMinCapabilities` are not met. This is **not** a single monolithic
engine version number.

## Pack fullscreen slots (PR13 / #247)

- **N=2** engine material slots — one per deck (`pack_fullscreen_a` / `pack_fullscreen_b`).
- Each pack may declare **at most one** `layers[]` entry with `kind: "fullscreen"`.
  A second fullscreen layer fails pure compile (soft-fail / banner, same class as
  Shadertoy import failures).
- **Bridge compiles pack GLSL → WGSL** with naga-cli (`shared/pack-fullscreen-compile.ts`
  reuses `transformShadertoyGlsl`). Size cap: `MAX_PACK_SHADER_SOURCE_BYTES` (256 KiB).
  Missing naga or compile errors are **fail-closed** (422 on `/api/modes/compiled`).
- Wire layers may carry optional `wgsl` after enrichment. **WASM receives WGSL only**.
- `.wgsl` pack assets pass through (no naga). Static / GitHub Pages: **builtins only** —
  no runtime pack GLSL path required on Pages.
- ModeDirector: `suppressLegacyField` → `legacy_field_weight = 0` so mesh/fullscreen
  primary packs do not double-draw the legacy field.

## Primitive IDs

`shared/field-primitive-ids.ts` is the permanent name→number registry.

**IDs never reuse.** Deprecate entries in place; do not reassign a number to a
different primitive. Future Rust parity must mirror the same table.

Full name→ID table, per-primitive param specs, and **product ceiling** copy
(params/shaders/meshes without rebuild; novel field math needs an engine PR):
[`docs/mode-primitives.md`](./mode-primitives.md).

## Authoring / operator guide

Pack layout, overlay rules (`AURORA_DATA_DIR`), slug rules, atomic `*.tmp` →
rename, reload-active / last-known-good, VST legacy-only, and static vs bridged:
[`data/README.md`](../data/README.md).

Offline validate:

```bash
bun run modes:validate              # ./data
bun run modes:validate ./my-modes   # overlay root
```

## Related modules

- `shared/mode-preset-schema.ts` — validate + compile
- `shared/compiled-mode-wire.ts` — wire types
- `shared/field-primitive-ids.ts` — permanent IDs
- `shared/visual-mode-catalog.ts` — legacy control-bus labels (0–48)
- `scripts/modes-validate.ts` — offline pack scan CLI (`bun run modes:validate`)
- `docs/mode-primitives.md` — primitive table + ceiling
- `data/README.md` — data-dir operator/author guide
- `shared/resolve-deck-selection.ts` — control-bus slug ↔ legacy int resolution (#238)

## Control bus (PR4 / #238)

Live `ControlState` carries both `deckAMode`/`deckBMode` (legacy int) and
`deckAPresetSlug`/`deckBPresetSlug`. See `data/README.md` § “Control bus: slugs vs
legacy ints”. VST/MIDI only select packs that declare `legacyIndex`.

## Engine-module ceiling (PR12 / #246)

Modes with disposition `engine-module` (and field ports for mesh/fullscreen-primary until pack backends land) live in the Rust engine (`src/engine_modules/`). They are **not authorable without a rebuild**: novel layout math requires an engine PR. Catalog folders still exist for uniform UX (`data/decks/.../preset.json`), and packs may only compose already-shipped field primitives, mesh refs, and supported shaders.
