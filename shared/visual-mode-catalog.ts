/**
 * Visual mode catalog — single source of truth for deck mode IDs, labels,
 * character briefs, and (private) instrument routing hints.
 *
 * Keep in sync with `src/mode_catalog.rs` (`VisualMode`, `mode_spec`).
 * Controls and tests import labels from here; the renderer owns backends.
 *
 * Product contract: modes are playable instruments. Labels are identity
 * floors, not textbooks. Backend technique is never a UI concern.
 */

/** Stable control-bus index; do not reshuffle without a migration. */
export type VisualModeId = number;

export type ModeCategory =
  | 'field-motion'
  | 'structured-space'
  | 'continuous-space'
  | 'discrete-structure'
  | 'abstract-character'
  | 'figure';

/**
 * How optional overlay/effect layers (today: per-deck GPU shaders) combine
 * with the mode-owned look. Not shown in the operator UI as "CPU vs GPU".
 */
export type OverlayPolicy = 'blend' | 'underlay' | 'exclusive';

/**
 * Private backend tags for the ModeDirector. Never surface these as
 * primary product language.
 */
export type ModeBackend = 'field' | 'mesh' | 'fullscreen' | 'accent' | 'figure';

/**
 * Semantic destinations for shared performance knobs / audio bands.
 * PR1 maps every axis 1:1 through the director (identity routing).
 * Later PRs retarget these strings to real instrument axes.
 */
export type RoutingAxis =
  | 'intensity'
  | 'depth'
  | 'feedback'
  | 'speed'
  | 'palette'
  | 'bass'
  | 'mid'
  | 'high'
  | 'beat'
  | 'pulse'
  | 'energy'
  // Future instrument axes (catalog stubs; unused until Family deepen PRs)
  | 'detail'
  | 'zoom_span'
  | 'trail_echo'
  | 'orbit_rate'
  | 'zoom_pulse'
  | 'palette_drift'
  | 'edge_spark'
  | 'jump_seed'
  | 'structure_scale'
  | 'edge_fill'
  | 'spin_rate'
  | 'unfold'
  | 'off';

export type ModeRouting = {
  intensity: RoutingAxis;
  depth: RoutingAxis;
  feedback: RoutingAxis;
  speed: RoutingAxis;
  palette: RoutingAxis;
  bass: RoutingAxis;
  mid: RoutingAxis;
  high: RoutingAxis;
  beat: RoutingAxis;
  pulse: RoutingAxis;
  energy: RoutingAxis;
};

/** Identity routing: every source lands on itself (behavior-preserving). */
export const IDENTITY_ROUTING: ModeRouting = {
  intensity: 'intensity',
  depth: 'depth',
  feedback: 'feedback',
  speed: 'speed',
  palette: 'palette',
  bass: 'bass',
  mid: 'mid',
  high: 'high',
  beat: 'beat',
  pulse: 'pulse',
  energy: 'energy',
};

export type VisualModeEntry = {
  id: VisualModeId;
  label: string;
  category: ModeCategory;
  /** Artist-facing one-liner (help / future UI) — not a math abstract. */
  character: string;
  /** Private: which backend layers ModeDirector may enable. */
  backends: readonly ModeBackend[];
  /**
   * When true, future PRs may zero the legacy beam/tile field once a
   * replacement backend owns the look. PR1 always keeps legacy field weight 1.
   */
  suppressLegacyField: boolean;
  overlayPolicy: OverlayPolicy;
  routing: ModeRouting;
};

function entry(
  id: number,
  label: string,
  category: ModeCategory,
  character: string,
  backends: readonly ModeBackend[],
  opts: {
    suppressLegacyField?: boolean;
    overlayPolicy?: OverlayPolicy;
    routing?: ModeRouting;
  } = {},
): VisualModeEntry {
  return {
    id,
    label,
    category,
    character,
    backends,
    suppressLegacyField: opts.suppressLegacyField ?? false,
    overlayPolicy: opts.overlayPolicy ?? 'blend',
    routing: opts.routing ?? IDENTITY_ROUTING,
  };
}

/**
 * Order is the control-bus index. Length must stay 49 (ids 0–48).
 */
export const VISUAL_MODE_CATALOG: readonly VisualModeEntry[] = [
  // --- Family A: field motion ---
  entry(0, 'Beams', 'field-motion', 'Radial sticks—core pulse and spin field.', [
    'field',
    'accent',
  ]),
  entry(1, 'Tunnel', 'field-motion', 'Perspective corridor—depth as the performance axis.', [
    'field',
    'accent',
  ]),
  entry(2, 'Burst', 'field-motion', 'Explosive radial hits—beat as the author.', [
    'field',
    'accent',
  ]),
  entry(3, 'Mirror', 'field-motion', 'Bilateral symmetry—left/right as a gesture.', [
    'field',
    'accent',
  ]),
  entry(4, 'Wash', 'field-motion', 'Soft full-frame veil—trails and atmosphere.', [
    'field',
    'accent',
  ]),
  entry(5, 'Strobe', 'field-motion', 'Gated flashes—transient-led, not sustained wash.', [
    'field',
    'accent',
  ]),
  entry(6, 'Swarm', 'field-motion', 'Many-body drift—organic scatter on the field.', [
    'field',
    'accent',
  ]),
  entry(7, 'Orbit', 'field-motion', 'Circular paths—gravity well of the deck.', [
    'field',
    'accent',
  ]),
  entry(8, 'Pulse', 'field-motion', 'Breathing scale—kick and intensity as pump.', [
    'field',
    'accent',
  ]),
  entry(9, 'Spiral', 'field-motion', 'Arm winding—fractional twist over time.', [
    'field',
    'accent',
  ]),
  entry(10, 'Ripple', 'field-motion', 'Concentric waves—bass as radius.', ['field', 'accent']),
  entry(11, 'Shatter', 'field-motion', 'High-band shards—cracks on impact.', ['field', 'accent']),
  entry(12, 'Flux', 'field-motion', 'Fluid shear—mid-band flow across the frame.', [
    'field',
    'accent',
  ]),
  entry(13, 'Lattice', 'field-motion', 'Snapped grid—order with beat accents.', [
    'field',
    'accent',
  ]),
  entry(14, 'Drift', 'field-motion', 'Slow lateral float—space between drops.', [
    'field',
    'accent',
  ]),
  entry(15, 'Storm', 'field-motion', 'Squall front—rain curtains and lightning on hits.', [
    'field',
    'accent',
  ]),
  entry(16, 'Echo', 'field-motion', 'Trail-forward afterimages—feedback owns the ghost.', [
    'field',
    'accent',
  ]),
  entry(17, 'Vortex', 'field-motion', 'Inward pull—spin collapses to center.', ['field', 'accent']),
  entry(18, 'Fracture', 'field-motion', 'Broken planes—angular splits on hits.', [
    'field',
    'accent',
  ]),
  entry(19, 'Nebula', 'field-motion', 'Soft cloud mass—bloom and drift.', ['field', 'accent']),
  entry(20, 'Prism', 'field-motion', 'Hue-split facets—spectrum as structure.', [
    'field',
    'accent',
  ]),
  entry(21, 'Scanner', 'field-motion', 'Sweeping bars—scanline time as motion.', [
    'field',
    'accent',
  ]),
  entry(22, 'Comet', 'field-motion', 'Long-tail arcs—speed and trails as length.', [
    'field',
    'accent',
  ]),
  entry(23, 'Bloom', 'field-motion', 'Soft radial glow—mid and feedback as body.', [
    'field',
    'accent',
  ]),

  // --- Figure ---
  entry(
    24,
    'Figure',
    'figure',
    'Mesh catalog figure—body as the deck instrument.',
    ['figure', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),

  // --- Family B / C / D / E: named instruments (deepen in later PRs) ---
  // suppressLegacyField documents intent; ModeDirector keeps field weight 1 until backends ship.
  entry(
    25,
    'Hypercube',
    'structured-space',
    'Projected higher-dimensional frame—spin and unfold as performance.',
    ['mesh', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    26,
    'CalabiYau',
    'continuous-space',
    'Complex manifold character—organic fold, not soft drift wallpaper.',
    ['fullscreen', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    27,
    'Quasicrystal',
    'continuous-space',
    'Aperiodic order—interference folds with long-range pattern.',
    ['fullscreen', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    28,
    'PenroseTiling',
    'continuous-space',
    'Non-repeating tile field—density and rotation as craft.',
    ['fullscreen', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    29,
    'SierpinskiTriangle',
    'structured-space',
    'Recursive triangle depth—detail as the playable axis.',
    ['mesh', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    30,
    'TetrahedralMatrix',
    'structured-space',
    'Tetrahedral lattice—edge glow and lattice scale.',
    ['mesh', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    31,
    'BorromeanRings',
    'structured-space',
    'Linked rings—unlink-impossible silhouette as identity.',
    ['mesh', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    32,
    'Torus',
    'structured-space',
    'Doughnut topology—major/minor radius and spin.',
    ['mesh', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    33,
    'PermutationGroups',
    'discrete-structure',
    'Discrete reordering—slots permute on musical events.',
    ['field', 'accent'],
  ),
  entry(
    34,
    'SymmetryGroups',
    'discrete-structure',
    'Kaleidoscopic order—symmetry count as the gesture.',
    ['field', 'fullscreen', 'accent'],
  ),
  entry(
    35,
    'LieAlgebras',
    'abstract-character',
    'Continuous symmetry flow—streamlines and adjoint drift.',
    ['fullscreen', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    36,
    'LatticeTheory',
    'discrete-structure',
    'Ordered layers—meet/join feel in a layered poset field.',
    ['field', 'accent'],
  ),
  entry(
    37,
    'GraphTheory',
    'discrete-structure',
    'Nodes and edges—connectivity flashes with the high band.',
    ['field', 'mesh', 'accent'],
  ),
  entry(
    38,
    'DesignTheory',
    'discrete-structure',
    'Balanced blocks—set partitions as visual rhythm.',
    ['field', 'accent'],
  ),
  entry(
    39,
    'MandelbrotSet',
    'continuous-space',
    'Iterated complex space—detail and zoom as performance, not a poster.',
    ['fullscreen', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    40,
    'JuliaSets',
    'continuous-space',
    'Julia seed orbit—c as a living performance parameter.',
    ['fullscreen', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    41,
    'LorenzAttractor',
    'continuous-space',
    'Chaotic ribbon—integration rate and trail as craft.',
    ['fullscreen', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    42,
    'Functors',
    'abstract-character',
    'Structure-preserving map—two spaces linked by a living arrow.',
    ['field', 'fullscreen', 'accent'],
  ),
  entry(
    43,
    'ModularArithmetic',
    'discrete-structure',
    'Clock arithmetic—modular jumps on the circle.',
    ['field', 'accent'],
  ),
  entry(
    44,
    'PAdicNumbers',
    'abstract-character',
    'Hierarchical nested disks—ultrametric depth as zoom.',
    ['fullscreen', 'field', 'accent'],
    { suppressLegacyField: true, overlayPolicy: 'underlay' },
  ),
  entry(
    45,
    'VectorSpaces',
    'discrete-structure',
    'Basis and span—shear and scale the frame axes.',
    ['field', 'accent'],
  ),
  entry(
    46,
    'Eigenvectors',
    'discrete-structure',
    'Preferred axes—stretch along living eigenvectors.',
    ['field', 'accent'],
  ),
  entry(
    47,
    'BooleanLattices',
    'discrete-structure',
    'Subset lattice—hypercube faces as inclusion order.',
    ['mesh', 'field', 'accent'],
  ),
  entry(
    48,
    'Forcing',
    'abstract-character',
    'Expanding condition tree—partial order growth as drama.',
    ['field', 'fullscreen', 'accent'],
  ),
];

/** Ordered labels for deck mode pickers (index == control-bus id). */
export const VISUAL_MODES: readonly string[] = VISUAL_MODE_CATALOG.map((e) => e.label);

export const MAX_VISUAL_MODE_INDEX = VISUAL_MODE_CATALOG.length - 1;

export function visualModeById(id: number): VisualModeEntry | undefined {
  if (!Number.isFinite(id)) return undefined;
  const i = Math.round(id);
  return VISUAL_MODE_CATALOG[i];
}

export function visualModeLabel(id: number): string {
  return visualModeById(id)?.label ?? String(Math.round(id));
}
