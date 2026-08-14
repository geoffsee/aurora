/**
 * Per-band signal shaping between the feature bus and the control router (#285).
 *
 * Today a band goes from an EMA straight into a mapping. That is fine when the
 * source is a well-levelled Ableton meter and useless when it is a phone mic in
 * a loud room: everything sits at 0.8, nothing has range, and the only knob an
 * operator has is the mapping's output span — which changes what the target
 * *does*, not what the band *is*.
 *
 * This is the stage that was missing. It shapes the signal itself, so the same
 * mapping behaves the way the operator expects across rooms and sources.
 *
 * ```text
 * raw ─► EMA (attack/release) ─► gain ─► gate ─► ceiling ─► curve ─► mute/solo ─► router
 * ```
 *
 * ## One home per concept
 *
 * The issue lists seven fine controls, and three of them already exist
 * somewhere. Adding all seven here would have created a second place to set the
 * same number — the exact failure the issue is trying to fix elsewhere. So:
 *
 * | Control | Home | Why |
 * | --- | --- | --- |
 * | gain, gate, ceiling, mute, solo | **here**, new | nothing owned them |
 * | **attack** | existing `emaAlphas` | already on ControlState with Console UI |
 * | **release** | **here**, new | was a hardcoded constant, never operator-facing |
 * | **curve** | existing `bandCurves` | already exists and is already editable |
 *
 * `bandCurves` is the interesting one. The issue calls it "stored state, not a
 * control" — but it *is* edited in Console; it just only ever reached the
 * renderer, never the router. Reading it here means one curve control that now
 * affects both paths, rather than a second control that disagrees with the
 * first.
 */

import type { AudioCurveShape } from '../shared/osc-validation.ts';
import {
  type AudioEmaAlphas,
  type AudioFeatures,
  DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
} from './audio-ema.ts';

export const AUDIO_SHAPING_BANDS = ['energy', 'bass', 'mid', 'high', 'pulse'] as const;
export type AudioShapingBand = (typeof AUDIO_SHAPING_BANDS)[number];

/** Ceiling of the gain control. 4× turns a timid mic into a usable band. */
export const AUDIO_SHAPING_MAX_GAIN = 4;

export type AudioBandShaping = {
  /** Scale applied before the gate. 1 = unchanged. */
  gain: number;
  /** Noise floor: anything at or below reads as silence. */
  gate: number;
  /** Hard clip, applied after gain. Values above land here. */
  ceiling: number;
  /**
   * EMA alpha while the band is falling.
   *
   * Attack deliberately lives on `emaAlphas`, which already exists and already
   * has a Console control. Release was a module constant until now — a fast
   * band that snaps to zero between songs is the most common complaint about
   * the feature bus, and there was no way to fix it without a rebuild.
   */
  release: number;
  /** Contribute nothing, without disturbing the mapping set. */
  mute: boolean;
  /** When any band is soloed, only soloed bands contribute. */
  solo: boolean;
};

export type AudioShapingConfig = Record<AudioShapingBand, AudioBandShaping>;

/** Curves as stored on ControlState; `pulse` has never had one. */
export type AudioBandCurves = Partial<Record<AudioShapingBand, AudioCurveShape>>;

function defaultBand(band: AudioShapingBand): AudioBandShaping {
  return {
    gain: 1,
    gate: 0,
    ceiling: 1,
    release: DEFAULT_AUDIO_EMA_RELEASE_ALPHAS[band],
    mute: false,
    solo: false,
  };
}

/**
 * The identity configuration.
 *
 * Every value is chosen so that shaping is a no-op: gain 1, gate 0, ceiling 1,
 * and the release alphas the bridge already hardcoded. An operator who never
 * opens the panel gets identical behaviour to before this existed — the
 * non-regression requirement stated as code rather than as a promise.
 */
export function defaultAudioShaping(): AudioShapingConfig {
  return {
    energy: defaultBand('energy'),
    bass: defaultBand('bass'),
    mid: defaultBand('mid'),
    high: defaultBand('high'),
    pulse: defaultBand('pulse'),
  };
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n < min ? min : n > max ? max : n;
};

/** Normalise an untrusted config; unknown/absent fields fall back to identity. */
export function coerceAudioShaping(raw: unknown): AudioShapingConfig {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = defaultAudioShaping();
  for (const band of AUDIO_SHAPING_BANDS) {
    const entry =
      source[band] && typeof source[band] === 'object'
        ? (source[band] as Record<string, unknown>)
        : {};
    const fallback = out[band];
    out[band] = {
      gain: clamp(entry.gain, 0, AUDIO_SHAPING_MAX_GAIN, fallback.gain),
      gate: clamp(entry.gate, 0, 1, fallback.gate),
      ceiling: clamp(entry.ceiling, 0, 1, fallback.ceiling),
      // Shares the existing 0.01 floor: an alpha of 0 freezes a band forever,
      // which reads as a broken feed rather than as heavy smoothing.
      release: clamp(entry.release, 0.01, 1, fallback.release),
      mute: entry.mute === true,
      solo: entry.solo === true,
    };
  }
  return out;
}

/** Release alphas for `stepAudioEma`. */
export function releaseAlphasFrom(config: AudioShapingConfig): AudioEmaAlphas {
  return {
    energy: config.energy.release,
    bass: config.bass.release,
    mid: config.mid.release,
    high: config.high.release,
    pulse: config.pulse.release,
  };
}

/** True when at least one band is soloed. */
export function hasSolo(config: AudioShapingConfig): boolean {
  return AUDIO_SHAPING_BANDS.some((band) => config[band].solo);
}

function applyCurve(value: number, curve: AudioCurveShape | undefined): number {
  if (curve === 'exponential') return value * value;
  if (curve === 'logarithmic') return Math.sqrt(value < 0 ? 0 : value);
  return value;
}

/**
 * Shape one band. Exported so the tests can pin each stage independently.
 *
 * Order is deliberate: gain before gate so an operator can lift a quiet source
 * *into* the usable range and then cut the noise underneath it. Gating first
 * would throw away the signal they were about to amplify.
 */
export function shapeBand(
  value: number,
  shaping: AudioBandShaping,
  curve: AudioCurveShape | undefined,
  soloActive: boolean,
): number {
  if (shaping.mute) return 0;
  if (soloActive && !shaping.solo) return 0;

  const raw = Number.isFinite(value) ? value : 0;
  let out = (raw < 0 ? 0 : raw) * shaping.gain;
  // Gate is a floor, not a subtraction: below it the band is silent, above it
  // the value is untouched. Subtracting would move every mapping's response
  // curve as a side effect of setting a noise floor.
  if (out <= shaping.gate) return 0;
  if (out > shaping.ceiling) out = shaping.ceiling;
  return applyCurve(out, curve);
}

/**
 * Shape the whole feature set. Pure — returns a new object.
 *
 * `pulse` has no entry in `bandCurves` (it never has) and is passed through the
 * curve stage as linear rather than being given a curve control that nothing
 * else in the system knows about.
 */
export function shapeAudioFeatures(
  features: Readonly<AudioFeatures>,
  config: AudioShapingConfig,
  curves: AudioBandCurves = {},
): AudioFeatures {
  const soloActive = hasSolo(config);
  return {
    energy: shapeBand(features.energy, config.energy, curves.energy, soloActive),
    bass: shapeBand(features.bass, config.bass, curves.bass, soloActive),
    mid: shapeBand(features.mid, config.mid, curves.mid, soloActive),
    high: shapeBand(features.high, config.high, curves.high, soloActive),
    pulse: shapeBand(features.pulse, config.pulse, undefined, soloActive),
  };
}

/** True when the config would leave every feature untouched. */
export function isIdentityShaping(config: AudioShapingConfig): boolean {
  return AUDIO_SHAPING_BANDS.every((band) => {
    const entry = config[band];
    return (
      entry.gain === 1 &&
      entry.gate === 0 &&
      entry.ceiling === 1 &&
      !entry.mute &&
      !entry.solo &&
      entry.release === DEFAULT_AUDIO_EMA_RELEASE_ALPHAS[band]
    );
  });
}
