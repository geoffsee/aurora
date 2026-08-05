import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  buildCatalogSnapshot,
  type CatalogEntry,
  catalogContentHash,
  isValidSlug,
  loadModeCatalog,
  mergeCatalog,
  parsePresetMeta,
  resolveDataDirs,
  resolveSandboxedAssetPath,
  scanDeckCatalog,
} from '../../bridge/mode-catalog.ts';
import { validateModePreset } from '../../shared/mode-preset-schema.ts';
import { MAX_VISUAL_MODE_INDEX, VISUAL_MODE_CATALOG } from '../../shared/visual-mode-catalog.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const BUNDLED_DATA = join(REPO_ROOT, 'data');
/** Legacy control-bus modes 0–48 (49 builtins) per deck. */
const EXPECTED_LEGACY_BUILTIN_COUNT = MAX_VISUAL_MODE_INDEX + 1;
/** Non-legacy vertical-slice packs bundled alongside legacy (supernova, point-cloud). */
const EXPECTED_EXTRA_SLUGS = ['supernova', 'point-cloud'] as const;
const EXPECTED_BUNDLED_COUNT = EXPECTED_LEGACY_BUILTIN_COUNT + EXPECTED_EXTRA_SLUGS.length;

const tempRoots: string[] = [];

function tempDir(prefix = 'aurora-catalog-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function writePreset(
  deckRoot: string,
  slug: string,
  meta: Record<string, unknown>,
  opts?: { assets?: Record<string, string> },
) {
  const folder = join(deckRoot, slug);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'preset.json'), JSON.stringify(meta, null, 2));
  if (opts?.assets) {
    const assetsDir = join(folder, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    for (const [name, body] of Object.entries(opts.assets)) {
      writeFileSync(join(assetsDir, name), body);
    }
  }
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

describe('isValidSlug / parsePresetMeta', () => {
  test('accepts kebab-case slugs', () => {
    expect(isValidSlug('beams')).toBe(true);
    expect(isValidSlug('bass-reactor')).toBe(true);
    expect(isValidSlug('Beams')).toBe(false);
    expect(isValidSlug('foo_bar')).toBe(false);
    expect(isValidSlug('foo.tmp')).toBe(false);
  });

  test('requires id and folder slug consistency', () => {
    expect(parsePresetMeta({ id: 'beams', slug: 'beams' }, 'beams')).toEqual({
      id: 'beams',
    });
    expect(parsePresetMeta({ id: 'beams' }, 'beams')).toEqual({ id: 'beams' });
    expect(parsePresetMeta({ id: 'other', slug: 'beams' }, 'beams')).toEqual({
      id: 'other',
    });
    expect(parsePresetMeta({ id: 'other' }, 'beams')).toBeNull();
    expect(parsePresetMeta({ id: 'beams', slug: 'tunnel' }, 'beams')).toBeNull();
    expect(parsePresetMeta({}, 'beams')).toBeNull();
    expect(parsePresetMeta(null, 'beams')).toBeNull();
  });

  test('parses uiGroup when present', () => {
    expect(
      parsePresetMeta(
        { id: 'beams', slug: 'beams', uiGroup: 'field-motion', label: 'Beams' },
        'beams',
      ),
    ).toEqual({
      id: 'beams',
      label: 'Beams',
      uiGroup: 'field-motion',
    });
  });
});

describe('resolveDataDirs', () => {
  test('resolves bundled decks and null override when unset', () => {
    const dirs = resolveDataDirs({
      bundledRoot: BUNDLED_DATA,
      env: {},
      cwd: REPO_ROOT,
    });
    expect(dirs.overrideRoot).toBeNull();
    expect(dirs.decksOverride['deck-a']).toBeNull();
    expect(dirs.decksBundled['deck-a']).toBe(join(BUNDLED_DATA, 'decks', 'deck-a'));
  });

  test('empty AURORA_DATA_DIR is treated as missing', () => {
    const dirs = resolveDataDirs({
      bundledRoot: BUNDLED_DATA,
      env: { AURORA_DATA_DIR: '   ' },
      cwd: REPO_ROOT,
    });
    expect(dirs.overrideRoot).toBeNull();
  });

  test('explicit overrideRoot wins over env', () => {
    const o = tempDir();
    const dirs = resolveDataDirs({
      bundledRoot: BUNDLED_DATA,
      overrideRoot: o,
      env: { AURORA_DATA_DIR: '/should-not-use' },
      cwd: REPO_ROOT,
    });
    expect(dirs.overrideRoot).toBe(resolve(REPO_ROOT, o));
    expect(dirs.overrideRoot).not.toBeNull();
    expect(dirs.decksOverride['deck-b']).toBe(join(dirs.overrideRoot as string, 'decks', 'deck-b'));
  });
});

describe('scanDeckCatalog', () => {
  test('scans valid presets and ignores *.tmp, invalid, and missing meta', () => {
    const root = tempDir();
    writePreset(root, 'beams', { id: 'beams', label: 'Beams', legacyIndex: 0 });
    writePreset(root, 'broken', { id: 'not-broken' }); // id ≠ folder, no slug
    mkdirSync(join(root, 'wip.tmp'), { recursive: true });
    writeFileSync(join(root, 'wip.tmp', 'preset.json'), JSON.stringify({ id: 'wip', slug: 'wip' }));
    mkdirSync(join(root, 'empty-folder'), { recursive: true });
    writeFileSync(join(root, 'not-a-dir'), 'x');
    writePreset(root, 'tunnel', { id: 'tunnel', slug: 'tunnel' });

    const entries = scanDeckCatalog(root, 'bundled');
    expect(entries.map((e) => e.slug)).toEqual(['beams', 'tunnel']);
    expect(entries.every((e) => e.source === 'bundled')).toBe(true);
    expect(entries.find((e) => e.slug === 'beams')?.legacyIndex).toBe(0);
  });

  test('missing deck root yields empty list', () => {
    expect(scanDeckCatalog(join(tempDir(), 'nope'), 'override')).toEqual([]);
  });
});

describe('mergeCatalog', () => {
  const bundled: CatalogEntry[] = [
    { slug: 'beams', id: 'beams', path: '/b/beams', source: 'bundled', label: 'Beams' },
    { slug: 'tunnel', id: 'tunnel', path: '/b/tunnel', source: 'bundled' },
  ];

  test('empty override keeps full bundled', () => {
    const m = mergeCatalog(bundled, []);
    expect(m).toHaveLength(2);
    expect(m.every((e) => e.source === 'bundled')).toBe(true);
  });

  test('override slug fully wins for that slug only', () => {
    const override: CatalogEntry[] = [
      {
        slug: 'tunnel',
        id: 'tunnel',
        path: '/o/tunnel',
        source: 'override',
        label: 'Custom Tunnel',
      },
    ];
    const m = mergeCatalog(bundled, override);
    expect(m).toHaveLength(2);
    const tunnel = m.find((e) => e.slug === 'tunnel');
    const beams = m.find((e) => e.slug === 'beams');
    expect(tunnel).toBeDefined();
    expect(beams).toBeDefined();
    expect(tunnel?.source).toBe('override');
    expect(tunnel?.path).toBe('/o/tunnel');
    expect(tunnel?.label).toBe('Custom Tunnel');
    expect(beams?.source).toBe('bundled');
    expect(beams?.path).toBe('/b/beams');
  });

  test('override-only slug appears alongside bundled', () => {
    const override: CatalogEntry[] = [
      { slug: 'custom-pack', id: 'custom-pack', path: '/o/custom-pack', source: 'override' },
    ];
    const m = mergeCatalog(bundled, override);
    expect(m.map((e) => e.slug).sort()).toEqual(['beams', 'custom-pack', 'tunnel']);
  });
});

describe('bundled builtins (modes 0–48 + extras)', () => {
  test('scan lists legacy 0–48 plus non-legacy extras (supernova, point-cloud) per deck', () => {
    const snap = loadModeCatalog({ appRoot: REPO_ROOT, env: {} });
    expect(VISUAL_MODE_CATALOG).toHaveLength(EXPECTED_LEGACY_BUILTIN_COUNT);

    for (const deck of ['deck-a', 'deck-b'] as const) {
      const entries = snap.decks[deck];
      expect(entries).toHaveLength(EXPECTED_BUNDLED_COUNT);
      expect(entries.every((e) => e.source === 'bundled')).toBe(true);

      const withLegacy = entries.filter((e) => typeof e.legacyIndex === 'number');
      expect(withLegacy).toHaveLength(EXPECTED_LEGACY_BUILTIN_COUNT);
      const unique = new Set(withLegacy.map((e) => e.legacyIndex));
      expect(unique.size).toBe(EXPECTED_LEGACY_BUILTIN_COUNT);
      for (let i = 0; i <= MAX_VISUAL_MODE_INDEX; i++) {
        expect(unique.has(i)).toBe(true);
      }

      for (const extra of EXPECTED_EXTRA_SLUGS) {
        const row = entries.find((e) => e.slug === extra);
        expect(row, `${deck} missing ${extra}`).toBeDefined();
        expect(row?.legacyIndex).toBeUndefined();
      }

      // id === slug === folder name for every bundled pack
      for (const e of entries) {
        expect(e.id).toBe(e.slug);
      }
    }
  });

  test('strict per-deck duplication (same slugs/indices, separate paths)', () => {
    const snap = loadModeCatalog({ appRoot: REPO_ROOT, env: {} });
    const a = snap.decks['deck-a'];
    const b = snap.decks['deck-b'];
    expect(a.map((e) => e.slug).sort()).toEqual(b.map((e) => e.slug).sort());
    expect(
      a
        .map((e) => e.legacyIndex)
        .slice()
        .sort((x, y) => (x ?? 0) - (y ?? 0)),
    ).toEqual(
      b
        .map((e) => e.legacyIndex)
        .slice()
        .sort((x, y) => (x ?? 0) - (y ?? 0)),
    );
    // Paths must not alias a shared library tree
    for (const ea of a) {
      const eb = b.find((e) => e.slug === ea.slug);
      expect(eb).toBeDefined();
      if (!eb) continue;
      expect(ea.path).not.toBe(eb.path);
      expect(ea.path.includes(`${join('decks', 'deck-a')}`)).toBe(true);
      expect(eb.path.includes(`${join('decks', 'deck-b')}`)).toBe(true);
    }
  });

  test('each bundled preset.json validates against ModePreset schema', () => {
    const snap = loadModeCatalog({ appRoot: REPO_ROOT, env: {} });
    for (const deck of ['deck-a', 'deck-b'] as const) {
      for (const entry of snap.decks[deck]) {
        const raw = JSON.parse(readFileSync(join(entry.path, 'preset.json'), 'utf8')) as unknown;
        const result = validateModePreset(raw);
        expect(
          result.ok,
          `${deck}/${entry.slug}: ${!result.ok ? result.errors.join('; ') : ''}`,
        ).toBe(true);
        if (result.ok) {
          expect(result.value.legacyIndex).toBe(entry.legacyIndex);
          expect(result.value.id).toBe(entry.slug);
        }
      }
    }
  });
});

describe('bundled + overlay integration', () => {
  test('missing override still serves full bundled catalog', () => {
    const snap = loadModeCatalog({ appRoot: REPO_ROOT, env: {} });
    expect(snap.epoch).toBe(1);
    expect(snap.decks['deck-a'].length).toBe(EXPECTED_BUNDLED_COUNT);
    expect(snap.decks['deck-b'].length).toBe(EXPECTED_BUNDLED_COUNT);
    expect(snap.decks['deck-a'].every((e) => e.source === 'bundled')).toBe(true);
    expect(snap.decks['deck-a'].some((e) => e.slug === 'beams')).toBe(true);
    expect(snap.decks['deck-a'].some((e) => e.slug === 'tunnel')).toBe(true);
    expect(snap.decks['deck-a'].some((e) => e.slug === 'forcing')).toBe(true);
    expect(snap.decks['deck-a'].some((e) => e.slug === 'supernova')).toBe(true);
  });

  test('empty override dir still serves full bundled catalog', () => {
    const override = tempDir();
    mkdirSync(join(override, 'decks', 'deck-a'), { recursive: true });
    mkdirSync(join(override, 'decks', 'deck-b'), { recursive: true });
    const snap = loadModeCatalog({
      appRoot: REPO_ROOT,
      overrideRoot: override,
    });
    expect(snap.decks['deck-a'].every((e) => e.source === 'bundled')).toBe(true);
    expect(snap.decks['deck-a'].length).toBe(
      loadModeCatalog({ appRoot: REPO_ROOT, env: {} }).decks['deck-a'].length,
    );
  });

  test('override shadows one slug only; fallback builtins remain bundled', () => {
    const override = tempDir();
    const deckA = join(override, 'decks', 'deck-a');
    writePreset(deckA, 'tunnel', {
      id: 'tunnel',
      slug: 'tunnel',
      label: 'Operator Tunnel',
      legacyIndex: 99,
    });

    const snap = loadModeCatalog({ appRoot: REPO_ROOT, overrideRoot: override });
    const a = snap.decks['deck-a'];
    const tunnel = a.find((e) => e.slug === 'tunnel');
    const beams = a.find((e) => e.slug === 'beams');
    expect(tunnel?.source).toBe('override');
    expect(tunnel?.label).toBe('Operator Tunnel');
    expect(tunnel?.legacyIndex).toBe(99);
    expect(beams?.source).toBe('bundled');
    // Deck B untouched — still full bundled
    expect(snap.decks['deck-b'].every((e) => e.source === 'bundled')).toBe(true);
  });

  test('override-only new slug appears', () => {
    const override = tempDir();
    writePreset(join(override, 'decks', 'deck-b'), 'operator-pack', {
      id: 'operator-pack',
      slug: 'operator-pack',
      label: 'Operator Pack',
    });
    const snap = loadModeCatalog({ appRoot: REPO_ROOT, overrideRoot: override });
    expect(snap.decks['deck-b'].some((e) => e.slug === 'operator-pack')).toBe(true);
    expect(snap.decks['deck-b'].find((e) => e.slug === 'operator-pack')?.source).toBe('override');
    expect(snap.decks['deck-a'].some((e) => e.slug === 'operator-pack')).toBe(false);
  });
});

describe('epoch + content hash', () => {
  test('noop rescan keeps epoch; content change bumps epoch', () => {
    const first = loadModeCatalog({ appRoot: REPO_ROOT, env: {} });
    const second = loadModeCatalog({
      appRoot: REPO_ROOT,
      env: {},
      previous: first,
    });
    expect(second.epoch).toBe(first.epoch);
    expect(second.contentHash).toBe(first.contentHash);

    const override = tempDir();
    writePreset(join(override, 'decks', 'deck-a'), 'tunnel', {
      id: 'tunnel',
      slug: 'tunnel',
      label: 'Changed',
    });
    const third = loadModeCatalog({
      appRoot: REPO_ROOT,
      overrideRoot: override,
      previous: second,
    });
    expect(third.contentHash).not.toBe(second.contentHash);
    expect(third.epoch).toBe(second.epoch + 1);

    // hash helper is deterministic
    expect(catalogContentHash(third.decks)).toBe(third.contentHash);
  });

  test('buildCatalogSnapshot uses fixed clock for scannedAt', () => {
    const dirs = resolveDataDirs({
      bundledRoot: BUNDLED_DATA,
      env: {},
      cwd: REPO_ROOT,
    });
    const snap = buildCatalogSnapshot(dirs, null, () => new Date('2026-01-02T03:04:05.000Z'));
    expect(snap.scannedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(snap.epoch).toBe(1);
  });
});

describe('path sandbox', () => {
  test('allows relative assets under root', () => {
    const root = tempDir();
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'assets', 'tex.png'), 'x');
    const p = resolveSandboxedAssetPath(root, 'assets/tex.png');
    expect(p).toBe(resolve(root, 'assets/tex.png'));
  });

  test('rejects .. escapes and absolute paths', () => {
    const root = tempDir();
    expect(resolveSandboxedAssetPath(root, '../secret')).toBeNull();
    expect(resolveSandboxedAssetPath(root, 'assets/../../etc/passwd')).toBeNull();
    expect(resolveSandboxedAssetPath(root, '/etc/passwd')).toBeNull();
    expect(resolveSandboxedAssetPath(root, '')).toBeNull();
    expect(resolveSandboxedAssetPath(root, 'assets/\0evil')).toBeNull();
  });
});
