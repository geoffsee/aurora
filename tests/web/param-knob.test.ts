import { describe, expect, test } from 'vitest';
import { valueFromDrag } from '../../web/controls/components/ParamKnob.tsx';

describe('valueFromDrag', () => {
  test('maps upward drag to a larger value without snapping to a click position', () => {
    expect(valueFromDrag(0.5, -24, 0, 1, 0.01, 160)).toBeCloseTo(0.65);
  });

  test('clamps continuous drag at the configured bounds', () => {
    expect(valueFromDrag(0.98, -80, 0, 1, 0.01, 160)).toBe(1);
    expect(valueFromDrag(0.02, 80, 0, 1, 0.01, 160)).toBe(0);
  });
});
