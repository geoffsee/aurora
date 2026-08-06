/**
 * Look import: dual-deck install under AURORA_DATA_DIR + body parsing.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { loadModeCatalog, scanDeckCatalog } from '../../bridge/mode-catalog.ts';
import {
  installAuroraPackageArchive,
  readPackageArchiveFromRequest,
  resolvePackageImportDataDir,
} from '../../bridge/package-import.ts';
import {
  buildAuroraPackageArchive,
  buildManifest,
  PACK_V1_AUTHORING_TEMPLATE,
  PACK_V1_SHOW_TEMPLATE,
} from '../../shared/aurora-package.ts';
import { validateModePreset } from '../../shared/mode-preset-schema.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

const tempRoots: string[] = [];

function tempDir(prefix = 'aurora-package-import-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const d = tempRoots.pop();
    if (d === undefined) break;
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function makeShowArchive(
  slug = 'glass-drift',
  label = 'Glass Drift',
  extras?: { character?: string; defaults?: Record<string, number> },
): Uint8Array {
  return buildAuroraPackageArchive({
    manifest: buildManifest({
      slug,
      label,
      character: extras?.character,
      wgslForm: 'show',
    }),
    wgsl: PACK_V1_SHOW_TEMPLATE,
    defaults: extras?.defaults,
  });
}

function makeAuthoringArchive(slug = 'soft-blob', label = 'Soft Blob'): Uint8Array {
  return buildAuroraPackageArchive({
    manifest: buildManifest({ slug, label, wgslForm: 'authoring' }),
    wgsl: PACK_V1_AUTHORING_TEMPLATE,
  });
}

describe('resolvePackageImportDataDir', () => {
  test('returns null when unset or blank', () => {
    expect(resolvePackageImportDataDir({ env: {} })).toBeNull();
    expect(resolvePackageImportDataDir({ env: { AURORA_DATA_DIR: '  ' } })).toBeNull();
    expect(resolvePackageImportDataDir({ overrideRoot: null })).toBeNull();
  });

  test('resolves absolute and relative paths', () => {
    const abs = resolve('/tmp/aurora-data-test');
    expect(resolvePackageImportDataDir({ overrideRoot: abs })).toBe(abs);
    const cwd = tempDir();
    const rel = resolvePackageImportDataDir({
      overrideRoot: './modes',
      cwd,
    });
    expect(rel).toBe(join(cwd, 'modes'));
  });
});

describe('installAuroraPackageArchive', () => {
  test('writes dual-deck preset.json + wgsl under data dir', () => {
    const dataDir = tempDir();
    const archive = makeShowArchive('glass-drift', 'Glass Drift', {
      character: 'soft glass',
      defaults: { intensity: 0.6 },
    });

    const result = installAuroraPackageArchive(archive, { dataDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.slug).toBe('glass-drift');
    expect(result.label).toBe('Glass Drift');
    expect(result.overwritten).toBe(false);
    expect(result.wgslFile).toBe('glass_drift.wgsl');
    expect(result.wgslForm).toBe('show');
    expect(result.decks).toEqual(['deck-a', 'deck-b']);

    for (const deck of ['deck-a', 'deck-b'] as const) {
      const folder = result.paths[deck];
      expect(folder).toBe(join(dataDir, 'decks', deck, 'glass-drift'));
      expect(existsSync(join(folder, 'preset.json'))).toBe(true);
      expect(existsSync(join(folder, 'glass_drift.wgsl'))).toBe(true);

      const preset = JSON.parse(readFileSync(join(folder, 'preset.json'), 'utf8'));
      const validated = validateModePreset(preset);
      expect(validated.ok).toBe(true);
      if (!validated.ok) return;
      expect(validated.value.disposition).toBe('fullscreen-primary');
      expect(validated.value.layers?.[0]).toEqual({
        kind: 'fullscreen',
        ref: 'glass_drift.wgsl',
      });
      expect(validated.value.engineMinCapabilities).toContain('dual-fullscreen');
      expect(validated.value.suppressLegacyField).toBe(true);

      const wgsl = readFileSync(join(folder, 'glass_drift.wgsl'), 'utf8');
      expect(wgsl).toContain('@group(2)');
      expect(wgsl).toContain('VertexOutput');
      expect(wgsl).toContain('pack_drive');
    }
  });

  test('remaps authoring WGSL to show form by default', () => {
    const dataDir = tempDir();
    const result = installAuroraPackageArchive(makeAuthoringArchive(), { dataDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wgslForm).toBe('show');
    const wgsl = readFileSync(join(result.paths['deck-a'], 'soft_blob.wgsl'), 'utf8');
    expect(wgsl).toContain('@group(2)');
    expect(wgsl).not.toMatch(/@group\(\s*0\s*\)/);
    expect(wgsl).toContain('fn fragment(frag: VertexOutput)');
  });

  test('re-import overwrites same slug', () => {
    const dataDir = tempDir();
    const first = installAuroraPackageArchive(
      makeShowArchive('wave-rim', 'Wave Rim', { character: 'v1' }),
      { dataDir },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Corrupt the installed WGSL so overwrite is visible.
    writeFileSync(join(first.paths['deck-a'], 'wave_rim.wgsl'), '// stale\n');

    const second = installAuroraPackageArchive(
      makeShowArchive('wave-rim', 'Wave Rim', { character: 'v2' }),
      { dataDir },
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.overwritten).toBe(true);

    const preset = JSON.parse(
      readFileSync(join(second.paths['deck-a'], 'preset.json'), 'utf8'),
    ) as { character?: string };
    expect(preset.character).toBe('v2');
    const wgsl = readFileSync(join(second.paths['deck-a'], 'wave_rim.wgsl'), 'utf8');
    expect(wgsl).not.toContain('// stale');
    expect(wgsl).toContain('pack_drive');
  });

  test('rejects invalid archive without writing packs', () => {
    const dataDir = tempDir();
    const result = installAuroraPackageArchive(new Uint8Array([1, 2, 3, 4]), { dataDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(existsSync(join(dataDir, 'decks'))).toBe(false);
  });

  test('rejects empty body', () => {
    const dataDir = tempDir();
    const result = installAuroraPackageArchive(new Uint8Array(), { dataDir });
    expect(result.ok).toBe(false);
  });

  test('catalog overlay picks up installed look', () => {
    const dataDir = tempDir();
    const installed = installAuroraPackageArchive(makeShowArchive('catalog-probe'), { dataDir });
    expect(installed.ok).toBe(true);

    const deckA = scanDeckCatalog(join(dataDir, 'decks', 'deck-a'), 'override');
    const entry = deckA.find((e) => e.slug === 'catalog-probe');
    expect(entry).toBeDefined();
    expect(entry?.source).toBe('override');
    expect(entry?.label).toBe('Glass Drift');

    const snap = loadModeCatalog({
      appRoot: REPO_ROOT,
      overrideRoot: dataDir,
      env: {},
    });
    const fromMerged = snap.decks['deck-a'].find((e) => e.slug === 'catalog-probe');
    expect(fromMerged).toBeDefined();
    expect(fromMerged?.source).toBe('override');
  });
});

describe('readPackageArchiveFromRequest', () => {
  test('accepts raw zip bytes', async () => {
    const archive = makeShowArchive();
    const request = new Request('http://127.0.0.1:3000/api/packages/import', {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: Buffer.from(archive),
    });
    const body = await readPackageArchiveFromRequest(request);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.bytes.byteLength).toBe(archive.byteLength);
    expect(body.remapAuthoring).toBe(true);
  });

  test('accepts JSON archiveBase64 and remapAuthoring=false', async () => {
    const archive = makeShowArchive();
    const b64 = Buffer.from(archive).toString('base64');
    const request = new Request('http://127.0.0.1:3000/api/packages/import?remapAuthoring=false', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archiveBase64: b64, remapAuthoring: false }),
    });
    const body = await readPackageArchiveFromRequest(request);
    expect(body.ok).toBe(true);
    if (!body.ok) return;
    expect(body.remapAuthoring).toBe(false);
    expect(body.bytes.byteLength).toBe(archive.byteLength);
  });

  test('rejects empty raw body', async () => {
    const request = new Request('http://127.0.0.1:3000/api/packages/import', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.alloc(0),
    });
    const body = await readPackageArchiveFromRequest(request);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.status).toBe(400);
  });

  test('rejects missing base64 field', async () => {
    const request = new Request('http://127.0.0.1:3000/api/packages/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await readPackageArchiveFromRequest(request);
    expect(body.ok).toBe(false);
    if (body.ok) return;
    expect(body.status).toBe(400);
  });
});
