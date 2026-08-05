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

No WASM ingest here (PR6 / FieldRuntime). No disk scan here (PR1 / PR3).

## Engine capabilities

Packs may list tags such as `"field-runtime"` or `"dual-fullscreen"`. The engine
reports which capabilities it supports; a compile/apply path (later PRs) can
refuse a wire whose `engineMinCapabilities` are not met. This is **not** a single
monolithic engine version number.

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
