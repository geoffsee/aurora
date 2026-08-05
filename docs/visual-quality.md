# Visual quality goals and knobs (#232)

Aurora’s CPU field (beams, rings, tiles, ghosts) should feel **clear, calm, and mode-distinct** — not denser, louder, or more technical. This note records the aesthetic targets and the code knobs that implement them.

## Aesthetic goals

| Goal | What it means on stage |
| --- | --- |
| Simple compositions | One readable structure per mode (radial / linear / grid / organic), not every pool competing. |
| Smooth movement | Prefer low-frequency drift and beat-coupled pumps over high-frequency wobble. |
| Balanced color | Saturation under neon clip; lightness has headroom and a real black floor. |
| Good contrast | Darker base, brighter crests; max-brightness deepens blacks instead of muddying midtones. |
| Empty space | Fewer elements, lower outer/index alpha, checker/sparse grids, softer ghosts. |
| Mode distinctiveness | Family A (0–23) should read at a glance without changing control mapping. |

Does **not** require new engines, marketplace packs, or novel math — only parameter and layout tuning.

## Global knobs (`src/main.rs`)

Named constants near the stage size:

| Constant | Role |
| --- | --- |
| `DECK_A_BEAMS` / `DECK_A_RINGS` / `DECK_B_COLS`×`DECK_B_ROWS` / `DECK_GHOSTS` | Pool density (sparser defaults post-#232). |
| `OSC_PULSE_GAIN` / `AUDIO_GEOMETRY_GAIN` | Audio→geometry coupling (lower = calmer motion). |
| `VIS_SAT_BASE` / `VIS_SAT_INTENSITY` | CPU field saturation ceiling. |
| `VIS_LIGHTNESS_BASE` | Base lightness before beat/flash lifts. |
| `VIS_ALPHA_ENERGY_FLOOR` / `VIS_ALPHA_ENERGY_GAIN` / `VIS_ALPHA_CEIL` | How hard intensity fills the frame. |
| `VIS_WOBBLE_FREQ` / `VIS_WOBBLE_SEED` | High-frequency position jitter. |
| `VIS_HUE_DRIFT` | Slow global hue spin. |
| `VIS_GHOST_ALPHA_MUL` | Trails layer opacity scale. |
| `VIS_PALETTE_L_FLOOR` / `VIS_PALETTE_L_CEIL` | Hard lightness clamp in `palette_color` (preserve blacks, avoid white crush). |

Defaults on `VjState` also use slightly lower `palette_saturation`, `palette_brightness`, and `max_brightness`.

## Per-mode signatures (Family A)

Layout math still lives in the legacy `VisualMode` arms of `update_visuals`. Post-#232 each mode is nudged toward a clearer family:

- **Radial** — Beams, Burst, Spiral, Comet, Pulse, Orbit, Vortex, Bloom  
- **Linear / bands** — Flux, Scanner, Wash, Storm rain  
- **Grid / lattice** — Lattice, Mirror (with mid-gap / checker sparsity)  
- **Organic / soft** — Swarm, Drift, Nebula, Echo, Ripple  
- **Angular / hard** — Shatter, Fracture, Strobe, Prism  

Typical techniques: index/layer alpha falloff, alternate-cell sparsity, fewer lightning bolts, slower spin, thinner sticks.

Rings stay **centred** (no multi-radius webs); only radius, halo, and alpha change per mode.

## FieldRuntime (`src/field_runtime.rs`)

DSL-backed primitives (currently `supernova_burst`) apply the same calm rules in `pose_*`:

- Lower energy/burst ceilings  
- Damped wobble on beams  
- Checker negative space on tiles  
- Softer ghost alpha  
- Lightness clamp aligned with `VIS_PALETTE_L_*`  

Default `FieldFrameInputs` pool counts match the sparser main pools.

When Family A migrates fully onto FieldRuntime (#242+), keep these ceilings and falloffs in the primitive params / pose code rather than re-densifying in legacy arms.

## ModeDirector / palette path

- `max_brightness` is a **CPU beams/tiles master**; rings/ghosts keep independent opacity.  
- Lightness is scaled by max brightness with a floor so dimming deepens contrast.  
- GPU path uses `palette_brightness` only (unchanged contract).  

## Regenerating goldens

FieldRuntime pose snapshots:

```bash
UPDATE_FIELD_GOLDS=1 cargo test -p aurora --bin aurora golden_poses -- --nocapture
```

Paste the printed table into `golden_poses_match_snapshot` in `src/field_runtime.rs`. CI runs `cargo test -p aurora --bin aurora field_runtime` via `scripts/test-rust.sh`.

## Out of scope

- New primitives, shader marketplace, architecture rewrites  
- Changing control protocol or mode indices  
- Forcing GPU shaders to match CPU field density (separate knobs)  
