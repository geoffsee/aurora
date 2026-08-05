import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { stageStaticModeCatalog } from '../../scripts/stage-static-mode-catalog.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('stageStaticModeCatalog', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    dirs.length = 0;
  });

  test('writes public catalog and per-slug compiled wires', () => {
    const outRoot = mkdtempSync(join(tmpdir(), 'aurora-static-catalog-'));
    dirs.push(outRoot);

    const result = stageStaticModeCatalog({ appRoot: repoRoot, outRoot });
    expect(result.compiledCount).toBe(100);
    expect(result.catalog.epoch).toBeGreaterThanOrEqual(1);
    expect(result.catalog.decks['deck-a']).toHaveLength(50);
    expect(result.catalog.decks['deck-b']).toHaveLength(50);

    const catalogPath = join(outRoot, 'api/modes/catalog.json');
    expect(existsSync(catalogPath)).toBe(true);
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
      contentHash: string;
      decks: { 'deck-a': { slug: string }[] };
    };
    expect(catalog.contentHash).toBe(result.catalog.contentHash);
    expect(catalog.decks['deck-a'].some((e) => e.slug === 'beams')).toBe(true);

    const beams = JSON.parse(
      readFileSync(join(outRoot, 'api/modes/compiled/deck-a/beams.json'), 'utf8'),
    ) as { wireVersion: number; slug: string; deck: string };
    expect(beams.wireVersion).toBe(1);
    expect(beams.slug).toBe('beams');
    expect(beams.deck).toBe('deck-a');

    expect(existsSync(join(outRoot, 'api/modes/compiled/deck-b/tunnel.json'))).toBe(true);
  });
});
