/**
 * Mesh layer ref resolution (PR11 / #245).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  resolveMeshLayerRef,
  wireIsMeshPrimary,
} from '../../shared/mesh-layer-resolve.ts';
import { modelById } from '../../shared/model-catalog.ts';
import {
  compileModePreset,
  validateModePreset,
} from '../../shared/mode-preset-schema.ts';
import {
  resolveDeckSelection,
  type CatalogLikeEntry,
} from '../../shared/resolve-deck-selection.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

describe('resolveMeshLayerRef', () => {
  test('resolves catalog id human-female to MODEL_CATALOG index', () => {
    const entry = modelById('human-female');
    expect(entry).toBeDefined();
    const r = resolveMeshLayerRef('human-female', '/api/data/e/1/decks/deck-a/figure/');
    expect(r.kind).toBe('catalog');
    if (r.kind !== 'catalog') return;
    expect(r.id).toBe('human-female');
    expect(r.assetPath).toBe(entry!.assetPath);
    expect(r.index).toBeGreaterThanOrEqual(0);
  });

  test('joins pack-relative glTF to epoch assetBase', () => {
    const base = '/api/data/e/2/decks/deck-b/figure/';
    const r = resolveMeshLayerRef('props/body.glb', base);
    expect(r).toEqual({ kind: 'pack', urlPath: `${base}props/body.glb` });
  });

  test('accepts root-relative epoch pack path', () => {
    const path = '/api/data/e/2/decks/deck-a/figure/mesh.gltf';
    expect(resolveMeshLayerRef(path, '/ignored/')).toEqual({
      kind: 'pack',
      urlPath: path,
    });
  });

  test('accepts absolute remote glTF URL', () => {
    const r = resolveMeshLayerRef('https://cdn.example.com/fig.glb', '/x/');
    expect(r).toEqual({ kind: 'remote', url: 'https://cdn.example.com/fig.glb' });
  });

  test('soft-unresolved for unknown id, escapes, and bad extensions', () => {
    expect(resolveMeshLayerRef('no-such-model', '/x/').kind).toBe('unresolved');
    expect(resolveMeshLayerRef('../escape.glb', '/x/').kind).toBe('unresolved');
    expect(resolveMeshLayerRef('mesh.obj', '/x/').kind).toBe('unresolved');
    expect(resolveMeshLayerRef('', '/x/').kind).toBe('unresolved');
    // Soft: never throws.
    expect(() => resolveMeshLayerRef(null, undefined)).not.toThrow();
  });
});

describe('figure mesh-primary bundled presets', () => {
  test('figure presets exist on both decks with mesh-primary + mesh layer', () => {
    for (const deck of ['deck-a', 'deck-b'] as const) {
      const path = resolve(REPO_ROOT, `data/decks/${deck}/figure/preset.json`);
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const validated = validateModePreset(raw);
      expect(validated.ok, `${deck}: ${!validated.ok ? validated.errors.join('; ') : ''}`).toBe(
        true,
      );
      if (!validated.ok) return;

      expect(validated.value.slug).toBe('figure');
      expect(validated.value.legacyIndex).toBe(24);
      expect(validated.value.disposition).toBe('mesh-primary');
      expect(validated.value.suppressLegacyField).toBe(true);
      expect(validated.value.layers).toEqual([{ kind: 'mesh', ref: 'human-female' }]);

      const compiled = compileModePreset(validated.value, {
        epoch: 9,
        deck,
        assetBase: `/api/data/e/9/decks/${deck}/figure/`,
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      expect(compiled.value.disposition).toBe('mesh-primary');
      expect(compiled.value.layers).toEqual([{ kind: 'mesh', ref: 'human-female' }]);
      expect(wireIsMeshPrimary(compiled.value)).toBe(true);

      const mesh = compiled.value.layers.find((l) => l.kind === 'mesh');
      expect(mesh).toBeDefined();
      const resolved = resolveMeshLayerRef(mesh!.ref, compiled.value.assetBase);
      expect(resolved.kind).toBe('catalog');
    }
  });

  test('figure slug resolves on both strict deck folders', () => {
    const catalogA: CatalogLikeEntry[] = [
      { slug: 'beams', legacyIndex: 0 },
      { slug: 'figure', legacyIndex: 24 },
    ];
    const catalogB: CatalogLikeEntry[] = [
      { slug: 'tunnel', legacyIndex: 1 },
      { slug: 'figure', legacyIndex: 24 },
    ];
    const a = resolveDeckSelection(
      'deck-a',
      { deckAPresetSlug: 'figure' },
      { mode: 0, slug: 'beams' },
      catalogA,
    );
    expect(a.slug).toBe('figure');
    expect(a.mode).toBe(24);

    const b = resolveDeckSelection(
      'deck-b',
      { deckBPresetSlug: 'figure' },
      { mode: 1, slug: 'tunnel' },
      catalogB,
    );
    expect(b.slug).toBe('figure');
    expect(b.mode).toBe(24);
  });
});
