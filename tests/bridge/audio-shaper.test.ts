import { describe, expect, test } from 'vitest';
import { type AudioFeatures, DEFAULT_AUDIO_EMA_RELEASE_ALPHAS } from '../../bridge/audio-ema.ts';
import {
  AUDIO_SHAPING_BANDS,
  AUDIO_SHAPING_MAX_GAIN,
  type AudioShapingConfig,
  coerceAudioShaping,
  defaultAudioShaping,
  hasSolo,
  isIdentityShaping,
  releaseAlphasFrom,
  shapeAudioFeatures,
  shapeBand,
} from '../../bridge/audio-shaper.ts';
import { cloneState, preparePresetTarget } from '../../web/controls/lib/presets.ts';

function features(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
  return { energy: 0.5, bass: 0.5, mid: 0.5, high: 0.5, pulse: 0.5, ...overrides };
}

function withBand(
  band: keyof AudioShapingConfig,
  patch: Partial<AudioShapingConfig[typeof band]>,
): AudioShapingConfig {
  const config = defaultAudioShaping();
  config[band] = { ...config[band], ...patch };
  return config;
}

describe('defaults are identity', () => {
  test('shaping an untouched config changes nothing', () => {
    // The non-regression requirement: an operator who never opens the panel
    // gets the behaviour that shipped before this existed.
    const input = features({ energy: 0.31, bass: 0.72, mid: 0.04, high: 0.99, pulse: 0.6 });
    expect(shapeAudioFeatures(input, defaultAudioShaping())).toEqual(input);
    expect(isIdentityShaping(defaultAudioShaping())).toBe(true);
  });

  test('release alphas default to the constants the bridge already used', () => {
    expect(releaseAlphasFrom(defaultAudioShaping())).toEqual(DEFAULT_AUDIO_EMA_RELEASE_ALPHAS);
  });

  test('any real change stops reading as identity', () => {
    expect(isIdentityShaping(withBand('bass', { gain: 1.5 }))).toBe(false);
    expect(isIdentityShaping(withBand('high', { mute: true }))).toBe(false);
  });
});

describe('shapeBand stages', () => {
  const band = { gain: 1, gate: 0, ceiling: 1, release: 0.1, mute: false, solo: false };

  test('gain scales the input', () => {
    expect(shapeBand(0.25, { ...band, gain: 2 }, undefined, false)).toBeCloseTo(0.5, 5);
  });

  test('gain runs before gate, so a quiet source can be lifted then floored', () => {
    // Gating first would throw away the very signal the operator is amplifying,
    // which is the whole reason gain exists on a timid mic.
    const shaping = { ...band, gain: 4, gate: 0.3 };
    expect(shapeBand(0.1, shaping, undefined, false)).toBeCloseTo(0.4, 5);
    // Still under the gate after amplification → silent.
    expect(shapeBand(0.05, shaping, undefined, false)).toBe(0);
  });

  test('gate is a floor, not a subtraction', () => {
    // Subtracting would shift every mapping's response as a side effect of
    // setting a noise floor.
    const shaping = { ...band, gate: 0.2 };
    expect(shapeBand(0.2, shaping, undefined, false)).toBe(0);
    expect(shapeBand(0.21, shaping, undefined, false)).toBeCloseTo(0.21, 5);
    expect(shapeBand(0.9, shaping, undefined, false)).toBeCloseTo(0.9, 5);
  });

  test('ceiling clips after gain', () => {
    expect(shapeBand(0.5, { ...band, gain: 3, ceiling: 0.7 }, undefined, false)).toBeCloseTo(
      0.7,
      5,
    );
  });

  test('curve applies last', () => {
    expect(shapeBand(0.5, band, 'exponential', false)).toBeCloseTo(0.25, 5);
    expect(shapeBand(0.5, band, 'logarithmic', false)).toBeCloseTo(Math.SQRT1_2, 5);
    expect(shapeBand(0.5, band, 'linear', false)).toBeCloseTo(0.5, 5);
  });

  test('mute wins over everything', () => {
    expect(shapeBand(1, { ...band, gain: 4, mute: true }, 'linear', false)).toBe(0);
  });

  test('negative and non-finite inputs read as silence, not as garbage', () => {
    expect(shapeBand(-1, band, undefined, false)).toBe(0);
    expect(shapeBand(Number.NaN, band, undefined, false)).toBe(0);
  });
});

describe('solo', () => {
  test('a soloed band silences the others', () => {
    const config = withBand('bass', { solo: true });
    expect(hasSolo(config)).toBe(true);
    const out = shapeAudioFeatures(features(), config);
    expect(out.bass).toBeCloseTo(0.5, 5);
    expect(out.energy).toBe(0);
    expect(out.mid).toBe(0);
    expect(out.high).toBe(0);
    expect(out.pulse).toBe(0);
  });

  test('two soloed bands both survive', () => {
    const config = defaultAudioShaping();
    config.bass = { ...config.bass, solo: true };
    config.high = { ...config.high, solo: true };
    const out = shapeAudioFeatures(features(), config);
    expect(out.bass).toBeCloseTo(0.5, 5);
    expect(out.high).toBeCloseTo(0.5, 5);
    expect(out.mid).toBe(0);
  });

  test('mute beats solo on the same band', () => {
    const config = withBand('bass', { solo: true, mute: true });
    expect(shapeAudioFeatures(features(), config).bass).toBe(0);
  });

  test('no solo anywhere leaves every band alone', () => {
    expect(hasSolo(defaultAudioShaping())).toBe(false);
  });
});

describe('curves come from bandCurves, not a second control', () => {
  test('the supplied curve map drives the shaped output', () => {
    const out = shapeAudioFeatures(features(), defaultAudioShaping(), {
      bass: 'exponential',
      high: 'logarithmic',
    });
    expect(out.bass).toBeCloseTo(0.25, 5);
    expect(out.high).toBeCloseTo(Math.SQRT1_2, 5);
    expect(out.mid).toBeCloseTo(0.5, 5);
  });

  test('pulse has never had a curve and is passed through linear', () => {
    const out = shapeAudioFeatures(features(), defaultAudioShaping(), {
      pulse: 'exponential',
    } as never);
    expect(out.pulse).toBeCloseTo(0.5, 5);
  });
});

describe('coerceAudioShaping', () => {
  test('an absent config is identity', () => {
    expect(coerceAudioShaping(undefined)).toEqual(defaultAudioShaping());
    expect(coerceAudioShaping(null)).toEqual(defaultAudioShaping());
    expect(coerceAudioShaping('nope')).toEqual(defaultAudioShaping());
  });

  test('clamps every numeric field into range', () => {
    const config = coerceAudioShaping({
      bass: { gain: 99, gate: -5, ceiling: 4, release: 0 },
    });
    expect(config.bass.gain).toBe(AUDIO_SHAPING_MAX_GAIN);
    expect(config.bass.gate).toBe(0);
    expect(config.bass.ceiling).toBe(1);
    // A release of 0 would freeze the band forever — that reads as a broken
    // feed, not as heavy smoothing, so it takes the floor.
    expect(config.bass.release).toBe(0.01);
  });

  test('non-numeric values fall back rather than becoming NaN', () => {
    const config = coerceAudioShaping({ mid: { gain: 'loud', gate: null } });
    expect(config.mid.gain).toBe(1);
    expect(config.mid.gate).toBe(0);
  });

  test('flags are strictly boolean', () => {
    const config = coerceAudioShaping({ high: { mute: 'yes', solo: 1 } });
    expect(config.high.mute).toBe(false);
    expect(config.high.solo).toBe(false);
  });

  test('a partial config leaves the other bands at identity', () => {
    const config = coerceAudioShaping({ energy: { gain: 2 } });
    expect(config.energy.gain).toBe(2);
    for (const band of AUDIO_SHAPING_BANDS) {
      if (band === 'energy') continue;
      expect(config[band]).toEqual(defaultAudioShaping()[band]);
    }
  });

  test('round-trips a full config', () => {
    const config = withBand('bass', { gain: 2.5, gate: 0.1, ceiling: 0.8, release: 0.4 });
    expect(coerceAudioShaping(config)).toEqual(config);
  });
});

describe('preset round-trip', () => {
  test('shaping is captured by a preset save and restored on recall', () => {
    // `cloneState` deep-copies the whole ControlState, so shaping rides presets
    // with no bespoke plumbing — this pins that, because a future change to the
    // save path could silently drop it.
    const shaping = withBand('bass', { gain: 2.5, gate: 0.15, mute: true });
    const saved = cloneState({ audioShaping: shaping } as never) as {
      audioShaping: AudioShapingConfig;
    };
    expect(saved.audioShaping).toEqual(shaping);
    expect(saved.audioShaping).not.toBe(shaping);
    expect(coerceAudioShaping(saved.audioShaping)).toEqual(shaping);
  });

  test('recalling a pre-#285 preset leaves live shaping alone', () => {
    // An old bundle simply has no `audioShaping` key, so the spread omits it
    // and the operator's current shaping survives the recall rather than being
    // silently reset to identity.
    const target = preparePresetTarget({ intensity: 0.8 });
    expect('audioShaping' in target).toBe(false);
  });
});
