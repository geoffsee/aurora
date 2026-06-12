# Shader visual regression harness

`bun run test` runs under vitest + happy-dom with no GPU, so the WGSL fragment
shaders in `assets/shaders/` cannot be executed directly in CI. Instead, the
harness renders a CPU reference port of each shader and compares pixel-exact
hashes against committed baselines, while hash-guarding the WGSL sources so a
shader edit can never land silently.

## Pieces

| File | Role |
|------|------|
| `assets/shaders/vj_palette.wgsl`, `assets/shaders/vj_grid.wgsl` | The real shaders (GPU). |
| `tests/shader-reference.ts` | Line-for-line CPU port of the WGSL fragment shaders. |
| `tests/update-shader-baselines.ts` | Scenario definitions + baseline generator. |
| `tests/shader-baselines.json` | Committed baselines: SHA-256 of each `.wgsl` source and of each rendered RGBA8 frame. |
| `tests/shader-regression.test.ts` | The vitest suite that enforces all of the above. |

## What the suite checks

1. **WGSL hash guard** — the SHA-256 of every `.wgsl` source must match
   `tests/shader-baselines.json`. Any shader edit fails the suite until the
   baselines are regenerated intentionally.
2. **Render baselines** — `renderShader()` output for each shader × scenario
   (audio-active, audio-quiet, osc-inactive) must hash to the committed value,
   catching accidental drift in the reference port.
3. **Sanity invariants** — the `-1.0` OSC-inactive energy sentinel blanks the
   layer's alpha, and rendering is deterministic.

## Workflow for changing a shader

1. Edit the `.wgsl` source.
2. Mirror the same change in `tests/shader-reference.ts` (the port must stay
   line-for-line with the WGSL math).
3. Regenerate the baselines:

   ```sh
   bun tests/update-shader-baselines.ts
   ```

4. Review the diff of `tests/shader-baselines.json` — the `wgsl` hashes confirm
   which sources changed, and changed `frames` hashes confirm the visual output
   moved (or, for a pure refactor, that it did not).
5. Commit the shader, the reference port, and the baselines together.

If `tests/shader-regression.test.ts` fails and you did **not** mean to change
shader output, the failure is the harness doing its job: either the WGSL and
the reference port have diverged, or an upstream change altered the math.

## Adding coverage

Add a new entry to `SCENARIOS` (or a new shader to `SHADERS`/`WGSL_SOURCES`)
in `tests/update-shader-baselines.ts`, then regenerate the baselines. The test
suite derives its matrix from those exports, so nothing else needs updating.
