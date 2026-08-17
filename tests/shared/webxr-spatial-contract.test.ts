import { describe, expect, test } from 'vitest';
import {
  MAX_WEBXR_SPATIAL_FORMATION_INDEX,
  WEBXR_SPATIAL_FORMATION_LABELS,
  WEBXR_SPATIAL_FORMATIONS,
  webXrSpatialFormationByIndex,
} from '../../shared/webxr-spatial-contract.ts';

describe('WebXR spatial automation contract', () => {
  test('keeps the persisted numeric formation order stable', () => {
    expect(WEBXR_SPATIAL_FORMATIONS).toMatchInlineSnapshot(`
      [
        "beams",
        "tunnel",
        "burst",
        "mirror",
        "atmosphere",
        "strobe",
        "swarm",
        "orbit",
        "pulse",
        "spiral",
        "ripple",
        "shards",
        "flux",
        "lattice",
        "rain",
        "echo",
        "vortex",
        "prism",
        "scanner",
        "comet",
        "bloom",
        "sculpture",
        "polytope",
        "manifold",
        "tiling",
        "fractal",
        "linked-rings",
        "graph",
        "flow-field",
        "hierarchy",
        "clock",
        "point-cloud",
        "flora",
      ]
    `);
    expect(MAX_WEBXR_SPATIAL_FORMATION_INDEX).toBe(WEBXR_SPATIAL_FORMATIONS.length - 1);
    expect(new Set(WEBXR_SPATIAL_FORMATIONS).size).toBe(WEBXR_SPATIAL_FORMATIONS.length);
  });

  test('clamps automation indices and exposes artist-facing labels', () => {
    expect(webXrSpatialFormationByIndex(-20)).toBe('beams');
    expect(webXrSpatialFormationByIndex(14)).toBe('rain');
    expect(webXrSpatialFormationByIndex(9_999)).toBe('flora');
    expect(WEBXR_SPATIAL_FORMATION_LABELS['flow-field']).toBe('Flow Field');
  });
});
