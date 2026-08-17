import { expect, test } from 'vitest';
import { migrateControlState } from '../../shared/control-state-schema.ts';
import { CONTROL_STATE_SCHEMA_VERSION } from '../../shared/osc-validation.ts';

const DEFAULT_EMA_ALPHAS = {
  energy: 0.12,
  bass: 0.08,
  mid: 0.15,
  high: 0.65,
  pulse: 0.85,
};
const DEFAULT_BAND_CURVES = {
  energy: 'linear',
  bass: 'linear',
  mid: 'linear',
  high: 'linear',
};

test('v1 state is upgraded through v2..v9 with activeShader=0, bandCurves, emaAlphas, morph, audioControlMode, paletteR/G/B, and outputs added', () => {
  const result = migrateControlState({
    schemaVersion: 1,
    crossfade: 0.5,
  }) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.activeShader).toBe(0);
  expect(result.bandCurves).toEqual(DEFAULT_BAND_CURVES);
  expect(result.emaAlphas).toEqual(DEFAULT_EMA_ALPHAS);
  expect(result.morph).toBe(0);
  expect(result.audioControlMode).toBe(false);
  expect(result.paletteR).toBeTypeOf('number');
  expect(result.paletteG).toBeTypeOf('number');
  expect(result.paletteB).toBeTypeOf('number');
  expect(result.audioTransientAutomation).toBe(false);
  expect(result.outputs).toEqual([]);
});

test('v2 state is upgraded through v3..v9', () => {
  const result = migrateControlState({
    schemaVersion: 2,
    activeShader: 1,
  }) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.activeShader).toBe(1);
  expect(result.bandCurves).toEqual(DEFAULT_BAND_CURVES);
  expect(result.emaAlphas).toEqual(DEFAULT_EMA_ALPHAS);
  expect(result.morph).toBe(0);
  expect(result.audioControlMode).toBe(false);
  expect(result.outputs).toEqual([]);
});

test('v3 state is upgraded through v4..v9 with emaAlphas, morph, audioControlMode, and outputs added', () => {
  const input = {
    schemaVersion: 3,
    activeShader: 1,
    bandCurves: {
      energy: 'exponential',
      bass: 'linear',
      mid: 'logarithmic',
      high: 'linear',
    },
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.activeShader).toBe(1);
  expect(result.bandCurves).toEqual(input.bandCurves);
  expect(result.emaAlphas).toEqual(DEFAULT_EMA_ALPHAS);
  expect(result.morph).toBe(0);
  expect(result.audioControlMode).toBe(false);
  expect(result.outputs).toEqual([]);
});

test('v4 state is upgraded to v9 with morph, audioControlMode, and outputs added', () => {
  const input = {
    schemaVersion: 4,
    activeShader: 1,
    bandCurves: {
      energy: 'exponential',
      bass: 'linear',
      mid: 'logarithmic',
      high: 'linear',
    },
    emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.emaAlphas).toEqual(input.emaAlphas);
  expect(result.morph).toBe(0);
  expect(result.audioControlMode).toBe(false);
  expect(result.outputs).toEqual([]);
});

test('v3 state with legacy flat emaAlpha* fields carries them forward into emaAlphas', () => {
  const input = {
    schemaVersion: 3,
    activeShader: 1,
    bandCurves: {
      energy: 'exponential',
      bass: 'linear',
      mid: 'linear',
      high: 'linear',
    },
    emaAlphaBass: 0.1,
    emaAlphaEnergy: 0.3,
    emaAlphaMid: 0.2,
    emaAlphaHigh: 0.4,
    emaAlphaPulse: 0.5,
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.emaAlphas).toEqual({
    energy: 0.3,
    bass: 0.1,
    mid: 0.2,
    high: 0.4,
    pulse: 0.5,
  });
  expect(result.morph).toBe(0);
  expect(result.audioControlMode).toBe(false);
  expect(result.outputs).toEqual([]);
});

test('v5 state is upgraded to v9 with audioControlMode and outputs added', () => {
  const input = {
    schemaVersion: 5,
    activeShader: 1,
    bandCurves: {
      energy: 'exponential',
      bass: 'linear',
      mid: 'logarithmic',
      high: 'linear',
    },
    emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
    morph: 0.4,
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.activeShader).toBe(1);
  expect(result.emaAlphas).toEqual(input.emaAlphas);
  expect(result.morph).toBe(0.4);
  expect(result.audioControlMode).toBe(false);
  expect(result.audioTransientAutomation).toBe(false);
  expect(result.outputs).toEqual([]);
});

test('v6 state is upgraded to v9 with paletteR/G/B derived from legacy palette hue and outputs added', () => {
  const input = {
    schemaVersion: 6,
    activeShader: 1,
    palette: 0.5,
    bandCurves: {
      energy: 'exponential',
      bass: 'linear',
      mid: 'logarithmic',
      high: 'linear',
    },
    emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
    morph: 0.4,
    audioControlMode: true,
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.paletteR).toBeTypeOf('number');
  expect(result.paletteG).toBeTypeOf('number');
  expect(result.paletteB).toBeTypeOf('number');
  expect(result.outputs).toEqual([]);
});

test('v7 state is upgraded to v9 with audioTransientAutomation and outputs added', () => {
  const input = {
    schemaVersion: 7,
    activeShader: 1,
    paletteR: 0.2,
    paletteG: 0.4,
    paletteB: 0.8,
    bandCurves: {
      energy: 'exponential',
      bass: 'linear',
      mid: 'logarithmic',
      high: 'linear',
    },
    emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
    morph: 0.4,
    audioControlMode: true,
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.audioControlMode).toBe(true);
  expect(result.audioTransientAutomation).toBe(false);
  expect(result.outputs).toEqual([]);
});

test('v8 state is upgraded to v9 with outputs added', () => {
  const input = {
    schemaVersion: 8,
    activeShader: 1,
    paletteR: 0.2,
    paletteG: 0.4,
    paletteB: 0.8,
    bandCurves: {
      energy: 'exponential',
      bass: 'linear',
      mid: 'logarithmic',
      high: 'linear',
    },
    emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
    morph: 0.4,
    audioControlMode: true,
    audioTransientAutomation: true,
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.audioTransientAutomation).toBe(true);
  expect(result.outputs).toEqual([]);
});

test('v9 state is upgraded to v12 with layer weights and Figure controls', () => {
  const input = {
    schemaVersion: 9,
    activeShader: 1,
    paletteR: 0.2,
    paletteG: 0.4,
    paletteB: 0.8,
    bandCurves: {
      energy: 'exponential',
      bass: 'linear',
      mid: 'logarithmic',
      high: 'linear',
    },
    emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
    morph: 0.4,
    audioControlMode: true,
    audioTransientAutomation: true,
    outputs: [],
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.outputs).toEqual([]);
  for (let i = 0; i < 8; i++) {
    expect(result[`layerWeight${i}`]).toBe(0);
  }
  expect(result.figureModel).toBe(0);
  expect(result.figureScale).toBe(1);
  expect(result.figureSpin).toBe(0.35);
  expect(result.figureHalo).toBe(0.75);
  expect(result.figureAudio).toBe(1);
  expect(result.figureAssetPath).toBe('');
});

test('v10 state is upgraded to v12 with Figure defaults', () => {
  const input = {
    schemaVersion: 10,
    activeShader: 1,
    outputs: [],
    layerWeight0: 0,
    layerWeight1: 0,
    layerWeight2: 0,
    layerWeight3: 0,
    layerWeight4: 0,
    layerWeight5: 0,
    layerWeight6: 0,
    layerWeight7: 0,
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.figureModel).toBe(0);
  expect(result.figureScale).toBe(1);
  expect(result.figureSpin).toBe(0.35);
  expect(result.figureHalo).toBe(0.75);
  expect(result.figureAudio).toBe(1);
  expect(result.figureAssetPath).toBe('');
});

test('v11 state is upgraded to v12 with an empty remote asset path', () => {
  const input = {
    schemaVersion: 11,
    activeShader: 1,
    outputs: [],
    layerWeight0: 0,
    layerWeight1: 0,
    layerWeight2: 0,
    layerWeight3: 0,
    layerWeight4: 0,
    layerWeight5: 0,
    layerWeight6: 0,
    layerWeight7: 0,
    figureModel: 0,
    figureScale: 1.2,
    figureSpin: 0.5,
    figureHalo: 0.8,
    figureAudio: 0.9,
  };
  const result = migrateControlState(input) as Record<string, unknown>;
  expect(result.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(result.figureAssetPath).toBe('');
});

test('v12 state migrates through to current', () => {
  const input = {
    schemaVersion: 12,
    figureAssetPath: 'https://cdn.example.com/figure.glb',
  };
  const migrated = migrateControlState(input) as Record<string, unknown>;
  expect(migrated.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(migrated.cpuDeckAEnabled).toBe(false);
  expect(migrated.cpuDeckBEnabled).toBe(false);
  expect(migrated.gpuDeckAEnabled).toBe(false);
  expect(migrated.gpuDeckBEnabled).toBe(false);
  expect(migrated.deckAPresetSlug).toBe('');
  expect(migrated.deckBPresetSlug).toBe('');
});

test('v13 state gains empty deck preset slugs', () => {
  const input = {
    schemaVersion: 13,
    deckAMode: 0,
    deckBMode: 1,
  };
  const migrated = migrateControlState(input) as Record<string, unknown>;
  expect(migrated.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(migrated.deckAPresetSlug).toBe('');
  expect(migrated.deckBPresetSlug).toBe('');
  expect(migrated.deckAMode).toBe(0);
  expect(migrated.deckBMode).toBe(1);
  expect(migrated.deckAReloadActiveVersion).toBe(0);
  expect(migrated.deckBReloadActiveVersion).toBe(0);
});

test('v14 state gains reload-active counters', () => {
  const input = {
    schemaVersion: 14,
    deckAPresetSlug: 'beams',
    deckBPresetSlug: 'tunnel',
  };
  const migrated = migrateControlState(input) as Record<string, unknown>;
  expect(migrated.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(migrated.deckAReloadActiveVersion).toBe(0);
  expect(migrated.deckBReloadActiveVersion).toBe(0);
  expect(migrated.deckAPresetSlug).toBe('beams');
});

test('v15 state seeds per-deck axes from globals', () => {
  const input = {
    schemaVersion: 15,
    intensity: 1.1,
    depth: 0.4,
    feedback: 0.55,
    speed: 1.8,
    deckAReloadActiveVersion: 2,
    deckBReloadActiveVersion: 3,
  };
  const migrated = migrateControlState(input) as Record<string, unknown>;
  expect(migrated.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(migrated.deckAIntensity).toBe(1.1);
  expect(migrated.deckBIntensity).toBe(1.1);
  expect(migrated.deckADepth).toBe(0.4);
  expect(migrated.deckBDepth).toBe(0.4);
  expect(migrated.deckAFeedback).toBe(0.55);
  expect(migrated.deckBFeedback).toBe(0.55);
  expect(migrated.deckASpeed).toBe(1.8);
  expect(migrated.deckBSpeed).toBe(1.8);
  expect(migrated.deckAReloadActiveVersion).toBe(2);
  expect(migrated.deckAPalette).toBe(0.38);
  expect(migrated.deckBPalette).toBe(0.38);
});

test('v16 state seeds independent deck colors from the global palette', () => {
  const migrated = migrateControlState({
    schemaVersion: 16,
    palette: 0.73,
  }) as Record<string, unknown>;
  expect(migrated.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(migrated.deckAPalette).toBe(0.73);
  expect(migrated.deckBPalette).toBe(0.73);
});

test('v16 migration preserves already-diverged deck colors', () => {
  const migrated = migrateControlState({
    schemaVersion: 16,
    palette: 0.5,
    deckAPalette: 0.15,
    deckBPalette: 0.85,
  }) as Record<string, unknown>;
  expect(migrated.deckAPalette).toBe(0.15);
  expect(migrated.deckBPalette).toBe(0.85);
});

test('v15 migration preserves already-diverged deck axes when present', () => {
  const input = {
    schemaVersion: 15,
    intensity: 0.82,
    depth: 0,
    feedback: 0.22,
    speed: 1,
    deckAIntensity: 1.2,
    deckADepth: 0.7,
    deckAFeedback: 0.4,
    deckASpeed: 2,
    deckBIntensity: 0.5,
    deckBDepth: 0.1,
    deckBFeedback: 0.9,
    deckBSpeed: 0.5,
  };
  const migrated = migrateControlState(input) as Record<string, unknown>;
  expect(migrated.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(migrated.deckAIntensity).toBe(1.2);
  expect(migrated.deckADepth).toBe(0.7);
  expect(migrated.deckAFeedback).toBe(0.4);
  expect(migrated.deckASpeed).toBe(2);
  expect(migrated.deckBIntensity).toBe(0.5);
  expect(migrated.deckBDepth).toBe(0.1);
  expect(migrated.deckBFeedback).toBe(0.9);
  expect(migrated.deckBSpeed).toBe(0.5);
});

test('older schema chains through v17 deck axes and colors with global defaults', () => {
  const migrated = migrateControlState({
    schemaVersion: 13,
    intensity: 0.9,
    depth: 0.3,
    feedback: 0.4,
    speed: 1.25,
  }) as Record<string, unknown>;
  expect(migrated.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(migrated.deckAIntensity).toBe(0.9);
  expect(migrated.deckBIntensity).toBe(0.9);
  expect(migrated.deckADepth).toBe(0.3);
  expect(migrated.deckBDepth).toBe(0.3);
  expect(migrated.deckAFeedback).toBe(0.4);
  expect(migrated.deckBFeedback).toBe(0.4);
  expect(migrated.deckASpeed).toBe(1.25);
  expect(migrated.deckBSpeed).toBe(1.25);
  expect(migrated.deckAPalette).toBe(0.38);
  expect(migrated.deckBPalette).toBe(0.38);
  expect(migrated.xrFollowDeckModes).toBe(true);
  expect(migrated.xrFormationA).toBe(0);
  expect(migrated.xrFormationB).toBe(1);
  expect(migrated.xrDensityA).toBe(1);
  expect(migrated.xrDensityB).toBe(1);
  expect(migrated.xrStructureA).toBe(1);
  expect(migrated.xrStructureB).toBe(1);
  expect(migrated.xrSpatialExtent).toBe(1);
  expect(migrated.xrAudioReactivity).toBe(1);
});

test('v17 migration adds backward-compatible WebXR performance controls', () => {
  const migrated = migrateControlState({
    schemaVersion: 17,
    deckAPalette: 0.2,
    deckBPalette: 0.8,
  }) as Record<string, unknown>;
  expect(migrated.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(migrated).toMatchObject({
    xrFollowDeckModes: true,
    xrFormationA: 0,
    xrFormationB: 1,
    xrDensityA: 1,
    xrDensityB: 1,
    xrStructureA: 1,
    xrStructureB: 1,
    xrSpatialExtent: 1,
    xrAudioReactivity: 1,
  });
});

test('null passes through unchanged', () => {
  expect(migrateControlState(null)).toBeNull();
});
