import { expect, test } from 'vitest';
import { MAX_SHADER_INDEX, normalizeOutputRoute } from '../../shared/output-routing.ts';
import {
  MAX_VISUAL_MODE_INDEX,
  VISUAL_MODE_CATALOG,
  VISUAL_MODES,
  visualModeLabel,
} from '../../shared/visual-mode-catalog.ts';
import {
  VISUAL_MODES as CONTROLS_VISUAL_MODES,
  MAX_GPU_SHADER_INDEX,
  SHADER_OPTIONS,
} from '../../web/controls/lib/constants.ts';
import { PARAM_META } from '../../web/controls/lib/param-meta.ts';

test('deck mode metadata exposes the full mode range', () => {
  expect(VISUAL_MODES).toEqual([
    'Beams',
    'Tunnel',
    'Burst',
    'Mirror',
    'Wash',
    'Strobe',
    'Swarm',
    'Orbit',
    'Pulse',
    'Spiral',
    'Ripple',
    'Shatter',
    'Flux',
    'Lattice',
    'Drift',
    'Storm',
    'Echo',
    'Vortex',
    'Fracture',
    'Nebula',
    'Prism',
    'Scanner',
    'Comet',
    'Bloom',
    'Figure',
    'Hypercube',
    'CalabiYau',
    'Quasicrystal',
    'PenroseTiling',
    'SierpinskiTriangle',
    'TetrahedralMatrix',
    'BorromeanRings',
    'Torus',
    'PermutationGroups',
    'SymmetryGroups',
    'LieAlgebras',
    'LatticeTheory',
    'GraphTheory',
    'DesignTheory',
    'MandelbrotSet',
    'JuliaSets',
    'LorenzAttractor',
    'Functors',
    'ModularArithmetic',
    'PAdicNumbers',
    'VectorSpaces',
    'Eigenvectors',
    'BooleanLattices',
    'Forcing',
  ]);
  expect(MAX_VISUAL_MODE_INDEX).toBe(48);
  expect(VISUAL_MODE_CATALOG).toHaveLength(49);
  expect(PARAM_META.deckAMode.max).toBe(VISUAL_MODES.length - 1);
  expect(PARAM_META.deckBMode.max).toBe(VISUAL_MODES.length - 1);
  expect(PARAM_META.deckAMode.format(23)).toBe('Bloom');
  expect(PARAM_META.deckAMode.format(24)).toBe('Figure');
  expect(PARAM_META.deckAMode.format(25)).toBe('Hypercube');
  expect(PARAM_META.deckAMode.format(48)).toBe('Forcing');
  expect(PARAM_META.deckBMode.format(20)).toBe('Prism');
});

test('controls re-export the shared visual mode catalog', () => {
  expect(CONTROLS_VISUAL_MODES).toEqual(VISUAL_MODES);
});

test('visual mode catalog has stable ids and character briefs', () => {
  for (let i = 0; i < VISUAL_MODE_CATALOG.length; i++) {
    const entry = VISUAL_MODE_CATALOG[i]!;
    expect(entry.id).toBe(i);
    expect(entry.label).toBe(VISUAL_MODES[i]);
    expect(entry.character.length).toBeGreaterThan(8);
    expect(entry.backends.length).toBeGreaterThan(0);
    expect(entry.routing.intensity).toBeTruthy();
  }
  expect(visualModeLabel(39)).toBe('MandelbrotSet');
  expect(VISUAL_MODE_CATALOG[24]?.suppressLegacyField).toBe(true);
  expect(VISUAL_MODE_CATALOG[24]?.backends).toContain('figure');
  // Intent for deep instruments — ModeDirector still keeps field weight 1 until backends ship.
  expect(VISUAL_MODE_CATALOG[25]?.suppressLegacyField).toBe(true);
  expect(VISUAL_MODE_CATALOG[39]?.suppressLegacyField).toBe(true);
});

test('GPU shader metadata exposes the full shader range', () => {
  expect(SHADER_OPTIONS).toHaveLength(37);
  expect(SHADER_OPTIONS.slice(26)).toEqual([
    'Aurora Curtains',
    'Bass Monolith',
    'Prism Tunnel',
    'Data Rain',
    'Solar Flare',
    'Topo Lines',
    'Glass Ribbons',
    'Gummy Wire Bear',
    'Fierce Walking Wolf',
    'Spectral Ghost',
    'Aurora Crown',
  ]);
  expect(SHADER_OPTIONS[26]).toBe('Aurora Curtains');
  expect(SHADER_OPTIONS[36]).toBe('Aurora Crown');
  expect(MAX_GPU_SHADER_INDEX).toBe(SHADER_OPTIONS.length - 1);
  expect(MAX_SHADER_INDEX).toBe(SHADER_OPTIONS.length - 1);
  expect(normalizeOutputRoute({ id: 'left', activeShader: 99 })?.activeShader).toBe(
    MAX_GPU_SHADER_INDEX,
  );
});
