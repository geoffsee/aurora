#!/usr/bin/env bun
/**
 * Stage only ship:true glTF models into dist/assets/models for GitHub Pages.
 *
 * Avoids copying the assets/models → ../models symlink wholesale (which would
 * ship 200MB+ of local-only packs, or a broken symlink on Linux CI).
 *
 * Usage: bun run scripts/stage-web-models.ts
 * Expects: dist/ already exists; models/manifest.json + shipped GLBs on disk.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = join(import.meta.dir, '..');
const manifestPath = join(root, 'models/manifest.json');
const outModels = join(root, 'dist/assets/models');

type ManifestEntry = {
  id: string;
  assetPath: string;
  ship?: boolean;
};

type Manifest = {
  schemaVersion: number;
  models: ManifestEntry[];
};

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
const shipped = manifest.models.filter((m) => m.ship === true);

if (shipped.length === 0) {
  console.error('[stage-web-models] no ship:true entries in models/manifest.json');
  process.exit(1);
}

mkdirSync(outModels, { recursive: true });
copyFileSync(manifestPath, join(outModels, 'manifest.json'));
for (const name of ['README.md', 'SOURCES.md'] as const) {
  const src = join(root, 'models', name);
  if (existsSync(src)) {
    copyFileSync(src, join(outModels, name));
  }
}

let totalBytes = 0;
for (const entry of shipped) {
  // assetPath is relative to assets/ (e.g. models/cesium-man/source/CesiumMan.glb)
  const relFromModels = entry.assetPath.replace(/^models\//, '');
  const src = join(root, 'models', relFromModels);
  const dest = join(outModels, relFromModels);
  if (!existsSync(src)) {
    console.error(`[stage-web-models] missing shipped GLB: ${src}`);
    console.error('  Commit the web pack under models/<id>/source/ or fix ship flags.');
    process.exit(1);
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  const size = statSync(src).size;
  totalBytes += size;
  console.log(`  + ${entry.id}  ${(size / 1024).toFixed(0)} KB  (${relative(root, dest)})`);
}

const maxMb = 12;
const totalMb = totalBytes / (1024 * 1024);
console.log(
  `[stage-web-models] staged ${shipped.length} models, ${totalMb.toFixed(2)} MB → dist/assets/models`,
);
if (totalMb > maxMb) {
  console.error(
    `[stage-web-models] web pack is ${totalMb.toFixed(2)} MB (budget ${maxMb} MB). Drop ship:true entries or shrink GLBs.`,
  );
  process.exit(1);
}
