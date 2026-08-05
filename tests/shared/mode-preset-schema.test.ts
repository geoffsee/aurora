import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  COMPILED_MODE_WIRE_VERSION,
  compileModePreset,
  FIELD_PRIMITIVE_IDS,
  fieldPrimitiveId,
  fieldPrimitiveName,
  isFieldPrimitiveName,
  listFieldPrimitiveNames,
  MODE_PRESET_SCHEMA_VERSION,
  type ModePreset,
  validateAndCompileModePreset,
  validateModePreset,
} from '../../shared/mode-preset-schema.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/modes');

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

const COMPILE_CTX = {
  epoch: 7,
  deck: 'deck-a' as const,
  assetBase: '/data/decks/deck-a/supernova-stub/',
};

function baseFieldPrimitive(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'supernova-stub',
    slug: 'supernova-stub',
    label: 'Supernova Stub',
    disposition: 'field-primitive',
    field: {
      primitive: 'supernova_burst',
      params: { intensity: 0.9, spin: 0.35, decay: 0.6 },
    },
    ...overrides,
  };
}

// ── Version axes ─────────────────────────────────────────────────────────────

describe('version axes constants', () => {
  test('authoring schemaVersion is 1', () => {
    expect(MODE_PRESET_SCHEMA_VERSION).toBe(1);
  });

  test('wire wireVersion is 1', () => {
    expect(COMPILED_MODE_WIRE_VERSION).toBe(1);
  });

  test('axes are independent positive integers', () => {
    expect(Number.isInteger(MODE_PRESET_SCHEMA_VERSION)).toBe(true);
    expect(Number.isInteger(COMPILED_MODE_WIRE_VERSION)).toBe(true);
    expect(MODE_PRESET_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(COMPILED_MODE_WIRE_VERSION).toBeGreaterThan(0);
  });
});

// ── Primitive ID registry ────────────────────────────────────────────────────

describe('FIELD_PRIMITIVE_IDS registry', () => {
  test('supernova_burst is permanent id 1', () => {
    expect(FIELD_PRIMITIVE_IDS.supernova_burst).toBe(1);
    expect(fieldPrimitiveId('supernova_burst')).toBe(1);
    expect(fieldPrimitiveName(1)).toBe('supernova_burst');
  });

  test('isFieldPrimitiveName accepts registered names only', () => {
    expect(isFieldPrimitiveName('supernova_burst')).toBe(true);
    expect(isFieldPrimitiveName('beams')).toBe(true);
    expect(isFieldPrimitiveName('not_a_primitive')).toBe(false);
    expect(isFieldPrimitiveName(1)).toBe(false);
  });

  test('all IDs are unique positive integers (no reuse)', () => {
    const ids = Object.values(FIELD_PRIMITIVE_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
    }
  });

  test('listFieldPrimitiveNames covers the registry', () => {
    const names = listFieldPrimitiveNames();
    expect(names).toContain('supernova_burst');
    expect(names).toContain('beams');
    expect(names.length).toBe(Object.keys(FIELD_PRIMITIVE_IDS).length);
  });
});

// ── validateModePreset ───────────────────────────────────────────────────────

describe('validateModePreset', () => {
  test('valid supernova stub fixture validates', () => {
    const raw = loadJson('supernova-stub.preset.json');
    const result = validateModePreset(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toBe('supernova-stub');
    expect(result.value.field?.primitive).toBe('supernova_burst');
    // Unknown authoring keys are retained until compile
    expect(result.value.field?.params?.unknownNoise).toBe(99);
  });

  test('id/slug mismatch fails', () => {
    const result = validateModePreset(
      baseFieldPrimitive({ id: 'other-id', slug: 'supernova-stub' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('id must equal slug'))).toBe(true);
  });

  test('invalid slug fails', () => {
    const cases = ['Supernova', 'has_underscore', '-leading', 'trailing-', 'spa ce', ''];
    for (const slug of cases) {
      const result = validateModePreset(baseFieldPrimitive({ id: slug, slug }));
      expect(result.ok, `slug ${JSON.stringify(slug)} should fail`).toBe(false);
    }
  });

  test('unknown primitive fails', () => {
    const result = validateModePreset(
      baseFieldPrimitive({
        field: { primitive: 'quantum_flapdoodle', params: { intensity: 1 } },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('known FieldPrimitiveName'))).toBe(true);
  });

  test('missing required param fails validation', () => {
    const result = validateModePreset(
      baseFieldPrimitive({
        field: { primitive: 'supernova_burst', params: { spin: 0.1 } },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('intensity') && e.includes('required'))).toBe(true);
  });

  test('field-primitive disposition requires field', () => {
    const raw = baseFieldPrimitive();
    delete raw.field;
    const result = validateModePreset(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('field is required'))).toBe(true);
  });

  test('legacyIndex out of range fails', () => {
    const result = validateModePreset(baseFieldPrimitive({ legacyIndex: 99 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('legacyIndex'))).toBe(true);
  });

  test('unsupported schemaVersion fails', () => {
    const result = validateModePreset(baseFieldPrimitive({ schemaVersion: 99 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  test('non-object fails', () => {
    expect(validateModePreset(null).ok).toBe(false);
    expect(validateModePreset('preset').ok).toBe(false);
    expect(validateModePreset([]).ok).toBe(false);
  });
});

// ── compileModePreset ────────────────────────────────────────────────────────

describe('compileModePreset', () => {
  test('valid supernova stub compiles and matches golden', () => {
    const raw = loadJson('supernova-stub.preset.json');
    const golden = loadJson('supernova-stub.compiled.json');
    const result = validateAndCompileModePreset(raw, COMPILE_CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(golden);
  });

  test('unknown param keys are stripped at compile', () => {
    const validated = validateModePreset(
      baseFieldPrimitive({
        field: {
          primitive: 'supernova_burst',
          params: {
            intensity: 0.5,
            spin: 0.1,
            decay: 0.2,
            totallyUnknown: 123,
            alsoUnknown: true,
          },
        },
      }),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const compiled = compileModePreset(validated.value, COMPILE_CTX);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.field?.params).toEqual({
      intensity: 0.5,
      spin: 0.1,
      decay: 0.2,
    });
    expect(compiled.value.field?.params).not.toHaveProperty('totallyUnknown');
  });

  test('missing required params fail compile', () => {
    // Bypass validateModePreset required check by constructing a ModePreset directly.
    const preset: ModePreset = {
      schemaVersion: 1,
      id: 'supernova-stub',
      slug: 'supernova-stub',
      label: 'Supernova Stub',
      disposition: 'field-primitive',
      field: {
        primitive: 'supernova_burst',
        params: { spin: 0.2 }, // intensity required, omitted
      },
    };
    const result = compileModePreset(preset, COMPILE_CTX);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('intensity') && e.includes('required'))).toBe(true);
  });

  test('known params are clamped', () => {
    const validated = validateModePreset(
      baseFieldPrimitive({
        field: {
          primitive: 'supernova_burst',
          params: { intensity: 4, spin: -9, decay: 0.001 },
        },
      }),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const compiled = compileModePreset(validated.value, COMPILE_CTX);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.field?.params.intensity).toBe(1);
    expect(compiled.value.field?.params.spin).toBe(-2);
    expect(compiled.value.field?.params.decay).toBe(0.01);
  });

  test('optional params fill defaults when omitted', () => {
    const validated = validateModePreset(
      baseFieldPrimitive({
        field: {
          primitive: 'supernova_burst',
          params: { intensity: 0.5 },
        },
      }),
    );
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const compiled = compileModePreset(validated.value, COMPILE_CTX);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.field?.params).toEqual({
      intensity: 0.5,
      spin: 0.4,
      decay: 0.55,
    });
  });

  test('wire carries permanent primitiveId and context fields', () => {
    const validated = validateModePreset(baseFieldPrimitive({ legacyIndex: 2 }));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const compiled = compileModePreset(validated.value, {
      epoch: 3,
      deck: 'deck-b',
      assetBase: '/assets/',
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.wireVersion).toBe(COMPILED_MODE_WIRE_VERSION);
    expect(compiled.value.epoch).toBe(3);
    expect(compiled.value.deck).toBe('deck-b');
    expect(compiled.value.legacyIndex).toBe(2);
    expect(compiled.value.field?.primitiveId).toBe(FIELD_PRIMITIVE_IDS.supernova_burst);
    expect(compiled.value.assetBase).toBe('/assets/');
  });

  test('golden compiled output is stable JSON', () => {
    const golden = loadJson('supernova-stub.compiled.json') as Record<string, unknown>;
    expect(golden.wireVersion).toBe(1);
    expect((golden.field as { primitiveId: number }).primitiveId).toBe(1);
    // unknownNoise must not appear in compiled golden
    expect(JSON.stringify(golden)).not.toContain('unknownNoise');
  });
});
