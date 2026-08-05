# Deck preset data directory

Read-only **bundled** catalog under `data/decks/`. Operators overlay custom packs via `AURORA_DATA_DIR` or `aurora --data-dir` without replacing the whole catalog.

| Doc | Purpose |
| --- | --- |
| This file | Layout, overlay, authoring, operator rules, validate CLI |
| [`docs/mode-protocol.md`](../docs/mode-protocol.md) | Authoring vs wire vs engine version axes |
| [`docs/mode-primitives.md`](../docs/mode-primitives.md) | Primitive IDs, param table, product ceiling |

Parent tracker: [#233](https://github.com/geoffsee/aurora/issues/233).

---

## Product ceiling

**Packs = params + shaders + meshes** on top of **registered** field primitives.

- You can ship a new **param skin**, layer list, or mesh/shader refs without touching `src/main.rs`.
- **Novel field math** (a look the engine cannot already draw) needs an **engine PR** that registers a permanent primitive ID and implements FieldRuntime for it.
- There is no pack-local scripting runtime and no remote marketplace in v1.

Full ceiling messaging and the ID table: [`docs/mode-primitives.md`](../docs/mode-primitives.md).

---

## Builtin set

Bundled builtins cover **all legacy control-bus modes 0–48** (49 presets) **per deck**, duplicated strictly under `deck-a/` and `deck-b/` (no shared library). Labels, character briefs, and `uiGroup` come from `shared/visual-mode-catalog.ts`. Folder names are kebab-case slugs derived from the catalog labels (`Beams` → `beams`, `CalabiYau` → `calabi-yau`).

**Non-legacy extras** (no `legacyIndex`, slug-only on the control bus) may ship alongside the 0–48 set:

- `supernova` — FieldRuntime `supernova_burst` vertical slice (`suppressLegacyField: true`)
- `point-cloud` — FieldRuntime `point_cloud` particulate field (`suppressLegacyField: true`)

Select via `deckAPresetSlug` / `deckBPresetSlug` (not VST/MIDI int). The generate script preserves known extras under `EXTRA_BUNDLED_SLUGS`.

Regenerate after catalog renames:

```bash
bun run scripts/generate-bundled-mode-presets.ts
bun run scripts/generate-bundled-mode-presets.ts --check   # CI / drift guard
```

The engine still matches legacy indices in Rust match arms; these folders are the catalog/metadata source for scan, compile, and later HTTP APIs. Modes 25–48 may be metadata-only (`engine-module` / `mesh-primary` / `fullscreen-primary`) until their backends ship. DSL-backed packs with an implemented FieldRuntime primitive skip those match arms when a compiled wire is active.

### Pack fullscreen (PR13 / #247)

- At most **one** `layers[]` entry with `kind: "fullscreen"` per pack (engine has **two** material slots — one per deck).
- Pack GLSL is compiled on the **bridge** (naga-cli) into WGSL attached on the wire; WASM never receives pack GLSL.
- Size cap: 256 KiB source. Fail-closed on missing naga / compile error (same soft UX class as Shadertoy import).
- GitHub Pages / static: builtins only; no runtime pack GLSL path.
- `suppressLegacyField: true` → ModeDirector `legacy_field_weight = 0`.

## Layout

```text
data/                         # bundled (read-only in product terms)
  decks/
    deck-a/<preset-slug>/preset.json   [+ optional assets/]
    deck-b/<preset-slug>/preset.json   [+ optional assets/]

$AURORA_DATA_DIR/             # optional writable overlay (same shape)
  decks/
    deck-a/<preset-slug>/...
    deck-b/<preset-slug>/...
```

### Strict per-deck catalogs

- Deck A **only** reads `decks/deck-a/`.
- Deck B **only** reads `decks/deck-b/`.
- There is **no shared cross-deck library** in v1. If both decks need the same look, **duplicate** the pack folder under each deck root (same slug or different — your choice; each deck catalogs independently).

### Slug rules

| Rule | Detail |
| --- | --- |
| Folder name | kebab-case: `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `preset.json` `slug` | Must match the folder name |
| `id` | Must equal `slug` (authoring schema v1) |
| Skipped folders | Names ending in `.tmp`, hidden (`.` prefix), invalid slugs, missing/invalid `preset.json` |

---

## `preset.json` (authoring schema v1)

Validated by `validateModePreset` in [`shared/mode-preset-schema.ts`](../shared/mode-preset-schema.ts).

```json
{
  "schemaVersion": 1,
  "id": "beams-hot",
  "slug": "beams-hot",
  "label": "Beams Hot",
  "character": "Optional one-line operator note",
  "uiGroup": "field-motion",
  "legacyIndex": 0,
  "disposition": "field-primitive",
  "field": {
    "primitive": "beams",
    "params": { "intensity": 1 }
  },
  "layers": [
    { "kind": "mesh", "ref": "human-female", "weight": 1 }
  ],
  "suppressLegacyField": false,
  "engineMinCapabilities": []
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `schemaVersion` | yes | Must be `1` today (`MODE_PRESET_SCHEMA_VERSION`) |
| `id` / `slug` | yes | Equal; slug matches folder name |
| `label` | yes | Non-empty UI string |
| `disposition` | yes | `field-primitive` \| `fullscreen-primary` \| `mesh-primary` \| `engine-module` \| `retire/merge` |
| `field` | when disposition is `field-primitive` | `primitive` must be a known name (see primitives doc) |
| `field.params` | optional | Known keys clamped at compile; **unknown keys allowed in authoring, stripped at compile** |
| `legacyIndex` | optional | Integer `0–48`. **Omit for non-legacy packs.** VST/MIDI can only select packs that have this |
| `layers` | optional | `kind`: `mesh` \| `fullscreen` \| `field` \| `accent`; `ref` non-empty string |
| `engineModule` | when disposition is `engine-module` | Module name string |
| `suppressLegacyField` | optional | Boolean |
| `engineMinCapabilities` | optional | String tags the runtime must support (e.g. `"field-runtime"`) |

### Contributor path: param-skin without reading `main.rs`

1. Pick a registered primitive from [`docs/mode-primitives.md`](../docs/mode-primitives.md).
2. Create `decks/deck-a/<slug>/preset.json` (and the same under `deck-b/` if both decks need it).
3. Set `disposition: "field-primitive"`, `field.primitive`, and params.
4. Optionally add `layers` for mesh/shader refs the engine already understands.
5. Run `bun run modes:validate` (point at your overlay root if needed).
6. Start the bridged stack with `--data-dir` / `AURORA_DATA_DIR` and select the slug from the controls launchpad (bridged path; catalog APIs land with later PRs in #233).

You do **not** need to edit Rust for param skins of existing primitives.

---

## Overlay rules

| Situation | Result |
| --- | --- |
| Missing / empty override | Full bundled catalog |
| Override defines slug `tunnel` | That slug **fully replaces** the bundled `tunnel` (no JSON deep-merge) |
| Override adds a new slug | New slug appears alongside remaining bundled slugs |
| First run | **No** automatic copy of bundled → override. Start empty or only with packs you want to shadow |

Fallback builtins always come from the **bundled** layer when an override does not define that slug.

### Atomic replace (`*.tmp` → rename)

Catalog scanners **ignore** folder names ending in `.tmp` (and hidden names). Safe publish pattern:

```bash
# Write a complete pack under a temporary name
mkdir -p "$AURORA_DATA_DIR/decks/deck-a/my-look.tmp"
cp -R ./staging/my-look/* "$AURORA_DATA_DIR/decks/deck-a/my-look.tmp/"

# Atomic-ish publish: rename into the live slug (same filesystem)
# If a previous live folder exists, replace it as a second step.
rm -rf "$AURORA_DATA_DIR/decks/deck-a/my-look"
mv "$AURORA_DATA_DIR/decks/deck-a/my-look.tmp" "$AURORA_DATA_DIR/decks/deck-a/my-look"
```

Partial writes never appear as selectable catalog entries while the name still ends in `.tmp`.

---

## Operator runtime rules (show-safe)

These are product intent for the catalog + control-bus work in #233 (PR1/PR4/PR7). Documented here so authors and ops share one mental model.

### Reload-active (no auto-swap on catalog change)

- Catalog **epoch** may update the **menu** whenever the merged pack set changes.
- The **renderer does not auto-swap** the active look when files change under the active slug.
- A new compiled pack is applied only when the operator **reselects** the mode or uses an explicit **Reload active** control (when that UI lands).
- Hot-reload of wasm/shaders in dev is separate from pack catalog semantics.

### Last-known-good fallback

If the **active** slug disappears from the catalog (deleted pack, bad replace, overlay removed):

- Hold the **last successfully compiled** wire for that deck.
- Surface a banner / diagnostic so the operator knows the menu entry is gone.
- Do not silently jump to an arbitrary other slug mid-show.

Invalid packs that fail schema validation are skipped at scan time and never enter the catalog; they do not poison last-known-good for a previously valid selection.

### VST / MIDI: legacy-only

- VST and MIDI control surfaces select modes by **legacy control-bus index** (`legacyIndex` `0–48`).
- Packs **without** `legacyIndex` are launchpad / slug-path only — **not** selectable from VST/MIDI in v1.
- Non-goal: VST selection of non-legacy packs.

### Strict per-deck duplication

No shared library folder. Duplicate pack trees under `deck-a/` and `deck-b/` when both sides need the same visualization.

---

## Static vs bridged

| Path | What you get |
| --- | --- |
| **Bridged** (`aurora`, `aurora --native`) | Bun bridge, data-dir catalog, OSC/VST, controls ↔ projector round-trip, compile/apply path (as PRs land) |
| **Static / GitHub Pages** | HTML/CSS + wasm projector only. **No** bridge, **no** live data-dir overlay, **no** controls OSC round-trip |

Deploy (`.github/workflows/deploy.yml`) publishes the static front-end for demos. Show operation uses the bridged stack.

---

## Native

```bash
AURORA_DATA_DIR=./my-modes aurora --native
# or
aurora --native --data-dir ./my-modes
```

`./my-modes` should contain `decks/deck-a/` and/or `decks/deck-b/` as above.

## Docker

```bash
AURORA_DATA_DIR=./my-modes aurora
# or
aurora --data-dir ./my-modes
```

Manual sketch:

```bash
docker run --rm \
  -v "$(pwd)/my-modes:/override:ro" \
  -e AURORA_DATA_DIR=/override \
  ... ghcr.io/geoffsee/aurora:latest
```

---

## Epoch

Each successful catalog scan produces a `CatalogSnapshot` with a monotonic **epoch**. The epoch advances only when the merged content hash changes (no-op rescans do not churn).

HTTP (visual server `:3000`, see `bridge/mode-api.ts`):

- `GET /api/modes/catalog` — public catalog (no absolute host paths) + epoch
- `GET /api/modes/compiled?deck=deck-a&slug=<slug>&epoch=<n>` — cached `CompiledModeWire` (omit `epoch` → current)
- `GET /api/data/e/<epoch>/decks/deck-{a|b}/<slug>/...` — sandboxed assets for retained epochs

On epoch bump the bridge broadcasts `/aurora/modes/catalog` over the WebSocket. The last ~4 epochs of assets/compile cache are retained.

## Control bus: slugs vs legacy ints

`ControlState` carries both:

| Field | Role |
| --- | --- |
| `deckAMode` / `deckBMode` | Legacy VisualMode int (`0`–`48`, or `-1` for slug-only packs) |
| `deckAPresetSlug` / `deckBPresetSlug` | Pack identity from the deck catalog |

Resolution is centralized in `shared/resolve-deck-selection.ts` (`resolveDeckSelection`):

1. **Non-empty slug wins** — mode is set from `legacyIndex`, or `-1` when the pack has none.
2. **Int-only** (VST / MIDI / launchpad) — maps to a slug only when some catalog entry on that deck has a matching `legacyIndex`. Never invents a non-legacy slug from an int.
3. **Both present** — slug wins.
4. Empty slug string is treated as absent.

### VST / MIDI limitation

VST parameters and MIDI CCs only send **legacy integers**. They can only select packs that declare `legacyIndex` in `preset.json`. Packs without `legacyIndex` (non-legacy overlays) are **not** reachable via VST/MIDI — use the controls page slug path (future dynamic launchpad, #241) or an explicit `deckAPresetSlug` / `deckBPresetSlug` write on the control bus.

Concurrent last-writer-wins is unchanged: the bridge still coerces each full state update; mode-only updates from VST do not get masked by a carried-over previous slug.

---

## Validate CLI

Offline schema scan — no bridge, no WASM:

```bash
bun run modes:validate                 # default: ./data
bun run modes:validate ./my-modes      # any data-dir root (expects decks/deck-a, decks/deck-b)
bun run modes:validate path/to.json    # single preset.json file
```

- Walks `decks/deck-a/*` and `decks/deck-b/*` (when present).
- For each pack folder: parse `preset.json`, run `validateModePreset`, check folder name matches `slug`.
- Skips `.tmp` / hidden / non-directories (same as the catalog scanner).
- Exit code `0` if every discovered pack is valid (or zero packs found).
- Exit code `1` if any pack fails validation; prints path + error list.

Implementation: [`scripts/modes-validate.ts`](../scripts/modes-validate.ts). Tests cover good/bad fixtures under `tests/fixtures/modes/`.

---

## Non-goals (v1)

- Shared cross-deck library
- Remote marketplace / user scripting
- Deep-merge override JSON onto bundled presets
- VST selection of non-legacy packs
