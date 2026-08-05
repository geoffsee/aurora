# Deck preset data directory

Read-only **bundled** catalog shipped in the repo under `data/decks/`. Operators can overlay custom presets via `AURORA_DATA_DIR` or `aurora --data-dir` without replacing the whole catalog.

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

Each preset folder is a **slug** (kebab-case). Required file: `preset.json` with at least:

```json
{
  "id": "beams",
  "slug": "beams",
  "label": "Beams",
  "legacyIndex": 0
}
```

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
