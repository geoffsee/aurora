#!/usr/bin/env bun
/**
 * Stage the bundled mode catalog + precompiled CompiledModeWire payloads for
 * static hosting (GitHub Pages).
 *
 * Layout (under dist/):
 *   api/modes/catalog.json
 *   api/modes/compiled/deck-a/<slug>.json
 *   api/modes/compiled/deck-b/<slug>.json
 *
 * Live bridge still serves GET /api/modes/catalog and query-string compiled
 * routes; static clients use these path-based files when isStaticHosting().
 *
 * Usage: bun run scripts/stage-static-mode-catalog.ts
 * Expects: data/decks present; creates dist/ if needed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  compileFromEntry,
  type PublicCatalogSnapshot,
  toPublicCatalog,
} from '../bridge/mode-api.ts';
import { type DeckId, loadModeCatalog } from '../bridge/mode-catalog.ts';

export type StageStaticModeCatalogResult = {
  outRoot: string;
  catalog: PublicCatalogSnapshot;
  compiledCount: number;
};

/**
 * Compile the bundled catalog into static JSON files under `outRoot`.
 * @param opts.appRoot repo root (parent of `data/`)
 * @param opts.outRoot destination root (default `<appRoot>/dist`)
 */
export function stageStaticModeCatalog(opts: {
  appRoot: string;
  outRoot?: string;
}): StageStaticModeCatalogResult {
  const appRoot = resolve(opts.appRoot);
  const outRoot = resolve(opts.outRoot ?? join(appRoot, 'dist'));
  const catalogOut = join(outRoot, 'api/modes/catalog.json');

  const snapshot = loadModeCatalog({ appRoot });
  const publicCatalog = toPublicCatalog(snapshot);

  mkdirSync(join(outRoot, 'api/modes'), { recursive: true });
  writeFileSync(catalogOut, `${JSON.stringify(publicCatalog)}\n`, 'utf8');

  const decks: DeckId[] = ['deck-a', 'deck-b'];
  let ok = 0;
  const failures: string[] = [];

  for (const deck of decks) {
    const deckDir = join(outRoot, 'api/modes/compiled', deck);
    mkdirSync(deckDir, { recursive: true });
    for (const entry of snapshot.decks[deck]) {
      const compiled = compileFromEntry(entry, snapshot.epoch, deck);
      if (!compiled.ok) {
        failures.push(`${deck}/${entry.slug}: ${compiled.errors.join('; ')}`);
        continue;
      }
      const outPath = join(deckDir, `${entry.slug}.json`);
      writeFileSync(outPath, `${JSON.stringify(compiled.wire)}\n`, 'utf8');
      ok += 1;
    }
  }

  if (failures.length > 0) {
    const msg = failures.map((f) => `  ${f}`).join('\n');
    throw new Error(`[stage-static-mode-catalog] compile failures:\n${msg}`);
  }

  return { outRoot, catalog: publicCatalog, compiledCount: ok };
}

const isMain =
  typeof Bun !== 'undefined' && Bun.main && resolve(Bun.main) === resolve(import.meta.path);

if (isMain) {
  const root = resolve(import.meta.dir, '..');
  const outOverride = process.env.AURORA_STATIC_CATALOG_OUT?.trim();
  try {
    const result = stageStaticModeCatalog({
      appRoot: root,
      outRoot: outOverride || undefined,
    });
    const a = result.catalog.decks['deck-a'].length;
    const b = result.catalog.decks['deck-b'].length;
    console.log(
      `[stage-static-mode-catalog] epoch=${result.catalog.epoch} hash=${result.catalog.contentHash}` +
        ` catalog deck-a=${a} deck-b=${b} compiled=${result.compiledCount}` +
        ` → ${result.outRoot}/api/modes/`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
