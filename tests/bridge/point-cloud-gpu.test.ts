/**
 * Point-cloud GPU pack: compile attaches pack-local WGSL; no field primitive.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { compileFromEntry, toPublicCatalog } from '../../bridge/mode-api.ts';
import { loadModeCatalog } from '../../bridge/mode-catalog.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

describe('point-cloud GPU pack compile', () => {
  test('bundled pack has WGSL asset and compiles with attached fullscreen wgsl', () => {
    for (const deck of ['deck-a', 'deck-b'] as const) {
      const wgslPath = resolve(REPO_ROOT, `data/decks/${deck}/point-cloud/point_cloud.wgsl`);
      expect(existsSync(wgslPath), wgslPath).toBe(true);
      const src = readFileSync(wgslPath, 'utf8');
      expect(src).toMatch(/@fragment/);
      expect(src).toMatch(/fn fragment/);
    }

    const snap = loadModeCatalog({ appRoot: REPO_ROOT });
    const pub = toPublicCatalog(snap);
    expect(pub.decks['deck-a'].some((e) => e.slug === 'point-cloud')).toBe(true);

    for (const deck of ['deck-a', 'deck-b'] as const) {
      const entry = snap.decks[deck].find((e) => e.slug === 'point-cloud');
      expect(entry).toBeDefined();
      if (!entry) return;
      const compiled = compileFromEntry(entry, snap.epoch, deck);
      expect(compiled.ok, !compiled.ok ? compiled.errors.join('; ') : '').toBe(true);
      if (!compiled.ok) return;
      expect(compiled.wire.disposition).toBe('fullscreen-primary');
      expect(compiled.wire.suppressLegacyField).toBe(true);
      expect(compiled.wire.field).toBeUndefined();
      const fs = compiled.wire.layers.find((l) => l.kind === 'fullscreen');
      expect(fs?.ref).toBe('point_cloud.wgsl');
      expect(typeof fs?.wgsl).toBe('string');
      const wgsl = fs?.wgsl ?? '';
      expect(wgsl.length).toBeGreaterThan(200);
      expect(wgsl).toMatch(/@fragment/);
      // Operator animation bus for the cloud.
      expect(wgsl).toMatch(/pack_drive/);
      expect(wgsl).toMatch(/drive_intensity|pack_drive\.x/);
    }
  });
});
