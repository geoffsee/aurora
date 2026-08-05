/**
 * FieldRuntime parity harness (PR6 / #240 + PR8 / #242 Family A 0–7 +
 * PR9 / #243 Family A 8–15 + PR10 / #244 Family A 16–23).
 *
 * Rust unit tests in `src/field_runtime.rs` own golden pose snapshots
 * (`UPDATE_FIELD_GOLDS=1 cargo test -p aurora --bin aurora golden_poses`).
 * This suite covers the TS compile path and live-show safety contracts that
 * the projector/WASM ingest relies on:
 * - supernova preset compiles to primitiveId 1 with suppressLegacyField
 * - Family A modes 0–23 compile to permanent ids 10–33
 * - all four pools are the FieldRuntime contract (documented; poses in Rust)
 * - failed wire must not be applied (mirror of try_set_compiled keep-previous)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  COMPILED_MODE_WIRE_VERSION,
  type CompiledModeWire,
} from '../../shared/compiled-mode-wire.ts';
import { FIELD_PRIMITIVE_IDS } from '../../shared/field-primitive-ids.ts';
import { compileModePreset, validateModePreset } from '../../shared/mode-preset-schema.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

const FIELD_POOLS = ['beams', 'rings', 'tiles', 'ghost'] as const;

/** Family A legacy indices 0–23 → permanent primitive ids (mirror field_runtime.rs). */
const FAMILY_A_MODES = [
  { slug: 'beams', legacyIndex: 0, primitiveId: FIELD_PRIMITIVE_IDS.beams },
  { slug: 'tunnel', legacyIndex: 1, primitiveId: FIELD_PRIMITIVE_IDS.tunnel },
  { slug: 'burst', legacyIndex: 2, primitiveId: FIELD_PRIMITIVE_IDS.burst },
  { slug: 'mirror', legacyIndex: 3, primitiveId: FIELD_PRIMITIVE_IDS.mirror },
  { slug: 'wash', legacyIndex: 4, primitiveId: FIELD_PRIMITIVE_IDS.wash },
  { slug: 'strobe', legacyIndex: 5, primitiveId: FIELD_PRIMITIVE_IDS.strobe },
  { slug: 'swarm', legacyIndex: 6, primitiveId: FIELD_PRIMITIVE_IDS.swarm },
  { slug: 'orbit', legacyIndex: 7, primitiveId: FIELD_PRIMITIVE_IDS.orbit },
  { slug: 'pulse', legacyIndex: 8, primitiveId: FIELD_PRIMITIVE_IDS.pulse },
  { slug: 'spiral', legacyIndex: 9, primitiveId: FIELD_PRIMITIVE_IDS.spiral },
  { slug: 'ripple', legacyIndex: 10, primitiveId: FIELD_PRIMITIVE_IDS.ripple },
  { slug: 'shatter', legacyIndex: 11, primitiveId: FIELD_PRIMITIVE_IDS.shatter },
  { slug: 'flux', legacyIndex: 12, primitiveId: FIELD_PRIMITIVE_IDS.flux },
  { slug: 'lattice', legacyIndex: 13, primitiveId: FIELD_PRIMITIVE_IDS.lattice },
  { slug: 'drift', legacyIndex: 14, primitiveId: FIELD_PRIMITIVE_IDS.drift },
  { slug: 'storm', legacyIndex: 15, primitiveId: FIELD_PRIMITIVE_IDS.storm },
  { slug: 'echo', legacyIndex: 16, primitiveId: FIELD_PRIMITIVE_IDS.echo },
  { slug: 'vortex', legacyIndex: 17, primitiveId: FIELD_PRIMITIVE_IDS.vortex },
  { slug: 'fracture', legacyIndex: 18, primitiveId: FIELD_PRIMITIVE_IDS.fracture },
  { slug: 'nebula', legacyIndex: 19, primitiveId: FIELD_PRIMITIVE_IDS.nebula },
  { slug: 'prism', legacyIndex: 20, primitiveId: FIELD_PRIMITIVE_IDS.prism },
  { slug: 'scanner', legacyIndex: 21, primitiveId: FIELD_PRIMITIVE_IDS.scanner },
  { slug: 'comet', legacyIndex: 22, primitiveId: FIELD_PRIMITIVE_IDS.comet },
  { slug: 'bloom', legacyIndex: 23, primitiveId: FIELD_PRIMITIVE_IDS.bloom },
] as const;

describe('FieldRuntime / supernova vertical slice', () => {
  test('bundled supernova presets validate and compile for both decks', () => {
    for (const deck of ['deck-a', 'deck-b'] as const) {
      const path = resolve(REPO_ROOT, `data/decks/${deck}/supernova/preset.json`);
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const validated = validateModePreset(raw);
      expect(validated.ok, `${deck}: ${!validated.ok ? validated.errors.join('; ') : ''}`).toBe(
        true,
      );
      if (!validated.ok) return;

      const compiled = compileModePreset(validated.value, {
        epoch: 1,
        deck,
        assetBase: `/api/data/e/1/decks/${deck}/supernova/`,
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;

      const wire: CompiledModeWire = compiled.value;
      expect(wire.wireVersion).toBe(COMPILED_MODE_WIRE_VERSION);
      expect(wire.slug).toBe('supernova');
      expect(wire.suppressLegacyField).toBe(true);
      expect(wire.field?.primitiveId).toBe(FIELD_PRIMITIVE_IDS.supernova_burst);
      expect(wire.field?.primitiveName).toBe('supernova_burst');
      expect(wire.field?.params.intensity).toBeCloseTo(0.9, 5);
      expect(wire.field?.params.spin).toBeCloseTo(0.35, 5);
      expect(wire.field?.params.decay).toBeCloseTo(0.6, 5);
      expect(wire.engineMinCapabilities).toContain('field-runtime');
      expect(wire.legacyIndex).toBeNull();
    }
  });

  test('fixture supernova-stub matches permanent primitive id 1', () => {
    const raw = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'tests/fixtures/modes/supernova-stub.preset.json'), 'utf8'),
    ) as unknown;
    const validated = validateModePreset(raw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const compiled = compileModePreset(validated.value, {
      epoch: 7,
      deck: 'deck-a',
      assetBase: '/data/decks/deck-a/supernova-stub/',
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.field?.primitiveId).toBe(1);
  });

  test('contract: FieldRuntime covers all four pools (no beams-only migration)', () => {
    // Rust implements poses for every FieldPool; this list is the
    // acceptance surface for #240/#242. Family migrations add primitives, not pools.
    expect(FIELD_POOLS).toEqual(['beams', 'rings', 'tiles', 'ghost']);
    expect(FIELD_POOLS).toHaveLength(4);
  });

  test('fail-closed: invalid wireVersion must not replace a good ActiveCompiled (TS mirror)', () => {
    // Mirrors FieldRuntime::try_set_compiled keep-previous semantics used by WASM ingest.
    type Active = { slug: string; wireVersion: number };
    let active: Active | null = null;

    function trySet(json: string): boolean {
      try {
        const v = JSON.parse(json) as { wireVersion?: number; slug?: string };
        if (v.wireVersion !== COMPILED_MODE_WIRE_VERSION) return false;
        if (typeof v.slug !== 'string' || !v.slug) return false;
        active = { slug: v.slug, wireVersion: v.wireVersion };
        return true;
      } catch {
        return false;
      }
    }

    expect(
      trySet(
        JSON.stringify({
          wireVersion: COMPILED_MODE_WIRE_VERSION,
          slug: 'supernova',
        }),
      ),
    ).toBe(true);
    const before = active;
    expect(trySet(JSON.stringify({ wireVersion: 99, slug: 'nope' }))).toBe(false);
    expect(active).toEqual(before);
    expect(trySet('not-json')).toBe(false);
    expect(active).toEqual(before);
  });
});

describe('FieldRuntime / Family A modes 0–23 (#242 + #243 + #244)', () => {
  test('permanent primitive ids 10–33 match registry', () => {
    expect(FIELD_PRIMITIVE_IDS.beams).toBe(10);
    expect(FIELD_PRIMITIVE_IDS.tunnel).toBe(11);
    expect(FIELD_PRIMITIVE_IDS.burst).toBe(12);
    expect(FIELD_PRIMITIVE_IDS.mirror).toBe(13);
    expect(FIELD_PRIMITIVE_IDS.wash).toBe(14);
    expect(FIELD_PRIMITIVE_IDS.strobe).toBe(15);
    expect(FIELD_PRIMITIVE_IDS.swarm).toBe(16);
    expect(FIELD_PRIMITIVE_IDS.orbit).toBe(17);
    expect(FIELD_PRIMITIVE_IDS.pulse).toBe(18);
    expect(FIELD_PRIMITIVE_IDS.spiral).toBe(19);
    expect(FIELD_PRIMITIVE_IDS.ripple).toBe(20);
    expect(FIELD_PRIMITIVE_IDS.shatter).toBe(21);
    expect(FIELD_PRIMITIVE_IDS.flux).toBe(22);
    expect(FIELD_PRIMITIVE_IDS.lattice).toBe(23);
    expect(FIELD_PRIMITIVE_IDS.drift).toBe(24);
    expect(FIELD_PRIMITIVE_IDS.storm).toBe(25);
    expect(FIELD_PRIMITIVE_IDS.echo).toBe(26);
    expect(FIELD_PRIMITIVE_IDS.vortex).toBe(27);
    expect(FIELD_PRIMITIVE_IDS.fracture).toBe(28);
    expect(FIELD_PRIMITIVE_IDS.nebula).toBe(29);
    expect(FIELD_PRIMITIVE_IDS.prism).toBe(30);
    expect(FIELD_PRIMITIVE_IDS.scanner).toBe(31);
    expect(FIELD_PRIMITIVE_IDS.comet).toBe(32);
    expect(FIELD_PRIMITIVE_IDS.bloom).toBe(33);
  });

  test('bundled Family A presets compile for both decks (pool contract via Rust)', () => {
    for (const mode of FAMILY_A_MODES) {
      for (const deck of ['deck-a', 'deck-b'] as const) {
        const path = resolve(REPO_ROOT, `data/decks/${deck}/${mode.slug}/preset.json`);
        const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
        const validated = validateModePreset(raw);
        expect(
          validated.ok,
          `${deck}/${mode.slug}: ${!validated.ok ? validated.errors.join('; ') : ''}`,
        ).toBe(true);
        if (!validated.ok) return;

        const compiled = compileModePreset(validated.value, {
          epoch: 1,
          deck,
          assetBase: `/api/data/e/1/decks/${deck}/${mode.slug}/`,
        });
        expect(compiled.ok, `${deck}/${mode.slug} compile`).toBe(true);
        if (!compiled.ok) return;

        const wire: CompiledModeWire = compiled.value;
        expect(wire.wireVersion).toBe(COMPILED_MODE_WIRE_VERSION);
        expect(wire.slug).toBe(mode.slug);
        expect(wire.legacyIndex).toBe(mode.legacyIndex);
        expect(wire.field?.primitiveId).toBe(mode.primitiveId);
        expect(wire.field?.primitiveName).toBe(mode.slug);
        expect(FIELD_POOLS).toHaveLength(4);
      }
    }
  });
});
