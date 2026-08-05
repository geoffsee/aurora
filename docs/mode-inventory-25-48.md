# Mode inventory 25–48 (PR12 / #246)

Living inventory for disposition-gated migration. Aligns with bundled presets in `data/decks/*/`.

Dispositions: `field-primitive` | `fullscreen-primary` | `mesh-primary` | `engine-module` | `retire/merge`

| legacyIndex | slug | disposition | primitiveOrModule | notes |
|---:|---|---|---|---|
| 25 | `hypercube` | `mesh-primary` | `mesh:hypercube` | Projected tesseract frame; mesh-primary intent, engine-module field port until mesh pack assets. |
| 26 | `calabi-yau` | `fullscreen-primary` | `fullscreen:calabi-yau` | Manifold lobes; fullscreen-primary intent, engine port for field pools. |
| 27 | `quasicrystal` | `fullscreen-primary` | `fullscreen:quasicrystal` | 5-fold aperiodic interference; fullscreen-primary + engine port. |
| 28 | `penrose-tiling` | `fullscreen-primary` | `fullscreen:penrose-tiling` | Phi lattice; fullscreen-primary + engine port. |
| 29 | `sierpinski-triangle` | `mesh-primary` | `mesh:sierpinski-triangle` | Chaos-game / Sierpinski bits; mesh-primary intent, engine port. |
| 30 | `tetrahedral-matrix` | `mesh-primary` | `mesh:tetrahedral-matrix` | Elevated tetrahedral lattice; mesh-primary intent, engine port. |
| 31 | `borromean-rings` | `mesh-primary` | `mesh:borromean-rings` | Three linked rings; mesh-primary intent, engine port. |
| 32 | `torus` | `mesh-primary` | `mesh:torus` | Major/minor torus; mesh-primary intent, engine port. |
| 33 | `permutation-groups` | `engine-module` | `engine_modules::permutation_groups` | Slot permutation on beat; pure engine-module. |
| 34 | `symmetry-groups` | `engine-module` | `engine_modules::symmetry_groups` | Quadrant symmetry kaleidoscope; engine-module. |
| 35 | `lie-algebras` | `fullscreen-primary` | `fullscreen:lie-algebras` | Streamline adjoint drift; fullscreen-primary + engine port. |
| 36 | `lattice-theory` | `engine-module` | `engine_modules::lattice_theory` | Ranked poset layers; engine-module. |
| 37 | `graph-theory` | `engine-module` | `engine_modules::graph_theory` | Nodes and edges; engine-module. |
| 38 | `design-theory` | `engine-module` | `engine_modules::design_theory` | Balanced design blocks; engine-module. |
| 39 | `mandelbrot-set` | `fullscreen-primary` | `fullscreen:mandelbrot-set` | Complex zoom character; fullscreen-primary (pack WGSL when present). |
| 40 | `julia-sets` | `fullscreen-primary` | `fullscreen:julia-sets` | Julia seed orbit; fullscreen-primary + engine port. |
| 41 | `lorenz-attractor` | `fullscreen-primary` | `fullscreen:lorenz-attractor` | Lorenz integration ribbon; fullscreen-primary + engine port. |
| 42 | `functors` | `engine-module` | `engine_modules::functors` | Two-space functor map; engine-module. |
| 43 | `modular-arithmetic` | `engine-module` | `engine_modules::modular_arithmetic` | Modular clock classes; engine-module. |
| 44 | `p-adic-numbers` | `fullscreen-primary` | `fullscreen:p-adic-numbers` | Nested ultrametric disks; fullscreen-primary + engine port. |
| 45 | `vector-spaces` | `engine-module` | `engine_modules::vector_spaces` | Basis axes + shear; engine-module. |
| 46 | `eigenvectors` | `engine-module` | `engine_modules::eigenvectors` | Eigen-axis stretch; engine-module. |
| 47 | `boolean-lattices` | `mesh-primary` | `mesh:boolean-lattices` | Boolean hypercube lattice; mesh-primary intent, engine port. |
| 48 | `forcing` | `engine-module` | `engine_modules::forcing` | Forcing tree growth; engine-module. |

## Implementation notes

- **engine-module**: layout math lives in `src/engine_modules/` (not giant `main.rs` match arms). Folder metadata still on disk under `data/decks/`.
- **fullscreen-primary**: ModeDirector weight 0 only when pack fullscreen WGSL is active; otherwise engine-module field port keeps the look.
- **mesh-primary**: ModeDirector weight 0 when compiled mesh-primary / mesh layer is active (Figure pattern); otherwise engine-module field port.
- **field-primitive**: none in 25–48 (Family A ends at 23; Figure is 24).
- **retire/merge**: none in 25–48.

## Product copy

Engine-module modes are **not authorable without a rebuild**. Novel field math requires an engine PR; packs can only compose shipped primitives, mesh refs, and supported shaders.

Catalog UX is uniform: every mode 0–48 has a folder under `data/decks/deck-{a,b}/<slug>/preset.json`, including engine-module entries.
