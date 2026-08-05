//! Visual mode catalog — IDs, labels, character briefs, backend tags, routing.
//!
//! Keep in sync with `shared/visual-mode-catalog.ts`.
//! Product contract: modes are playable instruments. Backend technique is private.

#![allow(dead_code)] // Catalog fields are consumed as ModeDirector grows.

/// Highest valid control-bus mode index (inclusive).
pub const MAX_VISUAL_MODE_INDEX: i32 = 48;

/// Number of modes on the bus (ids 0..=MAX).
pub const VISUAL_MODE_COUNT: usize = (MAX_VISUAL_MODE_INDEX as usize) + 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModeCategory {
    FieldMotion,
    StructuredSpace,
    ContinuousSpace,
    DiscreteStructure,
    AbstractCharacter,
    Figure,
}

/// How optional overlay layers combine with the mode-owned look.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OverlayPolicy {
    Blend,
    Underlay,
    Exclusive,
}

/// Private backend flags for ModeDirector composition.
///
/// Flag mapping (PR11 / #245):
/// - `figure` — catalog Figure path (legacyIndex 24): MODEL_CATALOG + `figureModel`
///   controls. Disposition is typically `mesh-primary`.
/// - `mesh` — DSL / pack mesh layer via CompiledModeWire `layers[{kind:mesh}]`
///   resolved against epoch `assetBase` (may also reference catalog ids).
/// - `field` / `fullscreen` / `accent` — other composition backends.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ModeBackends {
    pub field: bool,
    pub mesh: bool,
    pub fullscreen: bool,
    pub accent: bool,
    pub figure: bool,
}

/// Semantic destinations for shared knobs / audio (identity in PR1).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RoutingAxis {
    Intensity,
    Depth,
    Feedback,
    Speed,
    Palette,
    Bass,
    Mid,
    High,
    Beat,
    Pulse,
    Energy,
    Detail,
    ZoomSpan,
    TrailEcho,
    OrbitRate,
    ZoomPulse,
    PaletteDrift,
    EdgeSpark,
    JumpSeed,
    StructureScale,
    EdgeFill,
    SpinRate,
    Unfold,
    Off,
}

/// How global performance knobs and audio bands map into instrument axes.
#[derive(Clone, Copy, Debug)]
pub struct ModeRouting {
    pub intensity: RoutingAxis,
    pub depth: RoutingAxis,
    pub feedback: RoutingAxis,
    pub speed: RoutingAxis,
    pub palette: RoutingAxis,
    pub bass: RoutingAxis,
    pub mid: RoutingAxis,
    pub high: RoutingAxis,
    pub beat: RoutingAxis,
    pub pulse: RoutingAxis,
    pub energy: RoutingAxis,
}

pub const IDENTITY_ROUTING: ModeRouting = ModeRouting {
    intensity: RoutingAxis::Intensity,
    depth: RoutingAxis::Depth,
    feedback: RoutingAxis::Feedback,
    speed: RoutingAxis::Speed,
    palette: RoutingAxis::Palette,
    bass: RoutingAxis::Bass,
    mid: RoutingAxis::Mid,
    high: RoutingAxis::High,
    beat: RoutingAxis::Beat,
    pulse: RoutingAxis::Pulse,
    energy: RoutingAxis::Energy,
};

/// Resolved instrument description for one deck mode.
#[derive(Clone, Copy, Debug)]
pub struct ModeSpec {
    pub id: i32,
    pub mode: VisualMode,
    pub category: ModeCategory,
    pub character: &'static str,
    pub backends: ModeBackends,
    /// When true with a ready backend (figure/mesh-primary/fullscreen), ModeDirector
    /// zeros legacy field weight. Placeholder modes may still keep weight 1 until
    /// their replacement backends ship.
    pub suppress_legacy_field: bool,
    pub overlay_policy: OverlayPolicy,
    pub routing: ModeRouting,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VisualMode {
    Beams,
    Tunnel,
    Burst,
    Mirror,
    Wash,
    Strobe,
    Swarm,
    Orbit,
    Pulse,
    Spiral,
    Ripple,
    Shatter,
    Flux,
    Lattice,
    Drift,
    Storm,
    Echo,
    Vortex,
    Fracture,
    Nebula,
    Prism,
    Scanner,
    Comet,
    Bloom,
    /// Mesh layer: binds to a glTF entry in `model_layer::MODEL_CATALOG`.
    Figure,
    Hypercube,
    CalabiYau,
    Quasicrystal,
    PenroseTiling,
    SierpinskiTriangle,
    TetrahedralMatrix,
    BorromeanRings,
    Torus,
    PermutationGroups,
    SymmetryGroups,
    LieAlgebras,
    LatticeTheory,
    GraphTheory,
    DesignTheory,
    MandelbrotSet,
    JuliaSets,
    LorenzAttractor,
    Functors,
    ModularArithmetic,
    PAdicNumbers,
    VectorSpaces,
    Eigenvectors,
    BooleanLattices,
    Forcing,
}

impl VisualMode {
    pub fn from_control(value: f32) -> Self {
        match value.round() as i32 {
            1 => Self::Tunnel,
            2 => Self::Burst,
            3 => Self::Mirror,
            4 => Self::Wash,
            5 => Self::Strobe,
            6 => Self::Swarm,
            7 => Self::Orbit,
            8 => Self::Pulse,
            9 => Self::Spiral,
            10 => Self::Ripple,
            11 => Self::Shatter,
            12 => Self::Flux,
            13 => Self::Lattice,
            14 => Self::Drift,
            15 => Self::Storm,
            16 => Self::Echo,
            17 => Self::Vortex,
            18 => Self::Fracture,
            19 => Self::Nebula,
            20 => Self::Prism,
            21 => Self::Scanner,
            22 => Self::Comet,
            23 => Self::Bloom,
            24 => Self::Figure,
            25 => Self::Hypercube,
            26 => Self::CalabiYau,
            27 => Self::Quasicrystal,
            28 => Self::PenroseTiling,
            29 => Self::SierpinskiTriangle,
            30 => Self::TetrahedralMatrix,
            31 => Self::BorromeanRings,
            32 => Self::Torus,
            33 => Self::PermutationGroups,
            34 => Self::SymmetryGroups,
            35 => Self::LieAlgebras,
            36 => Self::LatticeTheory,
            37 => Self::GraphTheory,
            38 => Self::DesignTheory,
            39 => Self::MandelbrotSet,
            40 => Self::JuliaSets,
            41 => Self::LorenzAttractor,
            42 => Self::Functors,
            43 => Self::ModularArithmetic,
            44 => Self::PAdicNumbers,
            45 => Self::VectorSpaces,
            46 => Self::Eigenvectors,
            47 => Self::BooleanLattices,
            48 => Self::Forcing,
            _ => Self::Beams,
        }
    }

    /// Integer sent on the control bus / matched by model catalog entries.
    pub fn as_control(self) -> i32 {
        match self {
            Self::Beams => 0,
            Self::Tunnel => 1,
            Self::Burst => 2,
            Self::Mirror => 3,
            Self::Wash => 4,
            Self::Strobe => 5,
            Self::Swarm => 6,
            Self::Orbit => 7,
            Self::Pulse => 8,
            Self::Spiral => 9,
            Self::Ripple => 10,
            Self::Shatter => 11,
            Self::Flux => 12,
            Self::Lattice => 13,
            Self::Drift => 14,
            Self::Storm => 15,
            Self::Echo => 16,
            Self::Vortex => 17,
            Self::Fracture => 18,
            Self::Nebula => 19,
            Self::Prism => 20,
            Self::Scanner => 21,
            Self::Comet => 22,
            Self::Bloom => 23,
            Self::Figure => 24,
            Self::Hypercube => 25,
            Self::CalabiYau => 26,
            Self::Quasicrystal => 27,
            Self::PenroseTiling => 28,
            Self::SierpinskiTriangle => 29,
            Self::TetrahedralMatrix => 30,
            Self::BorromeanRings => 31,
            Self::Torus => 32,
            Self::PermutationGroups => 33,
            Self::SymmetryGroups => 34,
            Self::LieAlgebras => 35,
            Self::LatticeTheory => 36,
            Self::GraphTheory => 37,
            Self::DesignTheory => 38,
            Self::MandelbrotSet => 39,
            Self::JuliaSets => 40,
            Self::LorenzAttractor => 41,
            Self::Functors => 42,
            Self::ModularArithmetic => 43,
            Self::PAdicNumbers => 44,
            Self::VectorSpaces => 45,
            Self::Eigenvectors => 46,
            Self::BooleanLattices => 47,
            Self::Forcing => 48,
        }
    }

    pub fn label(self) -> &'static str {
        LABEL_BY_ID[self.as_control() as usize]
    }

}

const LABEL_BY_ID: [&str; VISUAL_MODE_COUNT] = [
    "Beams",
    "Tunnel",
    "Burst",
    "Mirror",
    "Wash",
    "Strobe",
    "Swarm",
    "Orbit",
    "Pulse",
    "Spiral",
    "Ripple",
    "Shatter",
    "Flux",
    "Lattice",
    "Drift",
    "Storm",
    "Echo",
    "Vortex",
    "Fracture",
    "Nebula",
    "Prism",
    "Scanner",
    "Comet",
    "Bloom",
    "Figure",
    "Hypercube",
    "CalabiYau",
    "Quasicrystal",
    "PenroseTiling",
    "SierpinskiTriangle",
    "TetrahedralMatrix",
    "BorromeanRings",
    "Torus",
    "PermutationGroups",
    "SymmetryGroups",
    "LieAlgebras",
    "LatticeTheory",
    "GraphTheory",
    "DesignTheory",
    "MandelbrotSet",
    "JuliaSets",
    "LorenzAttractor",
    "Functors",
    "ModularArithmetic",
    "PAdicNumbers",
    "VectorSpaces",
    "Eigenvectors",
    "BooleanLattices",
    "Forcing",
];

fn backends(field: bool, mesh: bool, fullscreen: bool, accent: bool, figure: bool) -> ModeBackends {
    ModeBackends {
        field,
        mesh,
        fullscreen,
        accent,
        figure,
    }
}

fn spec(
    mode: VisualMode,
    category: ModeCategory,
    character: &'static str,
    backends: ModeBackends,
    suppress_legacy_field: bool,
    overlay_policy: OverlayPolicy,
) -> ModeSpec {
    ModeSpec {
        id: mode.as_control(),
        mode,
        category,
        character,
        backends,
        suppress_legacy_field,
        overlay_policy,
        routing: IDENTITY_ROUTING,
    }
}

/// Resolve the instrument description for a deck mode.
pub fn mode_spec(mode: VisualMode) -> ModeSpec {
    match mode {
        VisualMode::Beams => spec(
            mode,
            ModeCategory::FieldMotion,
            "Radial sticks—core pulse and spin field.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Tunnel => spec(
            mode,
            ModeCategory::FieldMotion,
            "Perspective corridor—depth as the performance axis.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Burst => spec(
            mode,
            ModeCategory::FieldMotion,
            "Explosive radial hits—beat as the author.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Mirror => spec(
            mode,
            ModeCategory::FieldMotion,
            "Bilateral symmetry—left/right as a gesture.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Wash => spec(
            mode,
            ModeCategory::FieldMotion,
            "Soft full-frame veil—trails and atmosphere.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Strobe => spec(
            mode,
            ModeCategory::FieldMotion,
            "Gated flashes—transient-led, not sustained wash.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Swarm => spec(
            mode,
            ModeCategory::FieldMotion,
            "Many-body drift—organic scatter on the field.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Orbit => spec(
            mode,
            ModeCategory::FieldMotion,
            "Circular paths—gravity well of the deck.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Pulse => spec(
            mode,
            ModeCategory::FieldMotion,
            "Breathing scale—kick and intensity as pump.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Spiral => spec(
            mode,
            ModeCategory::FieldMotion,
            "Arm winding—fractional twist over time.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Ripple => spec(
            mode,
            ModeCategory::FieldMotion,
            "Concentric waves—bass as radius.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Shatter => spec(
            mode,
            ModeCategory::FieldMotion,
            "High-band shards—cracks on impact.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Flux => spec(
            mode,
            ModeCategory::FieldMotion,
            "Fluid shear—mid-band flow across the frame.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Lattice => spec(
            mode,
            ModeCategory::FieldMotion,
            "Snapped grid—order with beat accents.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Drift => spec(
            mode,
            ModeCategory::FieldMotion,
            "Slow lateral float—space between drops.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Storm => spec(
            mode,
            ModeCategory::FieldMotion,
            "Squall front—rain curtains and lightning on hits.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Echo => spec(
            mode,
            ModeCategory::FieldMotion,
            "Trail-forward afterimages—feedback owns the ghost.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Vortex => spec(
            mode,
            ModeCategory::FieldMotion,
            "Inward pull—spin collapses to center.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Fracture => spec(
            mode,
            ModeCategory::FieldMotion,
            "Broken planes—angular splits on hits.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Nebula => spec(
            mode,
            ModeCategory::FieldMotion,
            "Soft cloud mass—bloom and drift.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Prism => spec(
            mode,
            ModeCategory::FieldMotion,
            "Hue-split facets—spectrum as structure.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Scanner => spec(
            mode,
            ModeCategory::FieldMotion,
            "Sweeping bars—scanline time as motion.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Comet => spec(
            mode,
            ModeCategory::FieldMotion,
            "Long-tail arcs—speed and trails as length.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Bloom => spec(
            mode,
            ModeCategory::FieldMotion,
            "Soft radial glow—mid and feedback as body.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Figure => spec(
            mode,
            ModeCategory::Figure,
            "Mesh catalog figure—body as the deck instrument.",
            backends(false, false, false, true, true),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::Hypercube => spec(
            mode,
            ModeCategory::StructuredSpace,
            "Projected higher-dimensional frame—spin and unfold as performance.",
            backends(true, true, false, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::CalabiYau => spec(
            mode,
            ModeCategory::ContinuousSpace,
            "Complex manifold character—organic fold, not soft drift wallpaper.",
            backends(true, false, true, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::Quasicrystal => spec(
            mode,
            ModeCategory::ContinuousSpace,
            "Aperiodic order—interference folds with long-range pattern.",
            backends(true, false, true, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::PenroseTiling => spec(
            mode,
            ModeCategory::ContinuousSpace,
            "Non-repeating tile field—density and rotation as craft.",
            backends(true, false, true, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::SierpinskiTriangle => spec(
            mode,
            ModeCategory::StructuredSpace,
            "Recursive triangle depth—detail as the playable axis.",
            backends(true, true, false, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::TetrahedralMatrix => spec(
            mode,
            ModeCategory::StructuredSpace,
            "Tetrahedral lattice—edge glow and lattice scale.",
            backends(true, true, false, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::BorromeanRings => spec(
            mode,
            ModeCategory::StructuredSpace,
            "Linked rings—unlink-impossible silhouette as identity.",
            backends(true, true, false, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::Torus => spec(
            mode,
            ModeCategory::StructuredSpace,
            "Doughnut topology—major/minor radius and spin.",
            backends(true, true, false, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::PermutationGroups => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Discrete reordering—slots permute on musical events.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::SymmetryGroups => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Kaleidoscopic order—symmetry count as the gesture.",
            backends(true, false, true, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::LieAlgebras => spec(
            mode,
            ModeCategory::AbstractCharacter,
            "Continuous symmetry flow—streamlines and adjoint drift.",
            backends(true, false, true, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::LatticeTheory => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Ordered layers—meet/join feel in a layered poset field.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::GraphTheory => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Nodes and edges—connectivity flashes with the high band.",
            backends(true, true, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::DesignTheory => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Balanced blocks—set partitions as visual rhythm.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::MandelbrotSet => spec(
            mode,
            ModeCategory::ContinuousSpace,
            "Iterated complex space—detail and zoom as performance, not a poster.",
            backends(false, false, true, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::JuliaSets => spec(
            mode,
            ModeCategory::ContinuousSpace,
            "Julia seed orbit—c as a living performance parameter.",
            backends(false, false, true, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::LorenzAttractor => spec(
            mode,
            ModeCategory::ContinuousSpace,
            "Chaotic ribbon—integration rate and trail as craft.",
            backends(true, false, true, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::Functors => spec(
            mode,
            ModeCategory::AbstractCharacter,
            "Structure-preserving map—two spaces linked by a living arrow.",
            backends(true, false, true, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::ModularArithmetic => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Clock arithmetic—modular jumps on the circle.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::PAdicNumbers => spec(
            mode,
            ModeCategory::AbstractCharacter,
            "Hierarchical nested disks—ultrametric depth as zoom.",
            backends(true, false, true, true, false),
            true,
            OverlayPolicy::Underlay,
        ),
        VisualMode::VectorSpaces => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Basis and span—shear and scale the frame axes.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Eigenvectors => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Preferred axes—stretch along living eigenvectors.",
            backends(true, false, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::BooleanLattices => spec(
            mode,
            ModeCategory::DiscreteStructure,
            "Subset lattice—hypercube faces as inclusion order.",
            backends(true, true, false, true, false),
            false,
            OverlayPolicy::Blend,
        ),
        VisualMode::Forcing => spec(
            mode,
            ModeCategory::AbstractCharacter,
            "Expanding condition tree—partial order growth as drama.",
            backends(true, false, true, true, false),
            false,
            OverlayPolicy::Blend,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_roundtrip_all_ids() {
        for id in 0..=MAX_VISUAL_MODE_INDEX {
            let mode = VisualMode::from_control(id as f32);
            assert_eq!(mode.as_control(), id, "id {id}");
            let s = mode_spec(mode);
            assert_eq!(s.id, id);
            assert_eq!(s.mode, mode);
            assert!(!s.character.is_empty());
        }
    }

    #[test]
    fn labels_match_control_indices() {
        assert_eq!(LABEL_BY_ID[0], "Beams");
        assert_eq!(LABEL_BY_ID[24], "Figure");
        assert_eq!(LABEL_BY_ID[25], "Hypercube");
        assert_eq!(LABEL_BY_ID[39], "MandelbrotSet");
        assert_eq!(LABEL_BY_ID[48], "Forcing");
        assert_eq!(LABEL_BY_ID.len(), VISUAL_MODE_COUNT);
    }

    #[test]
    fn figure_suppresses_legacy_field_intent() {
        let s = mode_spec(VisualMode::Figure);
        assert!(s.suppress_legacy_field);
        assert!(s.backends.figure);
        assert!(!s.backends.field);
    }

}
