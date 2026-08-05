# Deck preset data directory

Read-only **bundled** catalog shipped in the repo under `data/decks/`. Operators can overlay custom presets via `AURORA_DATA_DIR` or `aurora --data-dir` without replacing the whole catalog.

Runtime never writes into this tree — only the optional override root is writable.

## Builtin set

Bundled builtins cover **all legacy control-bus modes 0–48** (49 presets) **per deck**, duplicated strictly under `deck-a/` and `deck-b/` (no shared library). Labels, character briefs, and `uiGroup` come from `shared/visual-mode-catalog.ts`. Folder names are kebab-case slugs derived from the catalog labels (`Beams` → `beams`, `CalabiYau` → `calabi-yau`).

Regenerate after catalog renames:

```bash
bun run scripts/generate-bundled-mode-presets.ts
bun run scripts/generate-bundled-mode-presets.ts --check   # CI / drift guard
```

The engine still matches legacy indices in Rust match arms; these folders are the catalog/metadata source for scan, compile, and later HTTP APIs. Modes 25–48 may be metadata-only (`engine-module` / `mesh-primary` / `fullscreen-primary`) until their backends ship.

## Layout

```
data/                         # bundled (read-only in product terms)
  decks/
    deck-a/<preset-slug>/preset.json   [+ assets/]
    deck-b/<preset-slug>/preset.json   [+ assets/]

$AURORA_DATA_DIR/             # optional writable overlay (same shape)
  decks/
    deck-a/<preset-slug>/...
    deck-b/<preset-slug>/...
```

Strict per-deck catalogs: Deck A only reads `deck-a/`, Deck B only `deck-b/`.

Each preset folder is a **slug** (kebab-case). Bundled `preset.json` files use authoring schema v1 (`shared/mode-preset-schema.ts`):

```json
{
  "schemaVersion": 1,
  "id": "beams",
  "slug": "beams",
  "label": "Beams",
  "character": "Radial sticks—core pulse and spin field.",
  "uiGroup": "field-motion",
  "legacyIndex": 0,
  "disposition": "field-primitive",
  "field": { "primitive": "beams" }
}
```

Scan (`bridge/mode-catalog.ts`) only requires `id` + folder/slug consistency (plus optional `label` / `legacyIndex`). Full `validateModePreset` applies on the compile path.

- `id` is required. If `slug` is omitted, `id` must equal the folder name.
- If `slug` is present, it must match the folder name.
- Folders ending in `.tmp`, hidden names, invalid slugs, or missing/invalid `preset.json` are ignored.

## Overlay rules

| Situation | Result |
| --- | --- |
| Missing / empty override | Full bundled catalog |
| Override defines slug `tunnel` | That slug fully replaces the bundled `tunnel` (no JSON deep-merge) |
| Override adds a new slug | New slug appears alongside remaining bundled slugs |
| First run | **No** copy of bundled → override. Start with an empty overlay or only the presets you want to shadow |

Fallback builtins always come from the bundled layer when an override does not define that slug.

## Native

```bash
AURORA_DATA_DIR=./my-modes aurora --native
# or
aurora --native --data-dir ./my-modes
```

`./my-modes` should contain `decks/deck-a/` and/or `decks/deck-b/` as above.

## Docker

Mount the host override directory and point the bridge at it:

```bash
# With the aurora CLI (forwards --data-dir / AURORA_DATA_DIR into the container)
AURORA_DATA_DIR=./my-modes aurora
# or
aurora --data-dir ./my-modes

# Equivalent manual docker run sketch
docker run --rm \
  -v "$(pwd)/my-modes:/override:ro" \
  -e AURORA_DATA_DIR=/override \
  ... ghcr.io/geoffsee/aurora:latest
```

## Epoch

Each successful catalog scan produces a `CatalogSnapshot` with a monotonic `epoch`. The epoch advances only when the merged content hash changes (no-op rescans do not churn).

HTTP (visual server `:3000`, see `bridge/mode-api.ts`):

- `GET /api/modes/catalog` — public catalog (no absolute host paths) + epoch
- `GET /api/modes/compiled?deck=deck-a&slug=<slug>&epoch=<n>` — cached `CompiledModeWire` (omit `epoch` → current)
- `GET /api/data/e/<epoch>/decks/deck-{a|b}/<slug>/...` — sandboxed assets for retained epochs

On epoch bump the bridge broadcasts `/aurora/modes/catalog` over the WebSocket. The last ~4 epochs of assets/compile cache are retained.
