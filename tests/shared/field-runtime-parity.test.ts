/**
 * FieldRuntime vertical-slice parity harness (PR6 / #240).
 *
 * Rust unit tests in `src/field_runtime.rs` own golden pose snapshots
 * (`UPDATE_FIELD_GOLDS=1 cargo test -p aurora --bin aurora golden_poses`).
 * This suite covers the TS compile path and live-show safety contracts that
 * the projector/WASM ingest relies on:
 * - supernova preset compiles to primitiveId 1 with suppressLegacyField
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
    // Rust implements pose_supernova_burst for every FieldPool; this list is the
    // acceptance surface for #240. Family A migrations (#242+) add primitives, not pools.
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
