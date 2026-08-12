/**
 * Audio Reactivity Mapping v1 — the author-facing contract for wiring live
 * audio features onto a pack's own parameters (issue #284).
 *
 * ## Why this exists
 *
 * Audio reactivity was real but split across five surfaces with no shared
 * vocabulary: pack-v1 handed authors a raw `audio_uniforms` vec4 and left the
 * math inside WGSL; the bridge's `AudioMapping` targeted *show-global*
 * `ControlState`; Studio knobs were a third thing; Three.js packages read a
 * different bus again. So every pack reinvented "how bass drives my swirl",
 * Studio could not preview the mapping the show would run, and nothing about a
 * pack's reactivity was inspectable without reading its shader.
 *
 * This module is the schema *and* the evaluator, in one place, as pure
 * functions. Studio preview and the show path import the same `evaluate` — the
 * only way "identical semantics" survives contact with two renderers.
 *
 * ## Scope: pack-local, deliberately
 *
 * Targets are the seven knobs a pack already owns (`pack_drive` + palette
 * knobs). Mappings **cannot** write `ControlState`. A pack is a look, not a
 * show: letting one reach into crossfade, deck selection, or cue state would
 * make *installing* it a show-wide side effect, and would re-open exactly the
 * feedback loops `FORBIDDEN_MAPPING_TARGETS` closes on the router side. The
 * show-global direction stays with `bridge/audio-control-router.ts` (#285);
 * these two meet at the feature bus, not at the targets.
 *
 * ## Relationship to raw `audio_uniforms`
 *
 * Additive. A pack that reads binding 2 and does its own math is still valid
 * and still works — `mappings.json` is optional, and a package without one
 * behaves exactly as before. Declaring mappings is how you get knobs an
 * operator can see, a preview that matches the show, and reactivity that
 * survives being read by something other than a WGSL compiler.
 */

/** Bumped only for a breaking change. New sources/curves are additive within v1. */
export const AUDIO_MAPPING_SCHEMA_VERSION = 1 as const;

/** Archive member name; sits beside `manifest.json`. */
export const AUDIO_MAPPING_FILE = 'mappings.json' as const;

/**
 * Feature ids an author may reference.
 *
 * Matches `AudioFeatures` in `bridge/audio-ema.ts` — one vocabulary, so a
 * mapping means the same thing wherever features come from (mic, AbletonOSC,
 * demo audio). Adding a feature here is additive: an existing pack cannot
 * reference an id that did not exist when it was written.
 */
export const AUDIO_MAPPING_SOURCES = ['energy', 'bass', 'mid', 'high', 'pulse'] as const;
export type AudioMappingSource = (typeof AUDIO_MAPPING_SOURCES)[number];

/**
 * Pack-local knobs a mapping may drive.
 *
 * These are the fields of `AuroraPackageDefaults`, which is not a coincidence:
 * a mapping animates the same knob the operator sets, so "what can audio drive"
 * and "what can a human drive" are the same list. All are 0..1.
 */
export const AUDIO_MAPPING_TARGETS = [
  'intensity',
  'depth',
  'feedback',
  'speed',
  'hue',
  'sat',
  'bright',
] as const;
export type AudioMappingTarget = (typeof AUDIO_MAPPING_TARGETS)[number];

export const AUDIO_MAPPING_MODES = ['continuous', 'threshold'] as const;
export type AudioMappingMode = (typeof AUDIO_MAPPING_MODES)[number];

export const AUDIO_MAPPING_CURVES = ['linear', 'exp', 'log', 'smoothstep'] as const;
export type AudioMappingCurve = (typeof AUDIO_MAPPING_CURVES)[number];

/**
 * How a mapping's contribution folds into the value already on the knob.
 *
 * The operator knob is the base in every case — audio decorates a look the
 * operator chose, it does not silently take the look over. `replace` is the
 * escape hatch for a pack whose knob is meaningless without audio.
 */
export const AUDIO_MAPPING_COMBINES = ['add', 'max', 'replace'] as const;
export type AudioMappingCombine = (typeof AUDIO_MAPPING_COMBINES)[number];

/** Longest smoothing time constant, at `smooth: 1`. */
export const AUDIO_MAPPING_MAX_SMOOTH_MS = 500;

/** Guard against a pathological manifest; far above any real pack. */
export const AUDIO_MAPPING_MAX_ENTRIES = 32;

/**
 * Longest frame delta smoothing will honour.
 *
 * A backgrounded tab or a stalled compile can hand the evaluator a multi-second
 * gap; integrating that literally snaps every envelope to its target and the
 * projector jumps the moment it comes back. Clamping treats a stall as a slow
 * frame instead. Above this, smoothing is no longer time-accurate — which only
 * matters when nothing was being drawn anyway.
 */
export const AUDIO_MAPPING_MAX_FRAME_MS = 250;

export type AudioMapping = {
  source: AudioMappingSource;
  target: AudioMappingTarget;
  mode: AudioMappingMode;
  /** Input window on the 0..1 feature. Values outside clamp to the edges. */
  inMin: number;
  inMax: number;
  /** Output range the normalised input is mapped across. */
  outMin: number;
  outMax: number;
  curve: AudioMappingCurve;
  /** 0 = instant, 1 = ~500 ms time constant. Frame-rate independent. */
  smooth: number;
  /** Flip the normalised input before the curve. */
  invert: boolean;
  combine: AudioMappingCombine;
  /** threshold: normalised input level that fires a rising edge. */
  level: number;
  /** threshold: how long the fired value is held before it decays back. */
  holdMs: number;
};

export type AudioMappingSet = {
  version: typeof AUDIO_MAPPING_SCHEMA_VERSION;
  mappings: AudioMapping[];
};

export type AudioMappingError = { path: string; message: string };

export type AudioMappingValidation =
  | { ok: true; value: AudioMappingSet }
  | { ok: false; errors: AudioMappingError[] };

/** The feature bus as the evaluator sees it. All 0..1 except the idle sentinel. */
export type AudioMappingFeatures = {
  energy: number;
  bass: number;
  mid: number;
  high: number;
  pulse: number;
};

/** Knob values, before audio. Missing keys default to 0. */
export type AudioMappingKnobs = Partial<Record<AudioMappingTarget, number>>;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ──────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parse an untrusted `mappings.json` into a clean set.
 *
 * Unlike the operator-facing router — which drops bad rows so a hand-edited
 * config degrades rather than throws — an author's mapping file is *build
 * output*, and silently ignoring a typo'd target means shipping a pack whose
 * reactivity quietly does nothing. Every problem is an error with a path.
 */
export function validateAudioMappings(raw: unknown): AudioMappingValidation {
  const errors: AudioMappingError[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: AUDIO_MAPPING_FILE, message: 'must be an object' }] };
  }
  if (raw.version !== AUDIO_MAPPING_SCHEMA_VERSION) {
    errors.push({
      path: 'version',
      message: `must be ${AUDIO_MAPPING_SCHEMA_VERSION}`,
    });
  }
  if (!Array.isArray(raw.mappings)) {
    errors.push({ path: 'mappings', message: 'must be an array' });
    return { ok: false, errors };
  }
  if (raw.mappings.length > AUDIO_MAPPING_MAX_ENTRIES) {
    errors.push({
      path: 'mappings',
      message: `at most ${AUDIO_MAPPING_MAX_ENTRIES} mappings`,
    });
  }

  const mappings: AudioMapping[] = [];
  raw.mappings.forEach((entry: unknown, index: number) => {
    const at = (field: string) => `mappings[${index}].${field}`;
    if (!isRecord(entry)) {
      errors.push({ path: `mappings[${index}]`, message: 'must be an object' });
      return;
    }

    const source = entry.source;
    if (!AUDIO_MAPPING_SOURCES.includes(source as AudioMappingSource)) {
      errors.push({
        path: at('source'),
        message: `must be one of ${AUDIO_MAPPING_SOURCES.join(', ')}`,
      });
    }
    const target = entry.target;
    if (!AUDIO_MAPPING_TARGETS.includes(target as AudioMappingTarget)) {
      errors.push({
        path: at('target'),
        message: `must be one of ${AUDIO_MAPPING_TARGETS.join(', ')}`,
      });
    }

    const mode = entry.mode === undefined ? 'continuous' : entry.mode;
    if (!AUDIO_MAPPING_MODES.includes(mode as AudioMappingMode)) {
      errors.push({
        path: at('mode'),
        message: `must be one of ${AUDIO_MAPPING_MODES.join(', ')}`,
      });
    }
    const curve = entry.curve === undefined ? 'linear' : entry.curve;
    if (!AUDIO_MAPPING_CURVES.includes(curve as AudioMappingCurve)) {
      errors.push({
        path: at('curve'),
        message: `must be one of ${AUDIO_MAPPING_CURVES.join(', ')}`,
      });
    }
    const combine = entry.combine === undefined ? 'add' : entry.combine;
    if (!AUDIO_MAPPING_COMBINES.includes(combine as AudioMappingCombine)) {
      errors.push({
        path: at('combine'),
        message: `must be one of ${AUDIO_MAPPING_COMBINES.join(', ')}`,
      });
    }

    const number = (field: string, fallback: number): number => {
      const value = entry[field];
      if (value === undefined) return fallback;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push({ path: at(field), message: 'must be a finite number' });
        return fallback;
      }
      return value;
    };

    const inMin = clamp01(number('inMin', 0));
    const inMax = clamp01(number('inMax', 1));
    if (inMin === inMax) {
      // A zero-width window makes normalisation undefined and the mapping a
      // constant — almost always a typo rather than an intent.
      errors.push({ path: at('inMax'), message: 'inMin and inMax must differ' });
    }

    const invert = entry.invert === undefined ? false : entry.invert;
    if (typeof invert !== 'boolean') {
      errors.push({ path: at('invert'), message: 'must be a boolean' });
    }

    mappings.push({
      source: source as AudioMappingSource,
      target: target as AudioMappingTarget,
      mode: mode as AudioMappingMode,
      inMin,
      inMax,
      outMin: clamp01(number('outMin', 0)),
      outMax: clamp01(number('outMax', 1)),
      curve: curve as AudioMappingCurve,
      smooth: clamp01(number('smooth', 0)),
      invert: invert === true,
      combine: combine as AudioMappingCombine,
      level: clamp01(number('level', 0.5)),
      holdMs: Math.max(0, number('holdMs', 120)),
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { version: AUDIO_MAPPING_SCHEMA_VERSION, mappings } };
}

/** An empty, valid set — what a package with no `mappings.json` evaluates as. */
export function emptyAudioMappingSet(): AudioMappingSet {
  return { version: AUDIO_MAPPING_SCHEMA_VERSION, mappings: [] };
}

// ──────────────────────────────────────────────────────────────────────────
// Evaluation
// ──────────────────────────────────────────────────────────────────────────

function applyCurve(x: number, curve: AudioMappingCurve): number {
  switch (curve) {
    case 'exp':
      return x * x;
    case 'log':
      return Math.sqrt(x);
    case 'smoothstep':
      return x * x * (3 - 2 * x);
    default:
      return x;
  }
}

/**
 * True when the feature bus is reporting "no audio".
 *
 * `energy === -1` is the pack-v1 idle sentinel, and it is load-bearing: without
 * this check a silent room reads as `energy: 0`, every mapping contributes its
 * `outMin`, and an idle projector sits at a look nobody chose. Idle means the
 * operator's knobs pass through untouched.
 */
export function isIdleAudio(features: Pick<AudioMappingFeatures, 'energy'>): boolean {
  return !(features.energy >= 0);
}

export type AudioMappingEvaluator = {
  /** Effective knob values for this frame. Never mutates its inputs. */
  evaluate(
    features: AudioMappingFeatures,
    knobs: AudioMappingKnobs,
    nowMs: number,
  ): Record<AudioMappingTarget, number>;
  /** Drop smoothing/edge state (pack swap, preview restart). */
  reset(): void;
};

/**
 * Build a stateful evaluator for one mapping set.
 *
 * State is per-mapping smoothing and threshold edges, which is why this is a
 * factory rather than a bare function: two decks running the same pack need
 * independent envelopes.
 */
export function createAudioMappingEvaluator(set: AudioMappingSet): AudioMappingEvaluator {
  const mappings = set.mappings;
  let smoothed: number[] = mappings.map(() => Number.NaN);
  let firedAt: number[] = mappings.map(() => Number.NEGATIVE_INFINITY);
  let wasAbove: boolean[] = mappings.map(() => false);
  let lastMs = Number.NaN;

  const reset = () => {
    smoothed = mappings.map(() => Number.NaN);
    firedAt = mappings.map(() => Number.NEGATIVE_INFINITY);
    wasAbove = mappings.map(() => false);
    lastMs = Number.NaN;
  };

  return {
    reset,
    evaluate(features, knobs, nowMs) {
      const out = {} as Record<AudioMappingTarget, number>;
      for (const target of AUDIO_MAPPING_TARGETS) {
        out[target] = clamp01(knobs[target] ?? 0);
      }
      if (mappings.length === 0) return out;

      // Frame-rate independent smoothing: a mapping tuned on a 120 Hz preview
      // must not turn to mush on a 30 Hz projector.
      const dt = Number.isNaN(lastMs)
        ? 16.7
        : Math.max(0, Math.min(AUDIO_MAPPING_MAX_FRAME_MS, nowMs - lastMs));
      lastMs = nowMs;

      if (isIdleAudio(features)) {
        reset();
        lastMs = nowMs;
        return out;
      }

      for (let i = 0; i < mappings.length; i += 1) {
        const m = mappings[i];
        if (!m) continue;
        const raw = features[m.source];
        const level = Number.isFinite(raw) ? clamp01(raw) : 0;

        // Normalise into the author's input window.
        const span = m.inMax - m.inMin;
        let x = clamp01((level - m.inMin) / span);
        if (m.invert) x = 1 - x;

        let contribution: number;
        if (m.mode === 'continuous') {
          contribution = m.outMin + (m.outMax - m.outMin) * applyCurve(x, m.curve);
        } else {
          // threshold: a rising edge through `level` snaps to outMax and holds,
          // then falls back to outMin. Hold is what makes a kick visible at all
          // — a single frame at full value is not perceivable.
          const above = x >= m.level;
          const rising = above && !wasAbove[i];
          wasAbove[i] = above;
          if (rising) firedAt[i] = nowMs;
          const held = nowMs - (firedAt[i] ?? Number.NEGATIVE_INFINITY) < m.holdMs;
          contribution = held ? m.outMax : m.outMin;
        }

        // Smoothing is applied to the contribution, not the final knob, so one
        // mapping's envelope cannot drag another's.
        if (m.smooth > 0) {
          const tau = m.smooth * AUDIO_MAPPING_MAX_SMOOTH_MS;
          const prev = smoothed[i];
          const k = 1 - Math.exp(-dt / tau);
          const next = Number.isNaN(prev ?? Number.NaN)
            ? contribution
            : (prev as number) + (contribution - (prev as number)) * k;
          smoothed[i] = next;
          contribution = next;
        } else {
          smoothed[i] = contribution;
        }

        const base = out[m.target];
        out[m.target] =
          m.combine === 'replace'
            ? clamp01(contribution)
            : m.combine === 'max'
              ? clamp01(Math.max(base, contribution))
              : clamp01(base + contribution);
      }

      return out;
    },
  };
}

/**
 * Reference set, and the default for new Studio sketches.
 *
 * Deliberately built to animate the *existing* pack-v1 authoring template with
 * no shader change at all: that template already reads `pack_drive.x/.y` as
 * intensity and depth, so these three rows turn a static look into a reactive
 * one purely by declaration. That is the whole argument for the schema — the
 * reactivity a pack ships with should be data an operator and a tool can read,
 * not arithmetic buried in WGSL.
 *
 * The tuning is also the house style worth copying:
 * - energy → intensity as a gentle lift *on top of* the knob (`add`), so the
 *   operator still sets the floor.
 * - bass → depth with `exp`, because a linear bass map feels mushy: the curve
 *   keeps low rumble quiet and lets kicks read.
 * - pulse → bright as a short threshold hit, smoothed just enough to be a
 *   flash rather than a strobe.
 */
export const AUDIO_MAPPING_REFERENCE: AudioMappingSet = {
  version: AUDIO_MAPPING_SCHEMA_VERSION,
  mappings: [
    {
      source: 'energy',
      target: 'intensity',
      mode: 'continuous',
      inMin: 0.05,
      inMax: 0.9,
      outMin: 0,
      outMax: 0.3,
      curve: 'smoothstep',
      smooth: 0.35,
      invert: false,
      combine: 'add',
      level: 0.5,
      holdMs: 120,
    },
    {
      source: 'bass',
      target: 'depth',
      mode: 'continuous',
      inMin: 0.1,
      inMax: 0.85,
      outMin: 0,
      outMax: 0.45,
      curve: 'exp',
      smooth: 0.15,
      invert: false,
      combine: 'add',
      level: 0.5,
      holdMs: 120,
    },
    {
      source: 'pulse',
      target: 'bright',
      mode: 'threshold',
      inMin: 0,
      inMax: 1,
      outMin: 0,
      outMax: 0.25,
      curve: 'linear',
      smooth: 0.2,
      invert: false,
      combine: 'add',
      level: 0.6,
      holdMs: 90,
    },
  ],
};
