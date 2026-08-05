//! Disposition table for legacy visual modes 25–48 (PR12 / #246).
//!
//! Mirrors bundled preset `disposition` fields and drives ModeDirector /
//! engine-module routing. Catalog folders exist for every entry (including
//! engine-module).

#![allow(dead_code)]

use crate::mode_catalog::VisualMode;

/// How a legacy mode owns its look after the filesystem catalog migration.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModeDispositionKind {
    FieldPrimitive,
    FullscreenPrimary,
    MeshPrimary,
    EngineModule,
    RetireMerge,
}

impl ModeDispositionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FieldPrimitive => "field-primitive",
            Self::FullscreenPrimary => "fullscreen-primary",
            Self::MeshPrimary => "mesh-primary",
            Self::EngineModule => "engine-module",
            Self::RetireMerge => "retire/merge",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "field-primitive" => Self::FieldPrimitive,
            "fullscreen-primary" => Self::FullscreenPrimary,
            "mesh-primary" => Self::MeshPrimary,
            "engine-module" => Self::EngineModule,
            "retire/merge" => Self::RetireMerge,
            _ => return None,
        })
    }
}

/// One inventory row for modes 25–48.
#[derive(Clone, Copy, Debug)]
pub struct ModeInventoryRow {
    pub legacy_index: i32,
    pub slug: &'static str,
    pub disposition: ModeDispositionKind,
    /// Permanent field primitive id, mesh catalog id, or engine module path label.
    pub primitive_or_module: &'static str,
    pub notes: &'static str,
}

/// Complete living inventory for legacy indices 25–48 (inclusive).
pub const MODE_INVENTORY_25_48: &[ModeInventoryRow] = &[
    ModeInventoryRow {
        legacy_index: 25,
        slug: "hypercube",
        disposition: ModeDispositionKind::MeshPrimary,
        primitive_or_module: "mesh:hypercube",
        notes: "Projected tesseract frame; mesh-primary intent, engine-module field port until mesh pack assets.",
    },
    ModeInventoryRow {
        legacy_index: 26,
        slug: "calabi-yau",
        disposition: ModeDispositionKind::FullscreenPrimary,
        primitive_or_module: "fullscreen:calabi-yau",
        notes: "Manifold lobes; fullscreen-primary intent, engine port for field pools.",
    },
    ModeInventoryRow {
        legacy_index: 27,
        slug: "quasicrystal",
        disposition: ModeDispositionKind::FullscreenPrimary,
        primitive_or_module: "fullscreen:quasicrystal",
        notes: "5-fold aperiodic interference; fullscreen-primary + engine port.",
    },
    ModeInventoryRow {
        legacy_index: 28,
        slug: "penrose-tiling",
        disposition: ModeDispositionKind::FullscreenPrimary,
        primitive_or_module: "fullscreen:penrose-tiling",
        notes: "Phi lattice; fullscreen-primary + engine port.",
    },
    ModeInventoryRow {
        legacy_index: 29,
        slug: "sierpinski-triangle",
        disposition: ModeDispositionKind::MeshPrimary,
        primitive_or_module: "mesh:sierpinski-triangle",
        notes: "Chaos-game / Sierpinski bits; mesh-primary intent, engine port.",
    },
    ModeInventoryRow {
        legacy_index: 30,
        slug: "tetrahedral-matrix",
        disposition: ModeDispositionKind::MeshPrimary,
        primitive_or_module: "mesh:tetrahedral-matrix",
        notes: "Elevated tetrahedral lattice; mesh-primary intent, engine port.",
    },
    ModeInventoryRow {
        legacy_index: 31,
        slug: "borromean-rings",
        disposition: ModeDispositionKind::MeshPrimary,
        primitive_or_module: "mesh:borromean-rings",
        notes: "Three linked rings; mesh-primary intent, engine port.",
    },
    ModeInventoryRow {
        legacy_index: 32,
        slug: "torus",
        disposition: ModeDispositionKind::MeshPrimary,
        primitive_or_module: "mesh:torus",
        notes: "Major/minor torus; mesh-primary intent, engine port.",
    },
    ModeInventoryRow {
        legacy_index: 33,
        slug: "permutation-groups",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::permutation_groups",
        notes: "Slot permutation on beat; pure engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 34,
        slug: "symmetry-groups",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::symmetry_groups",
        notes: "Quadrant symmetry kaleidoscope; engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 35,
        slug: "lie-algebras",
        disposition: ModeDispositionKind::FullscreenPrimary,
        primitive_or_module: "fullscreen:lie-algebras",
        notes: "Streamline adjoint drift; fullscreen-primary + engine port.",
    },
    ModeInventoryRow {
        legacy_index: 36,
        slug: "lattice-theory",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::lattice_theory",
        notes: "Ranked poset layers; engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 37,
        slug: "graph-theory",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::graph_theory",
        notes: "Nodes and edges; engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 38,
        slug: "design-theory",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::design_theory",
        notes: "Balanced design blocks; engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 39,
        slug: "mandelbrot-set",
        disposition: ModeDispositionKind::FullscreenPrimary,
        primitive_or_module: "fullscreen:mandelbrot-set",
        notes: "Complex zoom character; fullscreen-primary (pack WGSL when present).",
    },
    ModeInventoryRow {
        legacy_index: 40,
        slug: "julia-sets",
        disposition: ModeDispositionKind::FullscreenPrimary,
        primitive_or_module: "fullscreen:julia-sets",
        notes: "Julia seed orbit; fullscreen-primary + engine port.",
    },
    ModeInventoryRow {
        legacy_index: 41,
        slug: "lorenz-attractor",
        disposition: ModeDispositionKind::FullscreenPrimary,
        primitive_or_module: "fullscreen:lorenz-attractor",
        notes: "Lorenz integration ribbon; fullscreen-primary + engine port.",
    },
    ModeInventoryRow {
        legacy_index: 42,
        slug: "functors",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::functors",
        notes: "Two-space functor map; engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 43,
        slug: "modular-arithmetic",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::modular_arithmetic",
        notes: "Modular clock classes; engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 44,
        slug: "p-adic-numbers",
        disposition: ModeDispositionKind::FullscreenPrimary,
        primitive_or_module: "fullscreen:p-adic-numbers",
        notes: "Nested ultrametric disks; fullscreen-primary + engine port.",
    },
    ModeInventoryRow {
        legacy_index: 45,
        slug: "vector-spaces",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::vector_spaces",
        notes: "Basis axes + shear; engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 46,
        slug: "eigenvectors",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::eigenvectors",
        notes: "Eigen-axis stretch; engine-module.",
    },
    ModeInventoryRow {
        legacy_index: 47,
        slug: "boolean-lattices",
        disposition: ModeDispositionKind::MeshPrimary,
        primitive_or_module: "mesh:boolean-lattices",
        notes: "Boolean hypercube lattice; mesh-primary intent, engine port.",
    },
    ModeInventoryRow {
        legacy_index: 48,
        slug: "forcing",
        disposition: ModeDispositionKind::EngineModule,
        primitive_or_module: "engine_modules::forcing",
        notes: "Forcing tree growth; engine-module.",
    },
];

/// Look up inventory row by legacy control index.
pub fn inventory_for_legacy_index(legacy_index: i32) -> Option<&'static ModeInventoryRow> {
    MODE_INVENTORY_25_48
        .iter()
        .find(|r| r.legacy_index == legacy_index)
}

/// Disposition for a VisualMode in the 25–48 range (None outside).
pub fn disposition_for_mode(mode: VisualMode) -> Option<ModeDispositionKind> {
    let id = mode.as_control();
    inventory_for_legacy_index(id).map(|r| r.disposition)
}

/// True when layout for this mode is owned by `engine_modules` (or field port of mesh/fullscreen).
pub fn is_engine_module_routed(mode: VisualMode) -> bool {
    let id = mode.as_control();
    (25..=48).contains(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inventory_covers_25_through_48_exactly() {
        assert_eq!(MODE_INVENTORY_25_48.len(), 24);
        let mut seen = [false; 24];
        for row in MODE_INVENTORY_25_48 {
            assert!((25..=48).contains(&row.legacy_index));
            let i = (row.legacy_index - 25) as usize;
            assert!(!seen[i], "duplicate legacyIndex {}", row.legacy_index);
            seen[i] = true;
            assert!(!row.slug.is_empty());
            assert!(!row.primitive_or_module.is_empty());
        }
        assert!(seen.iter().all(|&s| s));
    }

    #[test]
    fn inventory_aligns_with_visual_mode_labels() {
        use crate::mode_catalog::VisualMode;
        for row in MODE_INVENTORY_25_48 {
            let mode = VisualMode::from_control(row.legacy_index as f32);
            assert_eq!(mode.as_control(), row.legacy_index);
            assert!(is_engine_module_routed(mode));
        }
        assert!(!is_engine_module_routed(VisualMode::Beams));
        assert!(!is_engine_module_routed(VisualMode::Figure));
        assert!(is_engine_module_routed(VisualMode::Hypercube));
        assert!(is_engine_module_routed(VisualMode::Forcing));
    }

    #[test]
    fn disposition_strings_round_trip() {
        for row in MODE_INVENTORY_25_48 {
            let s = row.disposition.as_str();
            assert_eq!(ModeDispositionKind::parse(s), Some(row.disposition));
        }
    }

    #[test]
    fn sample_dispositions_match_bundled_presets() {
        assert_eq!(
            inventory_for_legacy_index(25).unwrap().disposition,
            ModeDispositionKind::MeshPrimary
        );
        assert_eq!(
            inventory_for_legacy_index(33).unwrap().disposition,
            ModeDispositionKind::EngineModule
        );
        assert_eq!(
            inventory_for_legacy_index(39).unwrap().disposition,
            ModeDispositionKind::FullscreenPrimary
        );
        assert_eq!(
            inventory_for_legacy_index(48).unwrap().disposition,
            ModeDispositionKind::EngineModule
        );
    }
}
