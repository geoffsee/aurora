import { describe, expect, test } from 'vitest';
import {
  buildParamPatch,
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
});

describe('knob strip coverage', () => {
  test('strip lists every mappable param exactly once', () => {
    expect(new Set(KNOB_STRIP_PARAMS).size).toBe(KNOB_STRIP_PARAMS.length);
    expect(KNOB_STRIP_PARAMS).toHaveLength(MAPPABLE_PARAMS.length);
    for (const key of MAPPABLE_PARAMS) {
      expect(KNOB_STRIP_PARAMS).toContain(key);
      expect(PARAM_META[key].min).toBeLessThan(PARAM_META[key].max);
    }
  });

  test('isMappableParam guards unknown names', () => {
    expect(isMappableParam('palette')).toBe(true);
    expect(isMappableParam('morph')).toBe(true);
    expect(isMappableParam('not-a-param')).toBe(false);
  });
});
