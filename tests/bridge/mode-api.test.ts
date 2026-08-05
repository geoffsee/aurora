/**
 * Mode API: catalog public shape, compile cache, epoch retention, asset sandbox.
 * Tests ModeApi pure handlers — no full Bun.serve.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  compileFromEntry,
  compileFromEntryAsync,
  MODE_API_EPOCH_RETENTION,
  MODE_API_MAX_ASSET_BYTES,
  ModeApi,
  modeAssetBase,
  modesCatalogWsMessage,
  parseModeAssetPath,
  resolveSandboxedRealPath,
  toPublicCatalog,
} from '../../bridge/mode-api.ts';
import type { CatalogEntry, CatalogSnapshot } from '../../bridge/mode-catalog.ts';
import { COMPILED_MODE_WIRE_VERSION } from '../../shared/compiled-mode-wire.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SUPERNOVA_FIXTURE = join(REPO_ROOT, 'tests/fixtures/modes/supernova-stub.preset.json');

const tempRoots: string[] = [];

function tempDir(prefix = 'aurora-mode-api-'): string {
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

function writeValidPreset(
  deckRoot: string,
  slug: string,
  overrides: Record<string, unknown> = {},
  assets?: Record<string, string | Buffer>,
): string {
  const folder = join(deckRoot, slug);
  mkdirSync(folder, { recursive: true });
  const body = {
    schemaVersion: 1,
    id: slug,
    slug,
    label: slug
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' '),
    disposition: 'field-primitive',
    field: {
      primitive: 'beams',
      params: { intensity: 0.8 },
    },
    layers: [],
    suppressLegacyField: true,
    ...overrides,
  };
  writeFileSync(join(folder, 'preset.json'), JSON.stringify(body, null, 2));
  if (assets) {
    const assetsDir = join(folder, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    for (const [name, content] of Object.entries(assets)) {
      writeFileSync(join(assetsDir, name), content);
    }
  }
  return folder;
}

function makeEntry(folder: string, slug: string, extras: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug,
    id: slug,
    path: folder,
    source: 'bundled',
    ...extras,
  };
}

function snapshotFromEntries(
  epoch: number,
  deckA: CatalogEntry[],
  deckB: CatalogEntry[] = [],
): CatalogSnapshot {
  return {
    epoch,
    scannedAt: new Date().toISOString(),
    contentHash: `hash-${epoch}`,
    decks: {
      'deck-a': deckA,
      'deck-b': deckB,
    },
  };
}

// ── Public catalog ───────────────────────────────────────────────────────────

describe('toPublicCatalog', () => {
  test('strips absolute host paths; keeps slug/id/label/legacyIndex/uiGroup/source', () => {
    const snap = snapshotFromEntries(3, [
      makeEntry('/secret/host/path/beams', 'beams', {
        label: 'Beams',
        legacyIndex: 0,
        uiGroup: 'field-motion',
      }),
    ]);
    const pub = toPublicCatalog(snap);
    expect(pub.epoch).toBe(3);
    expect(pub.decks['deck-a']).toHaveLength(1);
    const e = pub.decks['deck-a'][0];
    expect(e).toEqual({
      slug: 'beams',
      id: 'beams',
      source: 'bundled',
      label: 'Beams',
      legacyIndex: 0,
      uiGroup: 'field-motion',
    });
    expect(JSON.stringify(pub)).not.toContain('/secret');
    expect(JSON.stringify(pub)).not.toContain('path');
  });
});

describe('modesCatalogWsMessage', () => {
  test('matches control-state-style envelope', () => {
    const pub = toPublicCatalog(snapshotFromEntries(1, []));
    const msg = modesCatalogWsMessage(pub);
    expect(msg.address).toBe('/aurora/modes/catalog');
    expect(msg.args).toEqual([pub]);
  });
});

// ── Asset path parser ────────────────────────────────────────────────────────

describe('parseModeAssetPath', () => {
  test('parses epoch/deck/slug/relpath', () => {
    expect(parseModeAssetPath('/api/data/e/4/decks/deck-a/beams/assets/foo.png')).toEqual({
      epoch: 4,
      deck: 'deck-a',
      slug: 'beams',
      relPath: 'assets/foo.png',
    });
  });

  test('rejects non-matching shapes', () => {
    expect(parseModeAssetPath('/api/modes/catalog')).toBeNull();
    expect(parseModeAssetPath('/api/data/e/1/decks/deck-a/beams')).toBeNull();
    expect(parseModeAssetPath('/api/data/e/x/decks/deck-a/beams/preset.json')).toBeNull();
  });
});

// ── Compile from entry ───────────────────────────────────────────────────────

describe('compileFromEntry', () => {
  test('compiles valid preset with epoch-scoped assetBase', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams', {
      legacyIndex: 0,
      field: { primitive: 'beams', params: { intensity: 0.5 } },
    });
    const entry = makeEntry(folder, 'beams', { legacyIndex: 0, label: 'Beams' });
    const result = compileFromEntry(entry, 7, 'deck-a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wire.wireVersion).toBe(COMPILED_MODE_WIRE_VERSION);
    expect(result.wire.epoch).toBe(7);
    expect(result.wire.deck).toBe('deck-a');
    expect(result.wire.slug).toBe('beams');
    expect(result.wire.assetBase).toBe(modeAssetBase(7, 'deck-a', 'beams'));
    expect(result.wire.field?.primitiveName).toBe('beams');
    expect(result.wire.field?.params.intensity).toBe(0.5);
  });

  test('fail-closed on catalog-minimal preset missing schemaVersion', () => {
    const root = tempDir();
    const folder = join(root, 'beams');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'preset.json'),
      JSON.stringify({ id: 'beams', slug: 'beams', label: 'Beams', legacyIndex: 0 }),
    );
    const result = compileFromEntry(makeEntry(folder, 'beams'), 1, 'deck-a');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('same inputs → same wire (pure)', () => {
    const raw = JSON.parse(readFileSync(SUPERNOVA_FIXTURE, 'utf8')) as Record<string, unknown>;
    const root = tempDir();
    const folder = join(root, 'supernova-stub');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'preset.json'), JSON.stringify(raw));
    const entry = makeEntry(folder, 'supernova-stub');
    const a = compileFromEntry(entry, 3, 'deck-b');
    const b = compileFromEntry(entry, 3, 'deck-b');
    expect(a).toEqual(b);
  });

  test('async compile attaches pack fullscreen WGSL (WASM-ready)', async () => {
    const root = tempDir();
    const wgsl = `#import bevy_sprite::mesh2d_vertex_output::VertexOutput
@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(0.2, 0.4, 0.9, palette_extra.w);
}
`;
    const folder = writeValidPreset(
      root,
      'plasma',
      {
        disposition: 'fullscreen-primary',
        field: undefined,
        layers: [{ kind: 'fullscreen', ref: 'look.wgsl' }],
        suppressLegacyField: true,
      },
      { 'look.wgsl': wgsl },
    );
    // writeValidPreset puts assets under assets/; ref should match.
    // Re-write with ref under assets/ so sandbox resolve works.
    writeFileSync(
      join(folder, 'preset.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'plasma',
          slug: 'plasma',
          label: 'Plasma',
          disposition: 'fullscreen-primary',
          suppressLegacyField: true,
          layers: [{ kind: 'fullscreen', ref: 'assets/look.wgsl' }],
        },
        null,
        2,
      ),
    );
    writeFileSync(join(folder, 'assets', 'look.wgsl'), wgsl);

    const entry = makeEntry(folder, 'plasma');
    const result = await compileFromEntryAsync(entry, 4, 'deck-a');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const layer = result.wire.layers.find((l) => l.kind === 'fullscreen');
    expect(layer?.wgsl).toBeDefined();
    expect(layer?.wgsl).toContain('fn fragment');
    expect(result.wire.suppressLegacyField).toBe(true);
  });

  test('>1 fullscreen layer fails compile (soft-fail errors)', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'stack', {
      disposition: 'fullscreen-primary',
      field: undefined,
      layers: [
        { kind: 'fullscreen', ref: 'a.wgsl' },
        { kind: 'fullscreen', ref: 'b.wgsl' },
      ],
      suppressLegacyField: true,
    });
    writeFileSync(
      join(folder, 'preset.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'stack',
          slug: 'stack',
          label: 'Stack',
          disposition: 'fullscreen-primary',
          suppressLegacyField: true,
          layers: [
            { kind: 'fullscreen', ref: 'a.wgsl' },
            { kind: 'fullscreen', ref: 'b.wgsl' },
          ],
        },
        null,
        2,
      ),
    );
    const result = compileFromEntry(makeEntry(folder, 'stack'), 1, 'deck-a');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('fullscreen'))).toBe(true);
  });
});

// ── ModeApi store ────────────────────────────────────────────────────────────

describe('ModeApi catalog + compiled', () => {
  test('catalog endpoint shape via getPublicCatalog', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'tunnel');
    const api = new ModeApi(
      snapshotFromEntries(1, [makeEntry(folder, 'tunnel', { label: 'Tunnel' })]),
    );
    const pub = api.getPublicCatalog();
    expect(pub.epoch).toBe(1);
    expect(pub.decks['deck-a'][0]?.slug).toBe('tunnel');
    expect(pub.decks['deck-a'][0]).not.toHaveProperty('path');
  });

  test('compile cache hit returns identical wire without re-read side effects', async () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const api = new ModeApi(snapshotFromEntries(2, [makeEntry(folder, 'beams')]));
    const first = await api.getCompiled({ deck: 'deck-a', slug: 'beams', epoch: 2 });
    expect(first.status).toBe(200);
    // Corrupt on-disk preset; cache must still serve first compile.
    writeFileSync(join(folder, 'preset.json'), '{ not valid');
    const second = await api.getCompiled({ deck: 'deck-a', slug: 'beams', epoch: 2 });
    expect(second).toEqual(first);
  });

  test('omitted epoch uses current', async () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const api = new ModeApi(snapshotFromEntries(5, [makeEntry(folder, 'beams')]));
    const r = await api.getCompiled({ deck: 'deck-a', slug: 'beams', epoch: null });
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.wire.epoch).toBe(5);
  });

  test('wrong / unretained epoch → 410', async () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]));
    const r = await api.getCompiled({ deck: 'deck-a', slug: 'beams', epoch: 99 });
    expect(r.status).toBe(410);
  });

  test('missing slug → 404', async () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]));
    const r = await api.getCompiled({ deck: 'deck-a', slug: 'nope', epoch: 1 });
    expect(r.status).toBe(404);
  });

  test('invalid deck/slug query → 400', async () => {
    const api = new ModeApi(snapshotFromEntries(1, []));
    expect((await api.getCompiled({ deck: 'deck-c', slug: 'beams', epoch: 1 })).status).toBe(400);
    expect((await api.getCompiled({ deck: 'deck-a', slug: 'Bad_Slug', epoch: 1 })).status).toBe(
      400,
    );
  });

  test('compile fail → 422 with errors (fail-closed)', async () => {
    const root = tempDir();
    const folder = join(root, 'bad');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'preset.json'),
      JSON.stringify({ id: 'bad', slug: 'bad', label: 'Bad' }),
    );
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'bad')]));
    const r = await api.getCompiled({ deck: 'deck-a', slug: 'bad', epoch: 1 });
    expect(r.status).toBe(422);
    if (r.status !== 422) return;
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test('handleCompiledRequest returns Response JSON', async () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]));
    const res = await api.handleCompiledRequest(
      new URL('http://localhost/api/modes/compiled?deck=deck-a&slug=beams&epoch=1'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string; epoch: number };
    expect(body.slug).toBe('beams');
    expect(body.epoch).toBe(1);
  });
});

// ── Retention ────────────────────────────────────────────────────────────────

describe('ModeApi epoch retention', () => {
  test(`keeps last ${MODE_API_EPOCH_RETENTION} epochs; drops older`, async () => {
    const root = tempDir();
    const folders: string[] = [];
    for (let i = 0; i < 6; i++) {
      folders.push(writeValidPreset(root, `mode-${i}`));
    }

    const firstFolder = folders[0];
    expect(firstFolder).toBeDefined();
    if (!firstFolder) return;
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(firstFolder, 'mode-0')]), {
      retention: MODE_API_EPOCH_RETENTION,
    });

    // Bump through epochs 2..6, each with a distinct slug so content would differ.
    for (let epoch = 2; epoch <= 6; epoch++) {
      const folder = folders[epoch - 1];
      expect(folder).toBeDefined();
      if (!folder) return;
      const advanced = api.applySnapshot(
        snapshotFromEntries(epoch, [makeEntry(folder, `mode-${epoch - 1}`)]),
      );
      expect(advanced).toBe(true);
    }

    const retained = api.retainedEpochs();
    expect(retained).toEqual([3, 4, 5, 6]);
    expect(retained).not.toContain(1);
    expect(retained).not.toContain(2);

    // Epoch 1 and 2 gone → 410; epoch 3 still served.
    expect((await api.getCompiled({ deck: 'deck-a', slug: 'mode-0', epoch: 1 })).status).toBe(410);
    expect((await api.getCompiled({ deck: 'deck-a', slug: 'mode-1', epoch: 2 })).status).toBe(410);
    expect((await api.getCompiled({ deck: 'deck-a', slug: 'mode-2', epoch: 3 })).status).toBe(200);
    expect((await api.getCompiled({ deck: 'deck-a', slug: 'mode-5', epoch: 6 })).status).toBe(200);
  });

  test('same-epoch apply does not clear compile cache and returns false', async () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const snap1 = snapshotFromEntries(1, [makeEntry(folder, 'beams')]);
    const api = new ModeApi(snap1);
    expect((await api.getCompiled({ deck: 'deck-a', slug: 'beams', epoch: 1 })).status).toBe(200);

    writeFileSync(join(folder, 'preset.json'), '{ broken');
    const advanced = api.applySnapshot({
      ...snap1,
      scannedAt: new Date().toISOString(),
    });
    expect(advanced).toBe(false);
    // Cache still holds good compile from before disk corruption.
    expect((await api.getCompiled({ deck: 'deck-a', slug: 'beams', epoch: 1 })).status).toBe(200);
  });

  test('compile is bound to its epoch entry (no cross-epoch mix)', async () => {
    const root = tempDir();
    const a1 = writeValidPreset(root, 'shared', {
      field: { primitive: 'beams', params: { intensity: 0.1 } },
    });
    const a2 = writeValidPreset(join(root, 'epoch2'), 'shared', {
      field: { primitive: 'beams', params: { intensity: 0.9 } },
    });

    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(a1, 'shared')]));
    const r1 = await api.getCompiled({ deck: 'deck-a', slug: 'shared', epoch: 1 });
    expect(r1.status).toBe(200);
    if (r1.status !== 200) return;
    expect(r1.wire.field?.params.intensity).toBe(0.1);
    expect(r1.wire.assetBase).toBe('/api/data/e/1/decks/deck-a/shared/');

    api.applySnapshot(snapshotFromEntries(2, [makeEntry(a2, 'shared')]));
    const r2 = await api.getCompiled({ deck: 'deck-a', slug: 'shared', epoch: 2 });
    expect(r2.status).toBe(200);
    if (r2.status !== 200) return;
    expect(r2.wire.field?.params.intensity).toBe(0.9);
    expect(r2.wire.assetBase).toBe('/api/data/e/2/decks/deck-a/shared/');

    // Epoch 1 selection still pure over epoch-1 entry.
    const r1Again = await api.getCompiled({ deck: 'deck-a', slug: 'shared', epoch: 1 });
    expect(r1Again).toEqual(r1);
  });
});

// ── Asset serve + sandbox ────────────────────────────────────────────────────

describe('ModeApi asset serve + sandbox', () => {
  test('serves asset under retained epoch with correct MIME', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams', {}, { 'tex.png': 'fakepng' });
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]));
    const r = api.getAsset({
      epoch: 1,
      deck: 'deck-a',
      slug: 'beams',
      relPath: 'assets/tex.png',
    });
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.contentType).toBe('image/png');
    expect(new TextDecoder().decode(r.body)).toBe('fakepng');
  });

  test('path escape (logical ..) rejected', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    // Sibling secret outside preset folder.
    writeFileSync(join(root, 'secret.txt'), 'nope');
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]));
    const r = api.getAsset({
      epoch: 1,
      deck: 'deck-a',
      slug: 'beams',
      relPath: '../secret.txt',
    });
    expect(r.status).toBe(400);
  });

  test('symlink escape rejected by realpath sandbox', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const outside = join(root, 'outside-secret.txt');
    writeFileSync(outside, 'classified');
    try {
      symlinkSync(outside, join(folder, 'escape-link.txt'));
    } catch {
      // Windows without symlink privilege — skip.
      return;
    }
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]));
    const r = api.getAsset({
      epoch: 1,
      deck: 'deck-a',
      slug: 'beams',
      relPath: 'escape-link.txt',
    });
    expect(r.status).toBe(400);
    // Direct realpath helper also rejects.
    expect(resolveSandboxedRealPath(folder, 'escape-link.txt')).toBeNull();
  });

  test('unretained epoch asset → 410', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams', {}, { 'a.txt': 'x' });
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]));
    const r = api.getAsset({
      epoch: 9,
      deck: 'deck-a',
      slug: 'beams',
      relPath: 'assets/a.txt',
    });
    expect(r.status).toBe(410);
  });

  test('size cap returns 413', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const big = Buffer.alloc(1024, 1);
    writeFileSync(join(folder, 'big.bin'), big);
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]), {
      maxAssetBytes: 100,
    });
    const r = api.getAsset({
      epoch: 1,
      deck: 'deck-a',
      slug: 'beams',
      relPath: 'big.bin',
    });
    expect(r.status).toBe(413);
  });

  test('missing asset → 404', () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams');
    const api = new ModeApi(snapshotFromEntries(1, [makeEntry(folder, 'beams')]));
    const r = api.getAsset({
      epoch: 1,
      deck: 'deck-a',
      slug: 'beams',
      relPath: 'assets/missing.png',
    });
    expect(r.status).toBe(404);
  });

  test('handleAssetRequest parses path and returns body', async () => {
    const root = tempDir();
    const folder = writeValidPreset(root, 'beams', {}, { 'note.txt': 'hello' });
    const api = new ModeApi(snapshotFromEntries(4, [makeEntry(folder, 'beams')]));
    const res = api.handleAssetRequest('/api/data/e/4/decks/deck-a/beams/assets/note.txt');
    expect(res).not.toBeNull();
    if (!res) return;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
    expect(res.headers.get('content-type')).toContain('text/plain');
  });
});

describe('constants', () => {
  test('retention and size caps are documented values', () => {
    expect(MODE_API_EPOCH_RETENTION).toBe(4);
    expect(MODE_API_MAX_ASSET_BYTES).toBe(8 * 1024 * 1024);
  });
});
