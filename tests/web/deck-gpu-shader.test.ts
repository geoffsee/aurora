import { describe, expect, test } from 'vitest';
import { RECORDING_EXCLUDED_FIELDS } from '../../bridge/automation-player.ts';
import {
  DEFAULT_DECK_A_GPU_SHADER_UI_INDEX,
  DEFAULT_DECK_B_GPU_SHADER_UI_INDEX,
} from '../../shared/gpu-shader-routing.ts';
import { deckGpuShaderPatch } from '../../web/controls/lib/deck-gpu-shader.ts';

describe('deckGpuShaderPatch', () => {
  test('Deck A pad updates only deckAGpuShader (+ activeShader mirror)', () => {
    const patch = deckGpuShaderPatch('A', 20);
    expect(patch).toEqual({ deckAGpuShader: 20, activeShader: 20 });
    expect(patch).not.toHaveProperty('deckBGpuShader');
  });

  test('Deck B pad updates only deckBGpuShader (+ activeShader mirror)', () => {
    const patch = deckGpuShaderPatch('B', 26);
    expect(patch).toEqual({ deckBGpuShader: 26, activeShader: 26 });
    expect(patch).not.toHaveProperty('deckAGpuShader');
  });

  test('floors fractional MIDI-style values', () => {
    expect(deckGpuShaderPatch('A', 20.9).deckAGpuShader).toBe(20);
  });

  test('sequential A then B picks leave a distinct dual-deck pair', () => {
    const warm = {
      deckAGpuShader: DEFAULT_DECK_A_GPU_SHADER_UI_INDEX,
      deckBGpuShader: DEFAULT_DECK_B_GPU_SHADER_UI_INDEX,
      activeShader: DEFAULT_DECK_A_GPU_SHADER_UI_INDEX,
      deckAMode: 6,
      deckBMode: 0,
      showGpuPalette: true,
      crossfade: 0.5,
    };

    const afterA = { ...warm, ...deckGpuShaderPatch('A', 20) };
    expect(afterA.deckAGpuShader).toBe(20);
    expect(afterA.deckBGpuShader).toBe(DEFAULT_DECK_B_GPU_SHADER_UI_INDEX);
    expect(afterA.deckAMode).toBe(6);
    expect(afterA.deckBMode).toBe(0);
    expect(afterA.showGpuPalette).toBe(true);
    expect(afterA.crossfade).toBe(0.5);

    const afterB = { ...afterA, ...deckGpuShaderPatch('B', 18) };
    expect(afterB.deckAGpuShader).toBe(20);
    expect(afterB.deckBGpuShader).toBe(18);
    expect(afterB.activeShader).toBe(18);
    // Modes + GPU master switch untouched by shader pads.
    expect(afterB.deckAMode).toBe(6);
    expect(afterB.deckBMode).toBe(0);
    expect(afterB.showGpuPalette).toBe(true);
  });

  test('mode-only patch must not clobber distinct deck GPU shaders', () => {
    const warm = {
      deckAGpuShader: 20,
      deckBGpuShader: 36,
      activeShader: 20,
      deckAMode: 6,
      deckBMode: 0,
      showGpuPalette: true,
    };
    const afterMode = { ...warm, deckAMode: 12 };
    expect(afterMode.deckAGpuShader).toBe(20);
    expect(afterMode.deckBGpuShader).toBe(36);
    expect(afterMode.showGpuPalette).toBe(true);
  });
});

describe('dual-deck GPU layout fields stay out of automation recordings', () => {
  test('RECORDING_EXCLUDED_FIELDS includes both deck GPU shaders', () => {
    expect(RECORDING_EXCLUDED_FIELDS.has('deckAGpuShader')).toBe(true);
    expect(RECORDING_EXCLUDED_FIELDS.has('deckBGpuShader')).toBe(true);
    expect(RECORDING_EXCLUDED_FIELDS.has('showGpuPalette')).toBe(true);
    expect(RECORDING_EXCLUDED_FIELDS.has('deckAMode')).toBe(true);
    expect(RECORDING_EXCLUDED_FIELDS.has('deckBMode')).toBe(true);
    expect(RECORDING_EXCLUDED_FIELDS.has('activeShader')).toBe(true);
  });
});
