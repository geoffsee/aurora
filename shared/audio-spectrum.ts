/** Renderer-neutral browser spectrum lane shared by Console, bridge, and WebXR. */

export const AURORA_AUDIO_SPECTRUM_ADDRESS = '/aurora/audio/spectrum';
export const AUDIO_SPECTRUM_SCHEMA_VERSION = 1 as const;
export const AUDIO_SPECTRUM_BIN_COUNT = 64;
export const AUDIO_SPECTRUM_MIN_HZ = 20;
export const AUDIO_SPECTRUM_MAX_HZ = 20_000;
export const AUDIO_SPECTRUM_STALE_MS = 1_000;

export type AudioSpectrumFrame = {
  schemaVersion: typeof AUDIO_SPECTRUM_SCHEMA_VERSION;
  source: 'browser-mic';
  /** Exactly 64 normalized logarithmic frequency buckets. */
  bins: number[];
  minHz: number;
  maxHz: number;
};

export type ExtractAudioSpectrumOptions = {
  sampleRate: number;
  fftSize: number;
  minDecibels?: number;
  maxDecibels?: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Downsample analyser dB bins into perceptually useful logarithmic buckets.
 * A peak-biased mean keeps narrow musical partials visible without making a
 * single noisy FFT bin entirely own the result.
 */
export function extractAudioSpectrum(
  freqDb: ArrayLike<number>,
  options: ExtractAudioSpectrumOptions,
): AudioSpectrumFrame {
  const minDb = options.minDecibels ?? -100;
  const maxDb = options.maxDecibels ?? -30;
  const dbSpan = maxDb - minDb;
  const nyquist = Math.max(0, options.sampleRate / 2);
  const maxHz = Math.min(AUDIO_SPECTRUM_MAX_HZ, nyquist);
  const bins = new Array<number>(AUDIO_SPECTRUM_BIN_COUNT).fill(0);

  if (
    freqDb.length === 0 ||
    !(options.sampleRate > 0) ||
    !(options.fftSize > 0) ||
    !(dbSpan > 0) ||
    !(maxHz > AUDIO_SPECTRUM_MIN_HZ)
  ) {
    return {
      schemaVersion: AUDIO_SPECTRUM_SCHEMA_VERSION,
      source: 'browser-mic',
      bins,
      minHz: AUDIO_SPECTRUM_MIN_HZ,
      maxHz: Math.max(AUDIO_SPECTRUM_MIN_HZ, maxHz),
    };
  }

  const hzPerSourceBin = options.sampleRate / options.fftSize;
  const ratio = maxHz / AUDIO_SPECTRUM_MIN_HZ;
  for (let bucket = 0; bucket < AUDIO_SPECTRUM_BIN_COUNT; bucket++) {
    const loHz = AUDIO_SPECTRUM_MIN_HZ * ratio ** (bucket / AUDIO_SPECTRUM_BIN_COUNT);
    const hiHz = AUDIO_SPECTRUM_MIN_HZ * ratio ** ((bucket + 1) / AUDIO_SPECTRUM_BIN_COUNT);
    const start = Math.max(0, Math.floor(loHz / hzPerSourceBin));
    const end = Math.min(freqDb.length, Math.max(start + 1, Math.ceil(hiHz / hzPerSourceBin)));
    let sum = 0;
    let peak = 0;
    let count = 0;
    for (let index = start; index < end; index++) {
      const raw = Number(freqDb[index]);
      const normalized = clamp01(((Number.isFinite(raw) ? raw : minDb) - minDb) / dbSpan);
      sum += normalized;
      peak = Math.max(peak, normalized);
      count++;
    }
    const mean = count > 0 ? sum / count : 0;
    bins[bucket] = clamp01(peak * 0.65 + mean * 0.35);
  }

  return {
    schemaVersion: AUDIO_SPECTRUM_SCHEMA_VERSION,
    source: 'browser-mic',
    bins,
    minHz: AUDIO_SPECTRUM_MIN_HZ,
    maxHz,
  };
}

/** Validate an untrusted spectrum frame. `null` is reserved for an explicit clear. */
export function coerceAudioSpectrumFrame(raw: unknown): AudioSpectrumFrame | null {
  if (!raw || typeof raw !== 'object') return null;
  const frame = raw as Record<string, unknown>;
  if (
    frame.schemaVersion !== AUDIO_SPECTRUM_SCHEMA_VERSION ||
    frame.source !== 'browser-mic' ||
    !Array.isArray(frame.bins) ||
    frame.bins.length !== AUDIO_SPECTRUM_BIN_COUNT
  ) {
    return null;
  }

  const bins: number[] = [];
  for (const value of frame.bins) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    bins.push(clamp01(number));
  }
  const minHz = Number(frame.minHz);
  const maxHz = Number(frame.maxHz);
  if (
    !Number.isFinite(minHz) ||
    !Number.isFinite(maxHz) ||
    minHz < 1 ||
    maxHz <= minHz ||
    maxHz > 48_000
  ) {
    return null;
  }

  return {
    schemaVersion: AUDIO_SPECTRUM_SCHEMA_VERSION,
    source: 'browser-mic',
    bins,
    minHz,
    maxHz,
  };
}
