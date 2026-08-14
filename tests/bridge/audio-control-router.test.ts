import { describe, expect, test } from 'vitest';
import {
  type AudioMapping,
  makeAudioControlRouter,
  parseAudioMappings,
} from '../../bridge/audio-control-router.ts';
import type { AudioFeatures } from '../../bridge/audio-ema.ts';

const features = (patch: Partial<AudioFeatures>): AudioFeatures => ({
  energy: 0,
  bass: 0,
  mid: 0,
  high: 0,
  pulse: 0,
  ...patch,
});

// Build a router with a captured-diff merge and a mutable backing state for
// increment targets.
const makeHarness = (initial: Record<string, unknown> = {}) => {
  const state: Record<string, unknown> = { flashVersion: 0, ...initial };
  const diffs: Record<string, unknown>[] = [];
  const router = makeAudioControlRouter(
    (diff) => {
      diffs.push(diff);
      Object.assign(state, diff);
    },
    () => state,
  );
  return { router, diffs, state };
};

const continuousMapping = (over: Partial<AudioMapping> = {}): AudioMapping => ({
  source: 'energy',
  target: 'intensity',
  mode: 'continuous',
  targetMin: 0,
  targetMax: 1,
  level: 0.5,
  offDelayMs: 200,
  increment: false,
  combine: 'last',
  ...over,
});

const thresholdMapping = (over: Partial<AudioMapping> = {}): AudioMapping => ({
  source: 'pulse',
  target: 'flashVersion',
  mode: 'threshold',
  targetMin: 0,
  targetMax: 1,
  level: 0.75,
  offDelayMs: 200,
  increment: true,
  combine: 'last',
  ...over,
});

describe('parseAudioMappings', () => {
  test('drops entries with unknown source or missing target, fills defaults', () => {
    const parsed = parseAudioMappings([
      {
        source: 'energy',
        target: 'intensity',
        mode: 'continuous',
        targetMax: 1.3,
      },
      { source: 'nope', target: 'intensity', mode: 'continuous' },
      { source: 'pulse', mode: 'threshold' },
      {
        source: 'bass',
        target: 'depth',
        mode: 'threshold',
        level: 0.4,
        increment: true,
      },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      source: 'energy',
      target: 'intensity',
      mode: 'continuous',
      targetMin: 0,
      targetMax: 1.3,
    });
    expect(parsed[1]).toMatchObject({
      source: 'bass',
      target: 'depth',
      mode: 'threshold',
      level: 0.4,
      offDelayMs: 200,
      increment: true,
    });
  });

  test('drops forbidden arm-switch and layout targets', () => {
    const parsed = parseAudioMappings([
      {
        source: 'energy',
        target: 'audioTransientAutomation',
        mode: 'continuous',
      },
      {
        source: 'pulse',
        target: 'audioControlMode',
        mode: 'threshold',
        level: 0.5,
      },
      {
        source: 'energy',
        target: 'crossfade',
        mode: 'continuous',
      },
      {
        source: 'bass',
        target: 'deckAMode',
        mode: 'continuous',
      },
      {
        source: 'mid',
        target: 'activeShader',
        mode: 'continuous',
      },
      {
        source: 'high',
        target: 'deckBGpuShader',
        mode: 'continuous',
      },
      {
        source: 'pulse',
        target: 'showGpuPalette',
        mode: 'threshold',
        level: 0.5,
      },
      {
        source: 'energy',
        target: 'intensity',
        mode: 'continuous',
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.target).toBe('intensity');
  });

  test('non-array input yields empty mappings', () => {
    expect(parseAudioMappings(null)).toEqual([]);
    expect(parseAudioMappings({})).toEqual([]);
    expect(parseAudioMappings('[]')).toEqual([]);
  });
});

describe('disabled / empty passthrough', () => {
  test('emits nothing while disabled even with mappings', () => {
    const { router, diffs } = makeHarness();
    router.setMappings([continuousMapping()]);
    expect(router.isActive()).toBe(false);
    expect(router.onFeatures(features({ energy: 1 }), 0)).toBe(false);
    expect(diffs).toHaveLength(0);
  });

  test('enabled with no mappings is inert', () => {
    const { router, diffs } = makeHarness();
    router.setEnabled(true);
    router.setMappings([]);
    expect(router.isActive()).toBe(false);
    expect(router.onFeatures(features({ energy: 1 }), 0)).toBe(false);
    expect(diffs).toHaveLength(0);
  });
});

describe('continuous mode', () => {
  test('lerps source across [targetMin,targetMax] and clamps to range', () => {
    const { router, diffs } = makeHarness();
    router.setMappings([continuousMapping({ targetMin: 0.4, targetMax: 1.2 })]);
    router.setEnabled(true);

    router.onFeatures(features({ energy: 0.5 }), 0);
    expect(diffs.at(-1)).toEqual({ intensity: 0.4 + 0.8 * 0.5 });

    // source above 1 clamps to targetMax
    router.onFeatures(features({ energy: 5 }), 10);
    expect(diffs.at(-1)).toEqual({ intensity: 1.2 });
  });

  test('suppresses no-op broadcasts when output barely moves', () => {
    const { router, diffs } = makeHarness();
    router.setMappings([continuousMapping()]);
    router.setEnabled(true);

    router.onFeatures(features({ energy: 0.5 }), 0);
    expect(diffs).toHaveLength(1);
    // identical input → no new diff
    router.onFeatures(features({ energy: 0.5 }), 10);
    expect(diffs).toHaveLength(1);
    // sub-epsilon change → still no new diff
    router.onFeatures(features({ energy: 0.5000001 }), 20);
    expect(diffs).toHaveLength(1);
    // meaningful change → new diff
    router.onFeatures(features({ energy: 0.7 }), 30);
    expect(diffs).toHaveLength(2);
  });
});

describe('threshold mode', () => {
  test('fires once per rising edge, not while held above level', () => {
    const { router, diffs, state } = makeHarness();
    router.setMappings([thresholdMapping()]);
    router.setEnabled(true);

    // below level → no fire
    expect(router.onFeatures(features({ pulse: 0.5 }), 0)).toBe(false);
    // rising edge → fire (flashVersion 0 → 1)
    expect(router.onFeatures(features({ pulse: 0.9 }), 50)).toBe(true);
    expect(state.flashVersion).toBe(1);
    // held above level → no re-fire
    expect(router.onFeatures(features({ pulse: 0.95 }), 400)).toBe(false);
    expect(state.flashVersion).toBe(1);
    // drop below, then rise again past debounce → fire
    router.onFeatures(features({ pulse: 0 }), 500);
    expect(router.onFeatures(features({ pulse: 0.9 }), 800)).toBe(true);
    expect(state.flashVersion).toBe(2);
    expect(diffs).toEqual([{ flashVersion: 1 }, { flashVersion: 2 }]);
  });

  test('debounce suppresses a re-trigger inside offDelayMs', () => {
    const { router, state } = makeHarness();
    router.setMappings([thresholdMapping({ offDelayMs: 200 })]);
    router.setEnabled(true);

    expect(router.onFeatures(features({ pulse: 0.9 }), 0)).toBe(true);
    expect(state.flashVersion).toBe(1);
    // fall and rise again within the debounce window → suppressed
    router.onFeatures(features({ pulse: 0 }), 50);
    expect(router.onFeatures(features({ pulse: 0.9 }), 150)).toBe(false);
    expect(state.flashVersion).toBe(1);
  });

  test('non-increment threshold sets target to targetMax on rise', () => {
    const { router, state } = makeHarness();
    router.setMappings([thresholdMapping({ target: 'strobe', increment: false, targetMax: 1 })]);
    router.setEnabled(true);
    router.onFeatures(features({ pulse: 0.9 }), 0);
    expect(state.strobe).toBe(1);
  });
});

test('setMappings resets edge state', () => {
  const { router, state } = makeHarness();
  router.setMappings([thresholdMapping()]);
  router.setEnabled(true);
  router.onFeatures(features({ pulse: 0.9 }), 0); // flashVersion → 1
  expect(state.flashVersion).toBe(1);

  // Re-set mappings: a held-high reading should now read as a fresh rising edge.
  router.setMappings([thresholdMapping()]);
  expect(router.onFeatures(features({ pulse: 0.9 }), 10)).toBe(true);
  expect(state.flashVersion).toBe(2);
});

describe('combine rules for two mappings on one target', () => {
  const pair = (combine: AudioMapping['combine']) => [
    continuousMapping({ source: 'bass', target: 'depth', targetMax: 1, combine }),
    continuousMapping({ source: 'mid', target: 'depth', targetMax: 1, combine }),
  ];

  test('defaults to last-write-wins — the historical behaviour', () => {
    // Not a chosen semantic before this existed: whichever mapping sat later
    // in the array silently won, which made two-band targets an accident.
    const h = makeHarness();
    h.router.setMappings(pair('last'));
    h.router.setEnabled(true);
    h.router.onFeatures({ energy: 0, bass: 0.8, mid: 0.2, high: 0, pulse: 0 }, 0);
    expect(h.diffs.at(-1)?.depth).toBeCloseTo(0.2, 5);
  });

  test('max lets the loudest band drive without the other cancelling it', () => {
    const h = makeHarness();
    h.router.setMappings(pair('max'));
    h.router.setEnabled(true);
    h.router.onFeatures({ energy: 0, bass: 0.8, mid: 0.2, high: 0, pulse: 0 }, 0);
    expect(h.diffs.at(-1)?.depth).toBeCloseTo(0.8, 5);
  });

  test('min ducks to the quieter band', () => {
    const h = makeHarness();
    h.router.setMappings(pair('min'));
    h.router.setEnabled(true);
    h.router.onFeatures({ energy: 0, bass: 0.8, mid: 0.2, high: 0, pulse: 0 }, 0);
    expect(h.diffs.at(-1)?.depth).toBeCloseTo(0.2, 5);
  });

  test('sum adds both contributions', () => {
    const h = makeHarness();
    h.router.setMappings(pair('sum'));
    h.router.setEnabled(true);
    h.router.onFeatures({ energy: 0, bass: 0.3, mid: 0.4, high: 0, pulse: 0 }, 0);
    expect(h.diffs.at(-1)?.depth).toBeCloseTo(0.7, 5);
  });

  test('a steady band still participates when its target is contested', () => {
    // The bug this guards: no-op suppression is a bandwidth optimisation for a
    // single mapping. On a contested target it would make `max` follow only
    // whichever half happened to move this frame, so the value would collapse
    // to the quiet band the moment the loud one held still.
    const h = makeHarness();
    h.router.setMappings(pair('max'));
    h.router.setEnabled(true);
    h.router.onFeatures({ energy: 0, bass: 0.8, mid: 0.2, high: 0, pulse: 0 }, 0);
    h.router.onFeatures({ energy: 0, bass: 0.8, mid: 0.25, high: 0, pulse: 0 }, 16);
    expect(h.diffs.at(-1)?.depth).toBeCloseTo(0.8, 5);
  });

  test('increment targets always take the running value, never a fold', () => {
    // Folding two bumps with `max` would silently drop one; a counter has to
    // count.
    const h = makeHarness({ flashVersion: 5 });
    h.router.setMappings([
      thresholdMapping({
        source: 'pulse',
        target: 'flashVersion',
        increment: true,
        combine: 'max',
      }),
    ]);
    h.router.setEnabled(true);
    h.router.onFeatures({ energy: 0, bass: 0, mid: 0, high: 0, pulse: 1 }, 0);
    expect(h.diffs.at(-1)?.flashVersion).toBe(6);
  });
});

describe('per-deck targets', () => {
  test('a mapping may address a specific deck sink', () => {
    const h = makeHarness();
    h.router.setMappings([
      continuousMapping({ source: 'bass', target: 'deckADepth', targetMax: 1 }),
      continuousMapping({ source: 'bass', target: 'deckBDepth', targetMin: 1, targetMax: 0 }),
    ]);
    h.router.setEnabled(true);
    h.router.onFeatures({ energy: 0, bass: 0.25, mid: 0, high: 0, pulse: 0 }, 0);
    const diff = h.diffs.at(-1);
    expect(diff?.deckADepth).toBeCloseTo(0.25, 5);
    expect(diff?.deckBDepth).toBeCloseTo(0.75, 5);
  });

  test('one source may drive a per-deck sink and a global one at once', () => {
    const h = makeHarness();
    h.router.setMappings([
      continuousMapping({ source: 'bass', target: 'deckADepth', targetMax: 1 }),
      continuousMapping({ source: 'bass', target: 'depth', targetMax: 0.5 }),
    ]);
    h.router.setEnabled(true);
    h.router.onFeatures({ energy: 0, bass: 0.6, mid: 0, high: 0, pulse: 0 }, 0);
    const diff = h.diffs.at(-1);
    expect(diff?.deckADepth).toBeCloseTo(0.6, 5);
    expect(diff?.depth).toBeCloseTo(0.3, 5);
  });

  test('forbidden targets stay forbidden even per-deck', () => {
    expect(
      parseAudioMappings([
        { source: 'bass', target: 'crossfade' },
        { source: 'bass', target: 'deckAMode' },
        { source: 'bass', target: 'deckAPresetSlug' },
      ]),
    ).toEqual([]);
  });

  test('parseAudioMappings defaults combine to last and rejects junk', () => {
    const [mapping] = parseAudioMappings([
      { source: 'bass', target: 'depth', combine: 'sideways' },
    ]);
    expect(mapping?.combine).toBe('last');
    const [explicit] = parseAudioMappings([{ source: 'bass', target: 'depth', combine: 'max' }]);
    expect(explicit?.combine).toBe('max');
  });
});
