import type { AudioFeatures } from './audio-ema.ts';

// ──────────────────────────────────────────────────────────────────────────
// Audio-Control Router — Phase 1 of "Audio as the Only Controller"
// (design spike: docs/spikes/audio-as-controller.md)
//
// Maps smoothed audio feature scalars (energy/bass/mid/high/pulse) onto
// ControlState mutations so a live set can be driven by audio alone. The
// router never owns ControlState: it emits diffs through `merge`, and the
// bridge's coerceControlState clamps every field — the router output is never
// trusted directly.
//
// PHASE 2 (browser-native audio capture, NOT implemented here): a future
// `getUserMedia` + Web Audio source in the controls page can feed this same
// router by sending `/aurora/audio/features`. That path has a hard
// deployment constraint — `getUserMedia` only resolves in a SECURE CONTEXT
// (HTTPS origin or `localhost`). Serving the controls page from a bare LAN IP
// (e.g. `192.168.x.x:3001`) over plain HTTP makes capture fail. Any
// non-localhost deployment of Phase 2 must terminate TLS or use a localhost
// tunnel. See docs/spikes/audio-as-controller.md "Phase 2 → Blocker".
// ──────────────────────────────────────────────────────────────────────────

export type AudioMappingSource = keyof AudioFeatures;
export type AudioMappingMode = 'continuous' | 'threshold';

/**
 * How a mapping folds into a target another mapping already wrote this frame.
 *
 * Before this existed the answer was "whichever mapping is later in the array
 * silently wins", which is a real behaviour nobody chose — it made
 * `bass → depth` and `energy → depth` an accident rather than a technique.
 *
 * - `last`   — later mapping wins (the historical behaviour; still the default)
 * - `max`    — loudest contribution wins; the natural choice for two bands
 *              driving one visual, since neither cancels the other
 * - `sum`    — added and clamped by `coerceControlState`
 * - `min`    — quietest wins; useful for a duck
 */
export type AudioMappingCombine = 'last' | 'max' | 'sum' | 'min';

export const AUDIO_MAPPING_COMBINES: readonly AudioMappingCombine[] = ['last', 'max', 'sum', 'min'];

export type AudioMapping = {
  /** Which audio feature band drives this mapping. */
  source: AudioMappingSource;
  /** ControlState field name to write. Unknown targets are dropped by coerce. */
  target: string;
  /** "continuous": lerp target across [targetMin,targetMax]. "threshold": fire on rising edge. */
  mode: AudioMappingMode;
  /** continuous: output floor. */
  targetMin: number;
  /** continuous: output ceil. threshold (set mode): value written on rise. */
  targetMax: number;
  /** threshold: source level (0..1) that triggers a rising edge. */
  level: number;
  /** threshold: minimum ms between successive fires (rising-edge debounce). */
  offDelayMs: number;
  /** threshold: when true, increment the current target value by 1 (counter targets like flashVersion). */
  increment: boolean;
  /** How this mapping folds with another writing the same target this frame. */
  combine: AudioMappingCombine;
};

const SOURCES: ReadonlySet<string> = new Set(['energy', 'bass', 'mid', 'high', 'pulse']);

// Audio must never drive its own arm/disarm switches — that creates feedback loops.
// crossfade / deck modes / GPU shaders / showGpuPalette are operator-chosen layout —
// audio mappings must not override them.
const FORBIDDEN_MAPPING_TARGETS: ReadonlySet<string> = new Set([
  'audioControlMode',
  'audioTransientAutomation',
  'crossfade',
  'deckAMode',
  'deckBMode',
  'deckAPresetSlug',
  'deckBPresetSlug',
  'activeShader',
  'deckAGpuShader',
  'deckBGpuShader',
  'showGpuPalette',
]);

// Continuous mappings only emit when the output moves more than this, so a
// steady audio level does not spam mergeControlState with no-op broadcasts.
const CONTINUOUS_EPSILON = 0.001;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Normalise an untrusted JSON value (e.g. audio-mappings.json) into a clean
 * AudioMapping[]. Invalid entries are dropped so a malformed config degrades
 * gracefully rather than throwing. Missing optional fields take sane defaults.
 */
export function parseAudioMappings(raw: unknown): AudioMapping[] {
  if (!Array.isArray(raw)) return [];
  const out: AudioMapping[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (!SOURCES.has(String(e.source))) continue;
    if (typeof e.target !== 'string' || e.target.length === 0) continue;
    if (FORBIDDEN_MAPPING_TARGETS.has(e.target)) continue;
    const mode = e.mode === 'threshold' ? 'threshold' : 'continuous';
    out.push({
      source: e.source as AudioMappingSource,
      target: e.target,
      mode,
      targetMin: num(e.targetMin, 0),
      targetMax: num(e.targetMax, 1),
      level: clamp01(num(e.level, 0.5)),
      offDelayMs: Math.max(0, num(e.offDelayMs, 200)),
      increment: e.increment === true,
      combine: (AUDIO_MAPPING_COMBINES as readonly string[]).includes(String(e.combine))
        ? (e.combine as AudioMappingCombine)
        : 'last',
    });
  }
  return out;
}

export type AudioControlRouter = {
  setMappings(mappings: AudioMapping[]): void;
  setEnabled(enabled: boolean): void;
  isActive(): boolean;
  onFeatures(features: Readonly<AudioFeatures>, nowMs: number): boolean;
};

/**
 * Create a stateful audio→control router.
 *
 * `merge` receives a diff to fold into ControlState (same target as every other
 * state mutation). `getState` reads the current ControlState, used for
 * increment-mode counter targets (e.g. flashVersion + 1).
 *
 * The router is inert until both `setEnabled(true)` is called (mirrors
 * ControlState.audioControlMode) and at least one mapping is configured.
 */
export function makeAudioControlRouter(
  merge: (diff: Record<string, unknown>) => void,
  getState: () => Record<string, unknown>,
): AudioControlRouter {
  let mappings: AudioMapping[] = [];
  let enabled = false;
  // Per-mapping edge state, parallel to `mappings`.
  let wasAbove: boolean[] = [];
  let lastFiredMs: number[] = [];
  let lastOutput: number[] = [];
  /**
   * Targets written by more than one continuous mapping.
   *
   * These skip the no-op suppression below: a `max` pair whose quiet half is
   * steady would otherwise fold against nothing and the target would follow
   * only the half that happened to move this frame.
   */
  let contested: Set<string> = new Set();

  const resetEdgeState = () => {
    wasAbove = mappings.map(() => false);
    lastFiredMs = mappings.map(() => -Infinity);
    lastOutput = mappings.map(() => Number.NaN);
    const seen = new Set<string>();
    contested = new Set();
    for (const m of mappings) {
      if (m.mode !== 'continuous') continue;
      if (seen.has(m.target)) contested.add(m.target);
      seen.add(m.target);
    }
  };

  return {
    setMappings(next) {
      mappings = next;
      resetEdgeState();
    },
    setEnabled(next) {
      enabled = next;
    },
    isActive() {
      return enabled && mappings.length > 0;
    },
    onFeatures(features, nowMs) {
      if (!enabled || mappings.length === 0) return false;

      let diff: Record<string, unknown> | null = null;
      const state = getState();

      /**
       * Fold a mapping's output into the frame's diff.
       *
       * Without this, two mappings on one target meant "later index wins" —
       * behaviour nobody chose and nobody could rely on. `combine` makes the
       * resolution explicit and per-mapping; `coerceControlState` still clamps
       * whatever comes out, so `sum` cannot push a field out of range.
       */
      const write = (target: string, value: number, combine: AudioMappingCombine) => {
        diff ??= {};
        const prior = diff[target];
        if (typeof prior !== 'number' || combine === 'last') {
          diff[target] = value;
          return;
        }
        diff[target] =
          combine === 'max'
            ? Math.max(prior, value)
            : combine === 'min'
              ? Math.min(prior, value)
              : prior + value;
      };

      for (let i = 0; i < mappings.length; i++) {
        const m = mappings[i];
        if (!m) continue;
        const raw = num(features[m.source], 0);

        if (m.mode === 'continuous') {
          const out = m.targetMin + (m.targetMax - m.targetMin) * clamp01(raw);
          const prev = lastOutput[i] ?? Number.NaN;
          // A mapping that has not moved still has to participate in the fold,
          // or a `max` pair would drop to whichever half happened to move.
          const moved = Number.isNaN(prev) || Math.abs(out - prev) > CONTINUOUS_EPSILON;
          lastOutput[i] = out;
          if (moved || contested.has(m.target)) write(m.target, out, m.combine);
          continue;
        }

        // threshold: fire once per rising edge above `level`, debounced.
        const above = raw >= m.level;
        const rising = above && !wasAbove[i];
        wasAbove[i] = above;
        if (!rising) continue;
        if (nowMs - (lastFiredMs[i] ?? -Infinity) < m.offDelayMs) continue;
        lastFiredMs[i] = nowMs;
        // Increment targets are counters: folding two writes with `max` would
        // silently drop one bump, so they always take the running value.
        if (m.increment) {
          diff ??= {};
          diff[m.target] = num(state[m.target], 0) + 1;
        } else {
          write(m.target, m.targetMax, m.combine);
        }
      }

      if (!diff) return false;
      merge(diff);
      return true;
    },
  };
}
