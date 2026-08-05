import { describe, expect, test } from 'vitest';
import {
  deckGpuShaderModePatch,
  deckModePatch,
  deckVisibilityPatch,
} from '../../web/controls/lib/deck-mode.ts';

describe('deck mode routing', () => {
  test('selecting a CPU mode only changes that deck mode', () => {
    expect(deckModePatch('A', 12)).toEqual({ deckAMode: 12 });
    expect(deckModePatch('B', 7)).toEqual({ deckBMode: 7 });
  });

  test('GPU shader selection does not toggle either deck', () => {
    expect(deckGpuShaderModePatch()).toEqual({});
  });

  test('deck visibility patches are independent', () => {
    expect(deckVisibilityPatch('A', 'cpu', true)).toEqual({ cpuDeckAEnabled: true });
    expect(deckVisibilityPatch('B', 'gpu', false)).toEqual({ gpuDeckBEnabled: false });
  });
});
