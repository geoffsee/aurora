/**
 * Stable WebXR formation automation order.
 *
 * Append new entries; never reorder or remove existing entries. DAW sessions,
 * MIDI mappings, presets, and automation lanes persist these numeric indices.
 */
export const WEBXR_SPATIAL_FORMATIONS = [
  'beams',
  'tunnel',
  'burst',
  'mirror',
  'atmosphere',
  'strobe',
  'swarm',
  'orbit',
  'pulse',
  'spiral',
  'ripple',
  'shards',
  'flux',
  'lattice',
  'rain',
  'echo',
  'vortex',
  'prism',
  'scanner',
  'comet',
  'bloom',
  'sculpture',
  'polytope',
  'manifold',
  'tiling',
  'fractal',
  'linked-rings',
  'graph',
  'flow-field',
  'hierarchy',
  'clock',
  'point-cloud',
  'flora',
] as const;

export type WebXrSpatialFormationId = (typeof WEBXR_SPATIAL_FORMATIONS)[number];

export const WEBXR_SPATIAL_FORMATION_LABELS: Record<WebXrSpatialFormationId, string> = {
  beams: 'Beams',
  tunnel: 'Tunnel',
  burst: 'Burst',
  mirror: 'Mirror',
  atmosphere: 'Atmosphere',
  strobe: 'Strobe',
  swarm: 'Swarm',
  orbit: 'Orbit',
  pulse: 'Pulse',
  spiral: 'Spiral',
  ripple: 'Ripple',
  shards: 'Shards',
  flux: 'Flux',
  lattice: 'Lattice',
  rain: 'Rain',
  echo: 'Echo',
  vortex: 'Vortex',
  prism: 'Prism',
  scanner: 'Scanner',
  comet: 'Comet',
  bloom: 'Bloom',
  sculpture: 'Sculpture',
  polytope: 'Polytope',
  manifold: 'Manifold',
  tiling: 'Tiling',
  fractal: 'Fractal',
  'linked-rings': 'Linked Rings',
  graph: 'Graph',
  'flow-field': 'Flow Field',
  hierarchy: 'Hierarchy',
  clock: 'Clock',
  'point-cloud': 'Point Cloud',
  flora: 'Flora',
};

export const MAX_WEBXR_SPATIAL_FORMATION_INDEX = WEBXR_SPATIAL_FORMATIONS.length - 1;

export function webXrSpatialFormationByIndex(index: number): WebXrSpatialFormationId {
  const safeIndex = Number.isFinite(index)
    ? Math.max(0, Math.min(MAX_WEBXR_SPATIAL_FORMATION_INDEX, Math.round(index)))
    : 0;
  return WEBXR_SPATIAL_FORMATIONS[safeIndex]!;
}
