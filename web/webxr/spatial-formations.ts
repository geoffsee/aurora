import { visualModeById } from '../../shared/visual-mode-catalog.ts';
import {
  WEBXR_SPATIAL_FORMATIONS,
  type WebXrSpatialFormationId,
} from '../../shared/webxr-spatial-contract.ts';

/** Native spatial instruments. These are compositions, not shader/package identities. */
export const SPATIAL_FORMATIONS = WEBXR_SPATIAL_FORMATIONS;

export type SpatialFormationId = WebXrSpatialFormationId;

export type SpatialFormationVisualProfile = {
  particles: number;
  spectrum: number;
  rings: number;
  shells: number;
  shellWireframe: boolean;
};

const profile = (
  particles: number,
  spectrum: number,
  rings: number,
  shells: number,
): SpatialFormationVisualProfile => ({
  particles,
  spectrum,
  rings,
  shells,
  shellWireframe: false,
});

/**
 * A mode only enables the visual layers that communicate its idea. In particular,
 * structural wireframes are disabled: the WebXR scene should read as designed space,
 * not a pile of debug lines.
 */
export const SPATIAL_FORMATION_PROFILES: Record<SpatialFormationId, SpatialFormationVisualProfile> =
  {
    beams: profile(0.5, 0.12, 0.08, 0),
    tunnel: profile(0.58, 0, 0.16, 0),
    burst: profile(0.72, 0.04, 0, 0),
    mirror: profile(0.48, 0.42, 0, 0.04),
    atmosphere: profile(1, 0, 0, 0.07),
    strobe: profile(0.34, 0.18, 0, 0),
    swarm: profile(1, 0.04, 0, 0),
    orbit: profile(0.5, 0.06, 0.24, 0.05),
    pulse: profile(0.5, 0.08, 0.18, 0),
    spiral: profile(0.74, 0.08, 0, 0),
    ripple: profile(0.3, 0.56, 0.18, 0),
    shards: profile(0.62, 0.12, 0, 0),
    flux: profile(0.58, 0.62, 0, 0),
    lattice: profile(0.38, 0.4, 0, 0.08),
    rain: profile(0.82, 0.14, 0, 0),
    echo: profile(0.55, 0.18, 0.04, 0),
    vortex: profile(0.72, 0.06, 0.08, 0),
    prism: profile(0.46, 0.42, 0, 0.08),
    scanner: profile(0.26, 0.82, 0, 0.04),
    comet: profile(0.72, 0.08, 0, 0.04),
    bloom: profile(0.48, 0.06, 0.12, 0.08),
    sculpture: profile(0.2, 0.04, 0, 0.38),
    polytope: profile(0.28, 0.16, 0, 0.3),
    manifold: profile(0.5, 0.08, 0.06, 0.2),
    tiling: profile(0.34, 0.44, 0, 0.1),
    fractal: profile(0.68, 0.08, 0, 0.12),
    'linked-rings': profile(0.28, 0.04, 0.5, 0.1),
    graph: profile(0.34, 0.42, 0, 0.12),
    'flow-field': profile(0.76, 0.16, 0, 0),
    hierarchy: profile(0.38, 0.32, 0, 0.2),
    clock: profile(0.3, 0.12, 0.34, 0.08),
    'point-cloud': profile(1, 0.04, 0, 0),
    flora: profile(0.58, 0.14, 0, 0.2),
  };

/** Explicit coverage for every stable legacy control-bus mode (ids 0..48). */
export const LEGACY_SPATIAL_FORMATIONS: readonly SpatialFormationId[] = [
  'beams', // Beams
  'tunnel', // Tunnel
  'burst', // Burst
  'mirror', // Mirror
  'atmosphere', // Wash
  'strobe', // Strobe
  'swarm', // Swarm
  'orbit', // Orbit
  'pulse', // Pulse
  'spiral', // Spiral
  'ripple', // Ripple
  'shards', // Shatter
  'flux', // Flux
  'lattice', // Lattice
  'atmosphere', // Drift
  'rain', // Storm
  'echo', // Echo
  'vortex', // Vortex
  'shards', // Fracture
  'atmosphere', // Nebula
  'prism', // Prism
  'scanner', // Scanner
  'comet', // Comet
  'bloom', // Bloom
  'sculpture', // Figure
  'polytope', // Hypercube
  'manifold', // CalabiYau
  'tiling', // Quasicrystal
  'tiling', // PenroseTiling
  'fractal', // SierpinskiTriangle
  'polytope', // TetrahedralMatrix
  'linked-rings', // BorromeanRings
  'linked-rings', // Torus
  'graph', // PermutationGroups
  'tiling', // SymmetryGroups
  'flow-field', // LieAlgebras
  'hierarchy', // LatticeTheory
  'graph', // GraphTheory
  'tiling', // DesignTheory
  'fractal', // MandelbrotSet
  'fractal', // JuliaSets
  'flow-field', // LorenzAttractor
  'graph', // Functors
  'clock', // ModularArithmetic
  'hierarchy', // PAdicNumbers
  'graph', // VectorSpaces
  'graph', // Eigenvectors
  'polytope', // BooleanLattices
  'hierarchy', // Forcing
];

const SEMANTIC_RULES: ReadonlyArray<{
  formation: SpatialFormationId;
  words: readonly string[];
}> = [
  // Specific compound package identities must win over generic words like point-cloud.
  { formation: 'tunnel', words: ['prismtunnel', 'warptunnel', 'tunnel', 'corridor'] },
  { formation: 'vortex', words: ['eventhorizon', 'recursivemaw', 'vortex', 'blackhole'] },
  {
    formation: 'rain',
    words: ['datarain', 'signalrain', 'waterfall', 'auroracurtain', 'storm', 'rain'],
  },
  {
    formation: 'flora',
    words: ['quantummycelium', 'lumencoral', 'polarispetal', 'mycelium', 'coral', 'petal'],
  },
  { formation: 'orbit', words: ['orbitalglobe', 'borromean', 'orbit', 'torus', 'globe'] },
  {
    formation: 'ripple',
    words: ['pointcloudcanyon', 'pointcloudwave', 'mercurylake', 'canyon', 'ripple', 'wave'],
  },
  { formation: 'hierarchy', words: ['chronofossil', 'padic', 'forcing', 'hierarchy', 'fossil'] },
  { formation: 'lattice', words: ['neutrinocathedral', 'lattice', 'cathedral', 'matrix'] },
  { formation: 'burst', words: ['supernova', 'burst'] },
  { formation: 'comet', words: ['solarflare', 'velvetlightning', 'comet', 'flare', 'lightning'] },
  { formation: 'scanner', words: ['scanlab', 'scanner', 'scanline', 'neonsignal'] },
  {
    formation: 'sculpture',
    words: [
      'bassmonolith',
      'gummywirebear',
      'walkingwolf',
      'spectralghost',
      'figure',
      'monolith',
      'bear',
      'wolf',
      'ghost',
    ],
  },
  {
    formation: 'tiling',
    words: ['topoline', 'quasicrystal', 'penrose', 'symmetry', 'tiling', 'design'],
  },
  { formation: 'fractal', words: ['sierpinski', 'mandelbrot', 'julia', 'fractal'] },
  {
    formation: 'manifold',
    words: ['untitledthreewebgpu', 'calabiyau', 'manifold', 'morphingmura', 'muramasa'],
  },
  { formation: 'polytope', words: ['hypercube', 'tetrahedral', 'booleanlattice'] },
  { formation: 'linked-rings', words: ['infinity', 'linkedring', 'ring'] },
  { formation: 'flow-field', words: ['liealgebra', 'lorenz', 'glassribbon', 'ribbon', 'idk'] },
  {
    formation: 'graph',
    words: ['starweb', 'functor', 'graphtheory', 'permutation', 'eigen', 'vectorspace'],
  },
  { formation: 'clock', words: ['modulararithmetic', 'clock'] },
  { formation: 'bloom', words: ['crystalbloom', 'inkbloom', 'bloom', 'auroracrown'] },
  { formation: 'prism', words: ['crystal', 'prism'] },
  { formation: 'mirror', words: ['liquidmirror', 'mirror'] },
  {
    formation: 'atmosphere',
    words: ['iridescentveil', 'mobiusweather', 'nebula', 'wash', 'drift', 'aurora'],
  },
  { formation: 'swarm', words: ['negativefauna', 'starlings', 'swarm', 'fauna'] },
  { formation: 'point-cloud', words: ['pointcloud', 'neutrino', 'starfield'] },
  { formation: 'beams', words: ['beams'] },
  { formation: 'strobe', words: ['strobe'] },
  { formation: 'pulse', words: ['pulse'] },
  { formation: 'spiral', words: ['spiral'] },
  { formation: 'shards', words: ['shatter', 'fracture'] },
  { formation: 'flux', words: ['flux'] },
  { formation: 'echo', words: ['echo'] },
];

function normalizedIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function semanticFormation(value: string): SpatialFormationId | null {
  const normalized = normalizedIdentity(value);
  if (!normalized) return null;
  for (const rule of SEMANTIC_RULES) {
    if (rule.words.some((word) => normalized.includes(word))) return rule.formation;
  }
  return null;
}

/** FNV-1a seed kept stable across browser sessions and JS engines. */
export function spatialModeSeed(mode: number, slug: string): number {
  const source = mode >= 0 ? `mode:${Math.floor(mode)}` : `slug:${slug}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

/** Map the selected control-panel identity onto a native spatial instrument. */
export function resolveSpatialFormation(mode: number, slug: string): SpatialFormationId {
  const fromSlug = semanticFormation(slug);
  if (fromSlug) return fromSlug;

  const entry = visualModeById(mode);
  if (entry) return LEGACY_SPATIAL_FORMATIONS[entry.id] ?? 'point-cloud';

  const seed = spatialModeSeed(mode, slug);
  return SPATIAL_FORMATIONS[
    Math.min(SPATIAL_FORMATIONS.length - 1, Math.floor(seed * SPATIAL_FORMATIONS.length))
  ]!;
}

export const SPATIAL_COMFORT_RADIUS = 0.55;

export type SpatialPose = {
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

export type SpatialFormationContext = {
  index: number;
  count: number;
  elapsed: number;
  seed: number;
  randomRadius: number;
  randomAngle: number;
  randomSpeed: number;
  randomPhase: number;
  level: number;
  energy: number;
  bass: number;
  mid: number;
  high: number;
  pulse: number;
  flash: number;
  intensity: number;
  depth: number;
  feedback: number;
  speed: number;
};

const TAU = Math.PI * 2;

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

function setScale(out: SpatialPose, x: number, y = x, z = x): void {
  out.scaleX = x;
  out.scaleY = y;
  out.scaleZ = z;
}

function keepParticleOutsideComfortRadius(pose: SpatialPose): void {
  const minimum = SPATIAL_COMFORT_RADIUS + 0.22;
  const distance = Math.hypot(pose.x, pose.y, pose.z);
  if (distance >= minimum) return;
  if (distance <= Number.EPSILON) {
    pose.x = minimum;
    return;
  }
  const scale = minimum / distance;
  pose.x *= scale;
  pose.y *= scale;
  pose.z *= scale;
}

function particleScale(context: SpatialFormationContext): number {
  return 0.46 + context.level * (1.45 + context.intensity * 0.55) + context.flash * 0.72;
}

function finishParticle(out: SpatialPose, scale: number, scaleY = scale, scaleZ = scale): void {
  setScale(out, scale, scaleY, scaleZ);
  keepParticleOutsideComfortRadius(out);
}

export function writeParticlePose(
  formation: SpatialFormationId,
  context: SpatialFormationContext,
  out: SpatialPose,
): void {
  const {
    index,
    elapsed,
    randomRadius,
    randomAngle,
    randomSpeed,
    randomPhase,
    level,
    energy,
    bass,
    mid,
    high,
    pulse,
    depth,
    feedback,
    speed,
  } = context;
  const scale = particleScale(context);

  if (formation === 'beams') {
    const spoke = index % 24;
    const angle = (spoke / 24) * TAU + elapsed * (0.08 + mid * 0.18) * speed;
    const radius = 1 + randomRadius * (3 + depth * 1.4);
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(angle) * radius * 0.72;
    out.z = -1.5 + (randomPhase - 0.5) * 3.2;
    out.rotationX = Math.PI * 0.5;
    out.rotationY = angle;
    out.rotationZ = angle;
    finishParticle(out, scale * 0.5, scale * (1.5 + bass), scale * 0.5);
    return;
  }

  if (formation === 'tunnel') {
    const angle = randomAngle + elapsed * (0.05 + mid * 0.16);
    const radius = 0.88 + randomRadius * (3.2 + depth * 1.2);
    const travel = positiveModulo(
      randomPhase * 16 + elapsed * (0.7 + energy * 6) * speed * randomSpeed,
      16,
    );
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(angle) * radius * 0.72;
    out.z = -12 + travel;
    out.rotationX = Math.PI * 0.5;
    out.rotationY = angle;
    out.rotationZ = randomAngle;
    finishParticle(out, scale * 0.72, scale * 1.7, scale * 0.72);
    return;
  }

  if (formation === 'burst') {
    const hit = 0.7 + pulse * 0.8 + energy * 0.45;
    const radius = (0.9 + randomRadius * (3.5 + depth)) * hit;
    const elevation = (randomPhase - 0.5) * Math.PI;
    out.x = Math.cos(randomAngle) * Math.cos(elevation) * radius;
    out.y = Math.sin(elevation) * radius;
    out.z = -2.2 + Math.sin(randomAngle) * Math.cos(elevation) * radius;
    out.rotationX = elevation;
    out.rotationY = -randomAngle;
    out.rotationZ = elapsed * 0.1;
    finishParticle(out, scale * 0.45, scale * (1.4 + pulse), scale * 0.45);
    return;
  }

  if (formation === 'mirror') {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2) % 32;
    const t = row / 31;
    const wing = Math.sin(t * Math.PI) * (1.1 + depth * 1.2);
    out.x = side * (0.9 + wing + randomRadius * 0.45);
    out.y = -1.55 + t * 3.2 + Math.sin(elapsed * 0.4 + randomAngle) * energy * 0.18;
    out.z = -2.8 + (randomPhase - 0.5) * (1.2 + feedback);
    out.rotationX = side * 0.12;
    out.rotationY = side * Math.PI * 0.35;
    out.rotationZ = side * (t - 0.5) * 0.6;
    finishParticle(out, scale * 0.8, scale * 1.25, scale * 0.38);
    return;
  }

  if (formation === 'atmosphere') {
    const radius = 1.1 + randomRadius * (4 + depth * 1.5);
    const azimuth = randomAngle + elapsed * (0.025 + feedback * 0.08) * randomSpeed;
    const elevation = (randomPhase - 0.5) * Math.PI;
    out.x = Math.cos(azimuth) * Math.cos(elevation) * radius;
    out.y = Math.sin(elevation) * radius * 0.68;
    out.z = Math.sin(azimuth) * Math.cos(elevation) * radius;
    out.rotationX = elevation;
    out.rotationY = azimuth;
    out.rotationZ = randomPhase * TAU;
    finishParticle(out, scale * (0.72 + randomSpeed * 0.2 + mid * 0.18));
    return;
  }

  if (formation === 'strobe') {
    const bank = index % 8;
    const angle = randomAngle + bank * (TAU / 8);
    const radius = 1 + randomRadius * (2.8 + depth);
    const gate = Math.floor(elapsed * (4 + speed * 5) + bank) % 2 === 0 ? 1 : 0.08;
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(angle) * radius;
    out.z = -2.4 + (randomPhase - 0.5) * 0.5;
    out.rotationX = 0;
    out.rotationY = 0;
    out.rotationZ = angle;
    finishParticle(out, scale * gate, scale * (0.9 + pulse) * gate, scale * gate);
    return;
  }

  if (formation === 'swarm') {
    const flock = index % 5;
    const centerAngle = elapsed * (0.12 + energy * 0.4) * speed + flock * (TAU / 5);
    const centerRadius = 1.7 + Math.sin(elapsed * 0.2 + flock) * 0.45;
    out.x = Math.cos(centerAngle) * centerRadius + Math.cos(randomAngle) * randomRadius * 1.15;
    out.y = Math.sin(centerAngle * 1.7) * 0.9 + (randomPhase - 0.5) * 1.4;
    out.z = Math.sin(centerAngle) * centerRadius + Math.sin(randomAngle) * randomRadius * 1.15;
    out.rotationX = centerAngle;
    out.rotationY = randomAngle;
    out.rotationZ = elapsed * randomSpeed * 0.2;
    finishParticle(out, scale * (0.55 + high * 0.35));
    return;
  }

  if (formation === 'orbit') {
    const radius = 1.2 + randomRadius * (3 + depth * 1.4);
    const angle = randomAngle + elapsed * (0.16 + energy * 0.8) * speed * randomSpeed;
    const inclination = (randomPhase - 0.5) * 1.35;
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(inclination) * Math.sin(angle) * radius;
    out.z = Math.cos(inclination) * Math.sin(angle) * radius;
    out.rotationX = inclination;
    out.rotationY = -angle;
    out.rotationZ = randomAngle;
    finishParticle(out, scale * (0.7 + high * 0.35));
    return;
  }

  if (formation === 'pulse') {
    const elevation = (randomPhase - 0.5) * Math.PI;
    const breathing = 1 + pulse * 0.38 + Math.sin(elapsed * (1.2 + speed) + randomAngle) * 0.08;
    const radius = (1.2 + randomRadius * (2.2 + depth)) * breathing;
    out.x = Math.cos(randomAngle) * Math.cos(elevation) * radius;
    out.y = Math.sin(elevation) * radius;
    out.z = Math.sin(randomAngle) * Math.cos(elevation) * radius;
    out.rotationX = elevation;
    out.rotationY = randomAngle;
    out.rotationZ = elapsed * 0.08;
    finishParticle(out, scale * (0.75 + pulse * 0.5));
    return;
  }

  if (formation === 'spiral') {
    const arm = index % 4;
    const radius = 0.85 + randomRadius * (3.8 + depth);
    const angle = arm * (TAU / 4) + radius * 1.8 + elapsed * (0.18 + feedback * 0.35) * speed;
    out.x = Math.cos(angle) * radius;
    out.y = (randomPhase - 0.5) * (0.45 + randomRadius * 0.35);
    out.z = Math.sin(angle) * radius;
    out.rotationX = randomPhase * TAU;
    out.rotationY = -angle;
    out.rotationZ = angle * 0.2;
    finishParticle(out, scale * 0.72, scale * 1.4, scale * 0.5);
    return;
  }

  if (formation === 'ripple') {
    const ring = index % 10;
    const phase = positiveModulo(randomPhase + elapsed * (0.04 + bass * 0.13) * speed, 1);
    const radius = 0.85 + phase * (3.8 + depth) + ring * 0.025;
    out.x = Math.cos(randomAngle) * radius;
    out.y = -1.45 + Math.sin(phase * Math.PI) * (0.12 + level * 0.65);
    out.z = Math.sin(randomAngle) * radius;
    out.rotationX = 0;
    out.rotationY = -randomAngle;
    out.rotationZ = Math.PI * 0.5;
    finishParticle(out, scale * 0.62, scale * 1.2, scale * 0.62);
    return;
  }

  if (formation === 'shards') {
    const side = index % 2 === 0 ? -1 : 1;
    const spread = 0.8 + randomRadius * (3 + depth * 1.2);
    out.x = side * spread;
    out.y = (randomPhase - 0.5) * 3.8 + high * Math.sin(randomAngle * 4);
    out.z = -2.6 + Math.sin(randomAngle) * (0.7 + feedback);
    out.rotationX = randomAngle;
    out.rotationY = randomPhase * TAU + elapsed * 0.08;
    out.rotationZ = side * (0.4 + randomRadius);
    finishParticle(out, scale * 0.5, scale * (1.2 + high), scale * 0.28);
    return;
  }

  if (formation === 'flux') {
    const t = index / Math.max(1, context.count - 1);
    const stream = index % 7;
    out.x = -4.5 + t * 9;
    out.y = Math.sin(t * TAU * 2 + elapsed * speed + stream) * (0.65 + mid * 1.2);
    out.z = -2.2 + (stream - 3) * 0.5 + Math.cos(t * TAU + elapsed * 0.3) * depth;
    out.rotationX = 0;
    out.rotationY = Math.cos(t * TAU * 2 + elapsed) * 0.35;
    out.rotationZ = Math.atan2(Math.cos(t * TAU * 2 + elapsed), 1);
    finishParticle(out, scale * 0.68, scale * 1.45, scale * 0.5);
    return;
  }

  if (formation === 'lattice') {
    const column = index % 12;
    const row = Math.floor(index / 12) % 8;
    const layer = Math.floor(index / 96) % 6;
    out.x = (column - 5.5) * (0.55 + depth * 0.08);
    out.y = (row - 3.5) * 0.52;
    out.z = -1.2 - layer * 0.72;
    out.rotationX = elapsed * 0.025 * (layer % 2 === 0 ? 1 : -1);
    out.rotationY = pulse * 0.12;
    out.rotationZ = (column + row) % 2 === 0 ? 0 : Math.PI * 0.25;
    finishParticle(out, scale * (0.52 + pulse * 0.18));
    return;
  }

  if (formation === 'rain') {
    const fall = positiveModulo(
      randomPhase + elapsed * (0.12 + energy * 0.45) * speed * randomSpeed,
      1,
    );
    out.x = (randomRadius - 0.5) * (7 + depth * 2);
    out.y = 3.2 - fall * 6.4;
    out.z = -0.9 - ((index * 0.61803398875) % 1) * 6;
    out.rotationX = 0;
    out.rotationY = 0;
    out.rotationZ = 0;
    finishParticle(out, scale * 0.35, scale * (1.8 + energy * 2.2), scale * 0.35);
    return;
  }

  if (formation === 'echo') {
    const copy = index % 8;
    const t = Math.floor(index / 8) / Math.max(1, Math.ceil(context.count / 8) - 1);
    const arc = t * Math.PI;
    out.x = Math.cos(arc) * (1.1 + copy * 0.42 + depth);
    out.y = Math.sin(arc) * (1.2 + level) - 0.6;
    out.z = -1.6 - copy * (0.34 + feedback * 0.22);
    out.rotationX = arc;
    out.rotationY = copy * 0.08;
    out.rotationZ = -arc;
    finishParticle(out, scale * Math.max(0.22, 1 - copy * 0.09));
    return;
  }

  if (formation === 'vortex') {
    const progress = positiveModulo(
      randomPhase + elapsed * (0.035 + energy * 0.14) * speed * randomSpeed,
      1,
    );
    const radius = 0.86 + (1 - progress) * (3.5 + depth * 1.35);
    const angle = randomAngle + progress * TAU * 3.2 + elapsed * (0.32 + feedback * 0.65) * speed;
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(angle) * radius * 0.7;
    out.z = -7.8 + progress * 8.8;
    out.rotationX = progress * Math.PI;
    out.rotationY = -angle;
    out.rotationZ = angle * 0.2;
    finishParticle(out, scale * (0.62 + (1 - progress) * 0.42));
    return;
  }

  if (formation === 'prism') {
    const plane = index % 3;
    const t = Math.floor(index / 3) / Math.max(1, Math.ceil(context.count / 3) - 1);
    const angle = plane * (TAU / 3) + elapsed * 0.035;
    const radius = 1 + t * (2.8 + depth);
    out.x = Math.cos(angle) * radius;
    out.y = -1.7 + t * 3.4;
    out.z = -2.6 + Math.sin(angle) * radius * 0.55;
    out.rotationX = angle * 0.25;
    out.rotationY = angle;
    out.rotationZ = t * Math.PI;
    finishParticle(out, scale * 0.65, scale * 1.25, scale * 0.3);
    return;
  }

  if (formation === 'scanner') {
    const column = index % 32;
    const row = Math.floor(index / 32) % 24;
    const sweep = positiveModulo(elapsed * (0.12 + speed * 0.25), 1);
    out.x = (column / 31 - 0.5) * (7 + depth * 2);
    out.y = (row / 23 - 0.5) * 4.2;
    out.z = -2.8 - Math.abs(column / 31 - sweep) * 1.4;
    out.rotationX = 0;
    out.rotationY = 0;
    out.rotationZ = 0;
    const proximity = Math.max(0.16, 1 - Math.abs(column / 31 - sweep) * 9);
    finishParticle(out, scale * proximity, scale * (0.7 + level), scale * 0.28);
    return;
  }

  if (formation === 'comet') {
    const tail = randomPhase;
    const head = elapsed * (0.18 + speed * 0.3);
    const angle = head - tail * (1.4 + feedback * 2.2) + randomAngle * 0.04;
    const radius = 2.2 + depth * 1.3;
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(angle * 0.65) * 1.5 + (randomRadius - 0.5) * 0.35;
    out.z = Math.sin(angle) * radius - 1.7;
    out.rotationX = angle;
    out.rotationY = -angle;
    out.rotationZ = angle * 0.5;
    const tailScale = scale * (0.3 + (1 - tail) * 0.9);
    finishParticle(out, tailScale * 0.45, tailScale * (1.7 + high), tailScale * 0.45);
    return;
  }

  if (formation === 'bloom') {
    const petal = index % 12;
    const t = Math.floor(index / 12) / Math.max(1, Math.ceil(context.count / 12) - 1);
    const angle = petal * (TAU / 12) + Math.sin(elapsed * 0.3) * 0.15;
    const radius = (0.8 + t * (2.4 + depth)) * (1 + pulse * 0.15);
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(angle) * radius;
    out.z = -2.4 + Math.sin(t * Math.PI) * (0.5 + mid);
    out.rotationX = t * Math.PI;
    out.rotationY = angle;
    out.rotationZ = angle;
    finishParticle(out, scale * (0.52 + (1 - t) * 0.35), scale, scale * 0.32);
    return;
  }

  if (formation === 'sculpture') {
    const band = index % 16;
    const t = Math.floor(index / 16) / Math.max(1, Math.ceil(context.count / 16) - 1);
    const angle = (band / 16) * TAU + elapsed * (0.03 + feedback * 0.05);
    const body = 0.65 + Math.sin(t * Math.PI) * (0.8 + depth * 0.5);
    out.x = Math.cos(angle) * body;
    out.y = -1.65 + t * 3.4;
    out.z = -2.8 + Math.sin(angle) * body;
    out.rotationX = angle;
    out.rotationY = t * Math.PI;
    out.rotationZ = randomPhase * TAU;
    finishParticle(out, scale * 0.58);
    return;
  }

  if (formation === 'polytope') {
    const corner = index % 16;
    const layer = Math.floor(index / 16) % 5;
    const spin = elapsed * (0.04 + mid * 0.08);
    const w = corner < 8 ? -1 : 1;
    const x = corner & 1 ? 1 : -1;
    const y = corner & 2 ? 1 : -1;
    const z = corner & 4 ? 1 : -1;
    const radius = 0.85 + layer * (0.25 + depth * 0.1) + w * pulse * 0.08;
    out.x = (x * Math.cos(spin) - z * Math.sin(spin)) * radius;
    out.y = y * radius;
    out.z = -2.8 + (x * Math.sin(spin) + z * Math.cos(spin)) * radius;
    out.rotationX = spin + corner;
    out.rotationY = -spin;
    out.rotationZ = w * 0.25;
    finishParticle(out, scale * 0.5);
    return;
  }

  if (formation === 'manifold') {
    const u = randomAngle;
    const v = randomPhase * TAU + elapsed * (0.025 + feedback * 0.06);
    const fold = 1.25 + Math.cos(v * 3 + u * 2) * (0.38 + depth * 0.25);
    out.x = Math.cos(u) * fold * (1.2 + depth * 0.3);
    out.y = Math.sin(v) * (1 + Math.cos(u * 2) * 0.35);
    out.z = -2.7 + Math.sin(u) * fold;
    out.rotationX = v;
    out.rotationY = u;
    out.rotationZ = u + v;
    finishParticle(out, scale * (0.48 + mid * 0.24));
    return;
  }

  if (formation === 'tiling') {
    const column = index % 17;
    const row = Math.floor(index / 17) % 11;
    const angle = (column * 2.399963 + row * 1.618034 + context.seed * TAU) % TAU;
    out.x = (column - 8) * (0.43 + depth * 0.035);
    out.y = (row - 5) * 0.43;
    out.z = -3 + Math.sin(column * 1.7 + row * 2.3) * 0.28;
    out.rotationX = 0;
    out.rotationY = Math.sin(elapsed * 0.08 + row) * 0.08;
    out.rotationZ = angle;
    finishParticle(out, scale * (0.48 + pulse * 0.12), scale * 0.78, scale * 0.16);
    return;
  }

  if (formation === 'fractal') {
    const branch = index % 9;
    const generation = Math.floor(index / 9) % 7;
    const angle = branch * (TAU / 9) + generation * 0.42 + elapsed * 0.025;
    const radius = 0.85 + generation * (0.48 + depth * 0.1);
    const child = 0.25 + randomRadius * 0.6;
    out.x = Math.cos(angle) * radius + Math.cos(randomAngle * 3) * child;
    out.y = -1.45 + generation * 0.45 + Math.sin(randomAngle * 2) * child;
    out.z = -2.8 + Math.sin(angle) * radius * 0.72;
    out.rotationX = generation * 0.3;
    out.rotationY = angle;
    out.rotationZ = randomAngle;
    finishParticle(out, scale * Math.max(0.3, 0.9 - generation * 0.08));
    return;
  }

  if (formation === 'linked-rings') {
    const ring = index % 3;
    const angle = randomAngle + elapsed * (0.05 + mid * 0.12) * (ring === 1 ? -1 : 1);
    const radius = 1.65 + depth * 0.45;
    const centerX = ring === 0 ? -0.65 : ring === 1 ? 0.65 : 0;
    const centerY = ring === 2 ? 0.75 : -0.25;
    out.x = centerX + Math.cos(angle) * radius;
    out.y = centerY + Math.sin(angle) * radius * (ring === 2 ? 0.45 : 1);
    out.z = Math.sin(angle) * radius * (ring === 0 ? 0.55 : ring === 1 ? -0.55 : 1);
    out.rotationX = angle;
    out.rotationY = ring * (Math.PI / 3);
    out.rotationZ = angle;
    finishParticle(out, scale * 0.62);
    return;
  }

  if (formation === 'graph') {
    const layer = index % 7;
    const slot = Math.floor(index / 7) % 15;
    const angle = (slot / 15) * TAU + layer * 0.37 + elapsed * 0.02;
    const radius = 0.7 + layer * (0.38 + depth * 0.06);
    out.x = Math.cos(angle) * radius;
    out.y = -1.55 + (slot % 5) * 0.72;
    out.z = -2.6 + Math.sin(angle) * radius * 0.55;
    out.rotationX = angle;
    out.rotationY = layer;
    out.rotationZ = pulse * 0.2;
    finishParticle(out, scale * (0.5 + high * 0.32));
    return;
  }

  if (formation === 'flow-field') {
    const t = randomPhase * TAU + elapsed * (0.08 + energy * 0.22) * speed * randomSpeed;
    const a = 2 + Math.floor(context.seed * 3);
    const b = 3 + Math.floor(context.seed * 4);
    out.x = Math.sin(a * t + randomAngle * 0.08) * (2.2 + depth);
    out.y = Math.sin(b * t) * 1.65;
    out.z = Math.cos((a + b) * 0.5 * t) * (2 + depth * 0.8);
    out.rotationX = t;
    out.rotationY = -t * 0.7;
    out.rotationZ = t * 0.4;
    finishParticle(out, scale * 0.58, scale * 1.4, scale * 0.42);
    return;
  }

  if (formation === 'hierarchy') {
    const generation = index % 6;
    const nodes = 2 ** generation;
    const slot = Math.floor(index / 6) % nodes;
    const width = 5.6 + depth * 1.4;
    out.x = ((slot + 0.5) / nodes - 0.5) * width;
    out.y = 1.8 - generation * 0.68;
    out.z = -2.2 - generation * 0.35;
    out.rotationX = generation * 0.12;
    out.rotationY = slot * 0.2;
    out.rotationZ = 0;
    finishParticle(out, scale * Math.max(0.34, 0.9 - generation * 0.09));
    return;
  }

  if (formation === 'clock') {
    const modulus = 7 + Math.floor(context.seed * 8);
    const slot = index % modulus;
    const orbit = Math.floor(index / modulus) % 5;
    const angle = (slot / modulus) * TAU + elapsed * (0.05 + pulse * 0.14) * (orbit % 2 ? -1 : 1);
    const radius = 1 + orbit * (0.5 + depth * 0.08);
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(angle) * radius;
    out.z = -2.4 - orbit * 0.12;
    out.rotationX = 0;
    out.rotationY = 0;
    out.rotationZ = angle;
    finishParticle(out, scale * (0.58 + pulse * 0.25));
    return;
  }

  if (formation === 'flora') {
    const plant = index % 9;
    const t = Math.floor(index / 9) / Math.max(1, Math.ceil(context.count / 9) - 1);
    const baseAngle = (plant / 9) * TAU;
    const sway = Math.sin(elapsed * (0.25 + speed * 0.2) + plant) * (0.12 + energy * 0.18);
    const height = t * (2.1 + depth);
    out.x = Math.cos(baseAngle) * (1.1 + plant * 0.23) + sway * height;
    out.y = -1.65 + height;
    out.z = Math.sin(baseAngle) * (1.1 + plant * 0.23);
    out.rotationX = sway;
    out.rotationY = baseAngle;
    out.rotationZ = t * TAU * 1.5;
    finishParticle(out, scale * (0.42 + t * 0.35), scale * (0.72 + t), scale * 0.38);
    return;
  }

  // Point cloud: a static celestial volume with twinkle, never a forward-moving corridor.
  const radius = 1.05 + randomRadius * (4.4 + depth * 1.4);
  const elevation = (randomPhase - 0.5) * Math.PI;
  const twinkle = 0.65 + Math.sin(elapsed * randomSpeed * speed + randomAngle) * 0.22 + high * 0.18;
  out.x = Math.cos(randomAngle) * Math.cos(elevation) * radius;
  out.y = Math.sin(elevation) * radius;
  out.z = Math.sin(randomAngle) * Math.cos(elevation) * radius;
  out.rotationX = randomAngle;
  out.rotationY = elevation;
  out.rotationZ = randomPhase * TAU;
  finishParticle(out, scale * twinkle * 0.62);
}

export function writeSpectrumPose(
  formation: SpatialFormationId,
  context: SpatialFormationContext,
  out: SpatialPose,
): void {
  const normalized = context.index / Math.max(1, context.count - 1);
  const height = 0.12 + context.level * 1.6 * context.intensity + context.pulse * 0.12;

  if (formation === 'mirror') {
    const pair = Math.floor(context.index / 2);
    const side = context.index % 2 === 0 ? -1 : 1;
    out.x = side * (1.05 + context.depth + context.level * 0.75);
    out.y = -1.55 + (pair / 31) * 3.1;
    out.z = -2.5;
    out.rotationX = 0;
    out.rotationY = side * 0.2;
    out.rotationZ = side * 0.12;
    setScale(out, 1, height, 1);
    return;
  }

  if (formation === 'ripple') {
    const angle = normalized * TAU;
    const radius = 1.1 + context.depth + context.level * 1.5;
    out.x = Math.cos(angle) * radius;
    out.y = -1.42 + context.level * 0.4;
    out.z = Math.sin(angle) * radius;
    out.rotationX = 0;
    out.rotationY = -angle;
    out.rotationZ = Math.PI * 0.5;
    setScale(out, 1, height * 0.85, 1);
    return;
  }

  if (formation === 'flux' || formation === 'flow-field') {
    const x = (normalized - 0.5) * (7 + context.depth * 2);
    const wave = Math.sin(normalized * TAU * 2 + context.elapsed * (0.5 + context.mid));
    out.x = x;
    out.y = wave * (0.65 + context.level * 1.1);
    out.z = -2.5 + Math.cos(normalized * TAU) * 0.55;
    out.rotationX = 0;
    out.rotationY = wave * 0.2;
    out.rotationZ = wave * 0.35;
    setScale(out, 1, height, 1);
    return;
  }

  if (formation === 'rain' || formation === 'scanner') {
    out.x = (normalized - 0.5) * (7 + context.depth * 2);
    out.y = -1.65 + height * 0.5;
    out.z = -3;
    out.rotationX = 0;
    out.rotationY = 0;
    out.rotationZ = 0;
    setScale(out, 1, height * (formation === 'scanner' ? 1.35 : 0.85), 1);
    return;
  }

  if (
    formation === 'lattice' ||
    formation === 'tiling' ||
    formation === 'polytope' ||
    formation === 'graph' ||
    formation === 'hierarchy'
  ) {
    const column = context.index % 16;
    const row = Math.floor(context.index / 16);
    out.x = (column - 7.5) * 0.42;
    out.y = (row - 1.5) * 0.72;
    out.z = -3.15 - context.level * 0.45;
    out.rotationX = 0;
    out.rotationY = 0;
    out.rotationZ = formation === 'tiling' ? (column + row) * 0.2 : 0;
    setScale(out, 1, height * 0.72, 1);
    return;
  }

  const angle = normalized * TAU + context.elapsed * (0.025 + context.mid * 0.08);
  const radius = 1.35 + context.depth * 0.65 + context.level * 0.5;
  out.x = Math.cos(angle) * radius;
  out.y = Math.sin(angle) * radius;
  out.z = formation === 'tunnel' ? -2.6 - context.depth : -2.35;
  out.rotationX = 0;
  out.rotationY = 0;
  out.rotationZ = -angle;
  setScale(out, 1, height, 1);
}

export function writeRingPose(
  formation: SpatialFormationId,
  context: SpatialFormationContext,
  out: SpatialPose,
): void {
  const normalized = context.index / Math.max(1, context.count);
  out.x = 0;
  out.y = 0;

  if (formation === 'tunnel' || formation === 'vortex') {
    const phase = positiveModulo(
      normalized + context.elapsed * (0.02 + context.feedback * 0.05),
      1,
    );
    const taper = formation === 'vortex' ? 0.85 + (1 - phase) * 2.5 : 1.1 + context.depth * 0.75;
    out.z = -8.2 + phase * 9.6;
    out.rotationX = formation === 'vortex' ? (phase - 0.5) * 0.4 : 0;
    out.rotationY = formation === 'vortex' ? phase * TAU : 0;
    out.rotationZ = context.index * 0.04;
    setScale(out, taper, taper * (formation === 'vortex' ? 0.72 : 1), taper);
    return;
  }

  if (formation === 'linked-rings') {
    const group = context.index % 3;
    out.x = group === 0 ? -0.62 : group === 1 ? 0.62 : 0;
    out.y = group === 2 ? 0.72 : -0.2;
    out.z = 0;
    out.rotationX = group === 0 ? Math.PI * 0.42 : group === 1 ? -Math.PI * 0.42 : Math.PI * 0.5;
    out.rotationY = context.elapsed * 0.035 + group * Math.PI * 0.33;
    out.rotationZ = group * Math.PI * 0.33;
    setScale(out, 1.35 + normalized * 0.42 + context.depth * 0.25);
    return;
  }

  if (formation === 'ripple') {
    const phase = positiveModulo(normalized + context.elapsed * (0.035 + context.bass * 0.08), 1);
    const radius = 0.9 + phase * (3.5 + context.depth);
    out.y = -1.46 + Math.sin(phase * Math.PI) * 0.08;
    out.z = 0;
    out.rotationX = Math.PI * 0.5;
    out.rotationY = 0;
    out.rotationZ = 0;
    setScale(out, radius);
    return;
  }

  out.z = formation === 'clock' || formation === 'bloom' ? -2.45 : 0;
  out.rotationX = formation === 'orbit' ? normalized * Math.PI : 0;
  out.rotationY = context.elapsed * 0.025 + context.index * 0.17;
  out.rotationZ = formation === 'orbit' ? context.index * 0.21 : 0;
  const radius = 1.05 + normalized * (2.5 + context.depth * 0.8) + context.pulse * 0.12;
  setScale(out, radius);
}

export function writeShellPose(
  formation: SpatialFormationId,
  context: SpatialFormationContext,
  out: SpatialPose,
): void {
  const normalized = context.index / Math.max(1, context.count - 1);

  if (formation === 'atmosphere') {
    out.x = Math.sin(context.index * 2.1 + context.seed) * 0.32;
    out.y = Math.cos(context.index * 1.7) * 0.22;
    out.z = Math.sin(context.index * 1.3) * 0.28;
    out.rotationX = context.elapsed * 0.012 + context.index * 0.37;
    out.rotationY = -context.elapsed * 0.016 + context.index * 0.29;
    out.rotationZ = context.index * 0.23;
    const radius = 1.25 + context.index * (0.3 + context.depth * 0.08);
    setScale(out, radius * 1.1, radius * 0.72, radius);
    return;
  }

  if (formation === 'sculpture' || formation === 'manifold' || formation === 'polytope') {
    out.x = 0;
    out.y = 0;
    out.z = -2.8;
    out.rotationX = context.elapsed * (0.02 + context.high * 0.05) + context.index * 0.31;
    out.rotationY = context.elapsed * (0.025 + context.feedback * 0.04) - context.index * 0.27;
    out.rotationZ = context.index * 0.19;
    const radius = 0.82 + normalized * (1.5 + context.depth * 0.5);
    setScale(out, radius * (1 + context.pulse * 0.04));
    return;
  }

  if (formation === 'tiling') {
    out.x = ((context.index % 4) - 1.5) * 1.5;
    out.y = (Math.floor(context.index / 4) - 1) * 1.35;
    out.z = -3.4;
    out.rotationX = 0;
    out.rotationY = context.elapsed * 0.015;
    out.rotationZ = context.index * 0.62;
    setScale(out, 0.7 + context.level * 0.2, 0.7, 0.18);
    return;
  }

  if (formation === 'fractal' || formation === 'hierarchy' || formation === 'flora') {
    const angle = context.index * 2.399963 + context.seed * TAU;
    const radius = 0.8 + normalized * (2.6 + context.depth);
    out.x = Math.cos(angle) * radius;
    out.y = formation === 'hierarchy' ? 1.55 - normalized * 3 : Math.sin(angle * 1.7) * 1.2;
    out.z = -2.8 + Math.sin(angle) * radius * 0.42;
    out.rotationX = angle;
    out.rotationY = context.elapsed * 0.02;
    out.rotationZ = normalized * TAU;
    setScale(out, 0.62 + (1 - normalized) * 0.42);
    return;
  }

  if (formation === 'lattice' || formation === 'prism' || formation === 'scanner') {
    out.x = ((context.index % 4) - 1.5) * 1.45;
    out.y = (Math.floor(context.index / 4) - 1) * 1.25;
    out.z = -3.25;
    out.rotationX = context.index * 0.12;
    out.rotationY = context.elapsed * 0.018;
    out.rotationZ = context.index * 0.2;
    setScale(out, 0.62, 0.86, 0.35);
    return;
  }

  out.x = 0;
  out.y = 0;
  out.z = -2.8;
  out.rotationX = context.index * 0.21;
  out.rotationY = context.elapsed * 0.02;
  out.rotationZ = context.index * 0.17;
  setScale(out, 0.85 + normalized * 1.35);
}

export function smoothSpatialWeight(current: number, target: number, dt: number): number {
  if (Math.abs(target - current) <= 0.001) return target;
  if (!(dt > 0)) return current;
  const alpha = 1 - 0.5 ** (Math.min(0.25, dt) / 0.05);
  const next = current + (target - current) * alpha;
  return Math.abs(target - next) <= 0.001 ? target : next;
}

export type SpatialParticleBudget = { deckA: number; deckB: number };

export function splitSpatialParticleBudget(
  budget: number,
  deckAWeight: number,
  deckBWeight: number,
  out: SpatialParticleBudget,
): void {
  const safeBudget = Math.max(0, Math.floor(budget));
  const a = Math.max(0, deckAWeight);
  const b = Math.max(0, deckBWeight);
  const total = a + b;
  if (total <= 0.001) {
    out.deckA = 0;
    out.deckB = 0;
    return;
  }
  out.deckA = Math.round((safeBudget * a) / total);
  out.deckB = safeBudget - out.deckA;
}
