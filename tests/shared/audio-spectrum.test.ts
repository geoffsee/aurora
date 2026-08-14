import { describe, expect, test } from 'vitest';
import {
  AUDIO_SPECTRUM_BIN_COUNT,
  coerceAudioSpectrumFrame,
  extractAudioSpectrum,
} from '../../shared/audio-spectrum.ts';

describe('audio spectrum bridge payload', () => {
  test('extracts 64 finite logarithmic buckets', () => {
    const source = new Float32Array(1_024).fill(-100);
    source[4] = -30;
    source[64] = -45;
    source[512] = -60;
    const frame = extractAudioSpectrum(source, { sampleRate: 48_000, fftSize: 2_048 });

    expect(frame.bins).toHaveLength(AUDIO_SPECTRUM_BIN_COUNT);
    expect(frame.bins.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
      true,
    );
    expect(Math.max(...frame.bins)).toBeGreaterThan(0.5);
  });

  test('clamps valid untrusted bins and rejects malformed frames', () => {
    const base = {
      schemaVersion: 1,
      source: 'browser-mic',
      bins: new Array(AUDIO_SPECTRUM_BIN_COUNT).fill(0.5),
      minHz: 20,
      maxHz: 20_000,
    };
    base.bins[0] = -2;
    base.bins[1] = 4;

    expect(coerceAudioSpectrumFrame(base)?.bins.slice(0, 2)).toEqual([0, 1]);
    expect(coerceAudioSpectrumFrame({ ...base, bins: [0, 1] })).toBeNull();
    expect(coerceAudioSpectrumFrame({ ...base, maxHz: Number.NaN })).toBeNull();
  });
});
