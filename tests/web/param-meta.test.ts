import { describe, expect, test } from 'vitest';
import {
  buildParamPatch,
  DECK_A_KNOB_PARAMS,
  DECK_B_KNOB_PARAMS,
  FIGURE_KNOB_PARAMS,
  isMappableParam,
  KNOB_STRIP_PARAMS,
  MAPPABLE_PARAMS,
  PARAM_META,
} from '../../web/controls/lib/param-meta.ts';

describe('buildParamPatch palette', () => {
  test('palette hue also writes RGB duotone base', () => {
    const patch = buildParamPatch('palette', 0);
    expect(patch.palette).toBe(0);
    expect(patch.paletteR).toBeDefined();
    expect(patch.paletteG).toBeDefined();
    expect(patch.paletteB).toBeDefined();
    expect(patch.deckAPalette).toBe(0);
    expect(patch.deckBPalette).toBe(0);
    // Hue 0 ≈ red-ish base (HSL path in hueToRgb).
    expect(Number(patch.paletteR)).toBeGreaterThan(Number(patch.paletteG));
  });

  test('palette channel knobs resync hue from RGB', () => {
    const patch = buildParamPatch('paletteR', 1, { paletteR: 0.1, paletteG: 0.5, paletteB: 0.2 });
    expect(patch.paletteR).toBe(1);
    expect(patch.paletteG).toBe(0.5);
    expect(patch.paletteB).toBe(0.2);
    expect(typeof patch.palette).toBe('number');
  });

  test('global intensity/depth/feedback/speed also seed both decks', () => {
    expect(buildParamPatch('intensity', 1.1)).toEqual({
      intensity: 1.1,
      deckAIntensity: 1.1,
      deckBIntensity: 1.1,
    });
    expect(buildParamPatch('depth', 0.4)).toMatchObject({
      depth: 0.4,
      deckADepth: 0.4,
      deckBDepth: 0.4,
    });
    expect(buildParamPatch('feedback', 0.5)).toMatchObject({
      feedback: 0.5,
      deckAFeedback: 0.5,
      deckBFeedback: 0.5,
    });
    expect(buildParamPatch('speed', 1.5)).toMatchObject({
      speed: 1.5,
      deckASpeed: 1.5,
      deckBSpeed: 1.5,
    });
  });

  test('per-deck knobs only write their own field', () => {
    expect(buildParamPatch('deckAIntensity', 0.9)).toEqual({ deckAIntensity: 0.9 });
    expect(buildParamPatch('deckBSpeed', 2)).toEqual({ deckBSpeed: 2 });
    expect(buildParamPatch('deckADepth', 0.3)).toEqual({ deckADepth: 0.3 });
    expect(buildParamPatch('deckBFeedback', 0.6)).toEqual({ deckBFeedback: 0.6 });
    expect(buildParamPatch('deckAPalette', 0.2)).toEqual({ deckAPalette: 0.2 });
    expect(buildParamPatch('deckBPalette', 0.8)).toEqual({ deckBPalette: 0.8 });
  });
});

describe('deck launchpad knobs', () => {
  test('each deck has its own intensity, depth, speed, and color', () => {
    expect(DECK_A_KNOB_PARAMS).toEqual([
      'deckAIntensity',
      'deckADepth',
      'deckASpeed',
      'deckAPalette',
    ]);
    expect(DECK_B_KNOB_PARAMS).toEqual([
      'deckBIntensity',
      'deckBDepth',
      'deckBSpeed',
      'deckBPalette',
    ]);
  });

  test('deck param ranges match the corresponding global masters', () => {
    for (const [globalKey, deckKey] of [
      ['intensity', 'deckAIntensity'],
      ['depth', 'deckADepth'],
      ['feedback', 'deckAFeedback'],
      ['speed', 'deckASpeed'],
      ['intensity', 'deckBIntensity'],
      ['depth', 'deckBDepth'],
      ['feedback', 'deckBFeedback'],
      ['speed', 'deckBSpeed'],
    ] as const) {
      expect(PARAM_META[deckKey].min).toBe(PARAM_META[globalKey].min);
      expect(PARAM_META[deckKey].max).toBe(PARAM_META[globalKey].max);
      expect(PARAM_META[deckKey].step).toBe(PARAM_META[globalKey].step);
    }
  });
});

describe('knob strip coverage', () => {
  test('strip lists unique non-figure mappable params', () => {
    expect(new Set(KNOB_STRIP_PARAMS).size).toBe(KNOB_STRIP_PARAMS.length);
    for (const key of KNOB_STRIP_PARAMS) {
      expect(PARAM_META[key].min).toBeLessThan(PARAM_META[key].max);
    }
    for (const key of FIGURE_KNOB_PARAMS) {
      expect(KNOB_STRIP_PARAMS).not.toContain(key);
      expect(MAPPABLE_PARAMS).toContain(key);
    }
    for (const key of DECK_A_KNOB_PARAMS) {
      expect(KNOB_STRIP_PARAMS).not.toContain(key);
      expect(MAPPABLE_PARAMS).toContain(key);
    }
    for (const key of DECK_B_KNOB_PARAMS) {
      expect(KNOB_STRIP_PARAMS).not.toContain(key);
      expect(MAPPABLE_PARAMS).toContain(key);
    }
    // Everything mappable is strip, figure-only, deck-launchpad, or per-deck feedback.
    for (const key of MAPPABLE_PARAMS) {
      const onStrip = (KNOB_STRIP_PARAMS as readonly string[]).includes(key);
      const figureOnly = (FIGURE_KNOB_PARAMS as readonly string[]).includes(key);
      const deckOnly =
        (DECK_A_KNOB_PARAMS as readonly string[]).includes(key) ||
        (DECK_B_KNOB_PARAMS as readonly string[]).includes(key) ||
        key === 'deckAFeedback' ||
        key === 'deckBFeedback';
      expect(onStrip || figureOnly || deckOnly).toBe(true);
    }
  });

  test('isMappableParam guards unknown names', () => {
    expect(isMappableParam('palette')).toBe(true);
    expect(isMappableParam('morph')).toBe(true);
    expect(isMappableParam('deckAIntensity')).toBe(true);
    expect(isMappableParam('not-a-param')).toBe(false);
  });
});
