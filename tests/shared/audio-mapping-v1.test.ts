import { describe, expect, test } from 'vitest';
import {
  AUDIO_MAPPING_FILE,
  AUDIO_MAPPING_MAX_ENTRIES,
  AUDIO_MAPPING_MAX_FRAME_MS,
  AUDIO_MAPPING_MAX_SMOOTH_MS,
  AUDIO_MAPPING_REFERENCE,
  AUDIO_MAPPING_SCHEMA_VERSION,
  AUDIO_MAPPING_TARGETS,
  type AudioMapping,
  type AudioMappingFeatures,
  type AudioMappingSet,
  createAudioMappingEvaluator,
  emptyAudioMappingSet,
  isIdleAudio,
  validateAudioMappings,
} from '../../shared/audio-mapping-v1.ts';

function mapping(overrides: Partial<AudioMapping> = {}): AudioMapping {
  return {
    source: 'bass',
    target: 'depth',
    mode: 'continuous',
    inMin: 0,
    inMax: 1,
    outMin: 0,
    outMax: 1,
    curve: 'linear',
    smooth: 0,
    invert: false,
    combine: 'add',
    level: 0.5,
    holdMs: 100,
    ...overrides,
  };
}

function setOf(...mappings: AudioMapping[]): AudioMappingSet {
  return { version: AUDIO_MAPPING_SCHEMA_VERSION, mappings };
}

function features(overrides: Partial<AudioMappingFeatures> = {}): AudioMappingFeatures {
  return { energy: 0.5, bass: 0.5, mid: 0.5, high: 0.5, pulse: 0, ...overrides };
}

// ──────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────

describe('validateAudioMappings', () => {
  test('accepts a minimal declaration and fills defaults', () => {
    const result = validateAudioMappings({
      version: 1,
      mappings: [{ source: 'bass', target: 'depth' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mappings[0]).toMatchObject({
      source: 'bass',
      target: 'depth',
      mode: 'continuous',
      curve: 'linear',
      combine: 'add',
      smooth: 0,
      invert: false,
    });
  });

  test('rejects a typo’d target rather than silently dropping the row', () => {
    // The whole failure this schema exists to prevent: a pack that ships with
    // reactivity that quietly does nothing.
    const result = validateAudioMappings({
      version: 1,
      mappings: [{ source: 'bass', target: 'intesnity' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.path).toBe('mappings[0].target');
  });

  test('rejects an unknown source id', () => {
    const result = validateAudioMappings({
      version: 1,
      mappings: [{ source: 'subbass', target: 'depth' }],
    });
    expect(result.ok).toBe(false);
  });

  test('refuses to let a pack reach show-global state', () => {
    // ControlState fields are not in AUDIO_MAPPING_TARGETS, so naming one is
    // an ordinary unknown-target error — the boundary is structural, not a
    // blocklist that has to be kept in sync.
    for (const forbidden of ['crossfade', 'deckAMode', 'flashVersion', 'audioControlMode']) {
      const result = validateAudioMappings({
        version: 1,
        mappings: [{ source: 'energy', target: forbidden }],
      });
      expect(result.ok).toBe(false);
    }
  });

  test('rejects a wrong schema version', () => {
    const result = validateAudioMappings({ version: 2, mappings: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.path === 'version')).toBe(true);
  });

  test('rejects a zero-width input window', () => {
    const result = validateAudioMappings({
      version: 1,
      mappings: [{ source: 'bass', target: 'depth', inMin: 0.4, inMax: 0.4 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.path).toBe('mappings[0].inMax');
  });

  test('rejects non-finite numbers and non-boolean invert', () => {
    const nan = validateAudioMappings({
      version: 1,
      mappings: [{ source: 'bass', target: 'depth', smooth: Number.NaN }],
    });
    expect(nan.ok).toBe(false);

    const invert = validateAudioMappings({
      version: 1,
      mappings: [{ source: 'bass', target: 'depth', invert: 'yes' }],
    });
    expect(invert.ok).toBe(false);
  });

  test('clamps out-of-range levels into 0..1 rather than failing', () => {
    const result = validateAudioMappings({
      version: 1,
      mappings: [{ source: 'bass', target: 'depth', outMin: -3, outMax: 12 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mappings[0]).toMatchObject({ outMin: 0, outMax: 1 });
  });

  test('caps the number of mappings', () => {
    const result = validateAudioMappings({
      version: 1,
      mappings: Array.from({ length: AUDIO_MAPPING_MAX_ENTRIES + 1 }, () => ({
        source: 'bass',
        target: 'depth',
      })),
    });
    expect(result.ok).toBe(false);
  });

  test('reports the file itself for a non-object payload', () => {
    const result = validateAudioMappings([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.path).toBe(AUDIO_MAPPING_FILE);
  });

  test('the shipped reference set validates', () => {
    expect(validateAudioMappings(AUDIO_MAPPING_REFERENCE).ok).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Evaluation
// ──────────────────────────────────────────────────────────────────────────

describe('evaluate — idle audio', () => {
  test('the energy −1 sentinel leaves every knob exactly as the operator set it', () => {
    // Without this, a silent room reads as energy 0, every mapping contributes
    // its outMin, and an idle projector sits at a look nobody chose.
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ source: 'energy', target: 'intensity', outMin: 0.4, combine: 'replace' })),
    );
    const out = evaluator.evaluate(features({ energy: -1 }), { intensity: 0.7 }, 0);
    expect(out.intensity).toBe(0.7);
  });

  test('isIdleAudio treats any negative energy as idle', () => {
    expect(isIdleAudio({ energy: -1 })).toBe(true);
    expect(isIdleAudio({ energy: -0.001 })).toBe(true);
    expect(isIdleAudio({ energy: 0 })).toBe(false);
    expect(isIdleAudio({ energy: Number.NaN })).toBe(true);
  });
});

describe('evaluate — continuous', () => {
  test('maps the input window across the output range', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ inMin: 0.2, inMax: 0.6, outMin: 0, outMax: 1, combine: 'replace' })),
    );
    expect(evaluator.evaluate(features({ bass: 0.4 }), {}, 0).depth).toBeCloseTo(0.5, 5);
  });

  test('clamps outside the window instead of extrapolating', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ inMin: 0.2, inMax: 0.6, combine: 'replace' })),
    );
    expect(evaluator.evaluate(features({ bass: 0 }), {}, 0).depth).toBe(0);
    expect(evaluator.evaluate(features({ bass: 1 }), {}, 16).depth).toBe(1);
  });

  test('invert flips the normalised input', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ invert: true, combine: 'replace' })),
    );
    expect(evaluator.evaluate(features({ bass: 0.25 }), {}, 0).depth).toBeCloseTo(0.75, 5);
  });

  test('curves shape the response', () => {
    const at = (curve: AudioMapping['curve']) =>
      createAudioMappingEvaluator(setOf(mapping({ curve, combine: 'replace' }))).evaluate(
        features({ bass: 0.5 }),
        {},
        0,
      ).depth;
    expect(at('linear')).toBeCloseTo(0.5, 5);
    expect(at('exp')).toBeCloseTo(0.25, 5);
    expect(at('log')).toBeCloseTo(Math.SQRT1_2, 5);
    expect(at('smoothstep')).toBeCloseTo(0.5, 5);
  });
});

describe('evaluate — combine rules', () => {
  const run = (combine: AudioMapping['combine'], knob: number, bass: number) =>
    createAudioMappingEvaluator(setOf(mapping({ combine, outMax: 0.5 }))).evaluate(
      features({ bass }),
      { depth: knob },
      0,
    ).depth;

  test('add lifts the operator knob', () => {
    expect(run('add', 0.3, 1)).toBeCloseTo(0.8, 5);
  });

  test('max never drops below the knob', () => {
    expect(run('max', 0.6, 1)).toBeCloseTo(0.6, 5);
    expect(run('max', 0.1, 1)).toBeCloseTo(0.5, 5);
  });

  test('replace hands the knob over entirely', () => {
    expect(run('replace', 0.9, 1)).toBeCloseTo(0.5, 5);
  });

  test('the result is always clamped to 0..1', () => {
    expect(run('add', 0.9, 1)).toBe(1);
  });

  test('two mappings on one target fold in declaration order', () => {
    // The documented conflict rule: deterministic, and explainable to an author
    // reading their own file top to bottom.
    const evaluator = createAudioMappingEvaluator(
      setOf(
        mapping({ source: 'bass', combine: 'add', outMax: 0.3 }),
        mapping({ source: 'mid', combine: 'replace', outMax: 0.2 }),
      ),
    );
    expect(evaluator.evaluate(features({ bass: 1, mid: 1 }), { depth: 0.5 }, 0).depth).toBeCloseTo(
      0.2,
      5,
    );
  });

  test('untargeted knobs pass through untouched', () => {
    const evaluator = createAudioMappingEvaluator(setOf(mapping()));
    const out = evaluator.evaluate(features(), { intensity: 0.42, speed: 0.11 }, 0);
    expect(out.intensity).toBeCloseTo(0.42, 5);
    expect(out.speed).toBeCloseTo(0.11, 5);
  });

  test('every target is present in the result', () => {
    const out = createAudioMappingEvaluator(emptyAudioMappingSet()).evaluate(features(), {}, 0);
    for (const target of AUDIO_MAPPING_TARGETS) expect(out[target]).toBe(0);
  });
});

describe('evaluate — threshold', () => {
  test('fires on a rising edge and holds', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(
        mapping({
          source: 'pulse',
          target: 'bright',
          mode: 'threshold',
          level: 0.6,
          holdMs: 100,
          outMin: 0,
          outMax: 1,
          combine: 'replace',
        }),
      ),
    );
    expect(evaluator.evaluate(features({ pulse: 0.1 }), {}, 0).bright).toBe(0);
    expect(evaluator.evaluate(features({ pulse: 0.9 }), {}, 16).bright).toBe(1);
    // Still held while the source stays high…
    expect(evaluator.evaluate(features({ pulse: 0.9 }), {}, 80).bright).toBe(1);
    // …and released once the hold elapses, even though it never fell.
    expect(evaluator.evaluate(features({ pulse: 0.9 }), {}, 200).bright).toBe(0);
  });

  test('does not re-fire without falling below the level first', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(
        mapping({
          source: 'pulse',
          target: 'bright',
          mode: 'threshold',
          level: 0.6,
          holdMs: 50,
          combine: 'replace',
        }),
      ),
    );
    evaluator.evaluate(features({ pulse: 0.9 }), {}, 0);
    expect(evaluator.evaluate(features({ pulse: 0.9 }), {}, 100).bright).toBe(0);
    evaluator.evaluate(features({ pulse: 0.1 }), {}, 120);
    expect(evaluator.evaluate(features({ pulse: 0.9 }), {}, 140).bright).toBe(1);
  });
});

describe('evaluate — smoothing', () => {
  test('approaches the target rather than snapping', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ smooth: 1, combine: 'replace', outMax: 1 })),
    );
    // First frame seeds the envelope at the current contribution.
    expect(evaluator.evaluate(features({ bass: 0 }), {}, 0).depth).toBe(0);
    const first = evaluator.evaluate(features({ bass: 1 }), {}, 16).depth;
    const second = evaluator.evaluate(features({ bass: 1 }), {}, 32).depth;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    expect(second).toBeGreaterThan(first);
  });

  test('is frame-rate independent — one 100 ms step matches six 16 ms steps', () => {
    // A mapping tuned on a 120 Hz preview must not turn to mush on a 30 Hz
    // projector, which is exactly what a per-frame alpha would do.
    const build = () =>
      createAudioMappingEvaluator(setOf(mapping({ smooth: 0.5, combine: 'replace' })));

    const coarse = build();
    coarse.evaluate(features({ bass: 0 }), {}, 0);
    const coarseValue = coarse.evaluate(features({ bass: 1 }), {}, 96).depth;

    const fine = build();
    fine.evaluate(features({ bass: 0 }), {}, 0);
    let fineValue = 0;
    for (let t = 16; t <= 96; t += 16) {
      fineValue = fine.evaluate(features({ bass: 1 }), {}, t).depth;
    }
    expect(fineValue).toBeCloseTo(coarseValue, 2);
  });

  test('smooth: 1 is the documented maximum time constant', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ smooth: 1, combine: 'replace' })),
    );
    evaluator.evaluate(features({ bass: 0 }), {}, 0);
    // Stepped at real frame intervals: after one time constant the envelope
    // should be 1 - 1/e of the way there.
    let value = 0;
    for (let t = 16; t <= AUDIO_MAPPING_MAX_SMOOTH_MS; t += 16) {
      value = evaluator.evaluate(features({ bass: 1 }), {}, t).depth;
    }
    expect(value).toBeCloseTo(1 - Math.exp(-1), 1);
  });

  test('a stalled frame is treated as a slow one, not a jump cut', () => {
    // A backgrounded tab hands back a multi-second delta; integrating it
    // literally snaps every envelope and the projector lurches on return.
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ smooth: 1, combine: 'replace' })),
    );
    evaluator.evaluate(features({ bass: 0 }), {}, 0);
    const afterStall = evaluator.evaluate(features({ bass: 1 }), {}, 30_000).depth;
    expect(afterStall).toBeCloseTo(
      1 - Math.exp(-AUDIO_MAPPING_MAX_FRAME_MS / AUDIO_MAPPING_MAX_SMOOTH_MS),
      3,
    );
    expect(afterStall).toBeLessThan(0.5);
  });

  test('going idle clears the envelope so the next onset starts clean', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ smooth: 0.8, combine: 'replace' })),
    );
    evaluator.evaluate(features({ bass: 1 }), {}, 0);
    evaluator.evaluate(features({ bass: 1 }), {}, 100);
    evaluator.evaluate(features({ energy: -1 }), {}, 200);
    expect(evaluator.evaluate(features({ bass: 0 }), {}, 216).depth).toBe(0);
  });

  test('reset drops state without rebuilding the evaluator', () => {
    const evaluator = createAudioMappingEvaluator(
      setOf(mapping({ smooth: 0.8, combine: 'replace' })),
    );
    evaluator.evaluate(features({ bass: 1 }), {}, 0);
    evaluator.evaluate(features({ bass: 1 }), {}, 500);
    evaluator.reset();
    expect(evaluator.evaluate(features({ bass: 0 }), {}, 516).depth).toBe(0);
  });
});

describe('the reference set', () => {
  test('animates the stock template knobs without touching its WGSL', () => {
    const evaluator = createAudioMappingEvaluator(AUDIO_MAPPING_REFERENCE);
    const knobs = { intensity: 0.5, depth: 0.4, bright: 0.6 };
    const quiet = evaluator.evaluate(features({ energy: 0.05, bass: 0.05 }), knobs, 0);
    const loud = evaluator.evaluate(features({ energy: 0.9, bass: 0.9 }), knobs, 2000);
    expect(loud.intensity).toBeGreaterThan(quiet.intensity);
    expect(loud.depth).toBeGreaterThan(quiet.depth);
  });

  test('never pulls a knob below where the operator set it', () => {
    // Every reference row combines with `add`, so the knob is a floor.
    const evaluator = createAudioMappingEvaluator(AUDIO_MAPPING_REFERENCE);
    const knobs = { intensity: 0.5, depth: 0.4, bright: 0.6 };
    for (let t = 0; t < 2000; t += 100) {
      const out = evaluator.evaluate(features({ energy: 0.3, bass: 0.3, pulse: 0.9 }), knobs, t);
      expect(out.intensity).toBeGreaterThanOrEqual(0.5);
      expect(out.depth).toBeGreaterThanOrEqual(0.4);
      expect(out.bright).toBeGreaterThanOrEqual(0.6);
    }
  });
});
