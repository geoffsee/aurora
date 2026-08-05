#!/usr/bin/env bun
/**
 * Build a `.aurora-look` archive from WGSL + metadata.
 * Optionally POST to the bridge import API or install into a data dir.
 *
 * Usage:
 *   bun run .agents/skills/aurora-create-visualization/scripts/build-look.ts \
 *     --slug glass-drift --label "Glass Drift" --wgsl ./look.wgsl \
 *     --out /tmp/glass-drift.aurora-look
 *
 *   # import via HTTP (bridge must have AURORA_DATA_DIR)
 *   ... --import-http http://127.0.0.1:3000
 *
 *   # install dual-deck packs without HTTP
 *   ... --import-dir "$AURORA_DATA_DIR"
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installAuroraLookArchive } from '../../../../bridge/look-import.ts';
import {
  type AuroraLookDefaults,
  auroraLookFileName,
  buildAuroraLookArchive,
  buildManifest,
  PACK_V1_AUTHORING_TEMPLATE,
  parseAuroraLookArchive,
} from '../../../../shared/aurora-look.ts';

function usage(): never {
  console.error(`Usage: build-look.ts --slug <kebab> --label <name> [options]

Options:
  --wgsl <path>           WGSL source file (default: built-in authoring template)
  --character <text>      short brief
  --ui-group <name>       default field-motion
  --out <path>            write archive (default: ./<slug>.aurora-look)
  --defaults <json>       e.g. '{"intensity":0.7,"depth":0.4}'
  --import-http <origin>  POST archive to <origin>/api/looks/import
  --import-dir <path>     install dual-deck packs under this data dir
  --show-form             mark/export as show form (WGSL must already be show-shaped)
`);
  process.exit(2);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

const slug = arg('--slug');
const label = arg('--label');
if (!slug || !label) usage();

const wgslPath = arg('--wgsl');
const wgsl = wgslPath ? readFileSync(resolve(wgslPath), 'utf8') : PACK_V1_AUTHORING_TEMPLATE;

const character = arg('--character');
const uiGroup = arg('--ui-group') ?? 'field-motion';
const showForm = hasFlag('--show-form');
const outPath = resolve(arg('--out') ?? auroraLookFileName(slug));

let defaults: AuroraLookDefaults | undefined;
const defaultsRaw = arg('--defaults');
if (defaultsRaw) {
  defaults = JSON.parse(defaultsRaw) as AuroraLookDefaults;
}

const archive = buildAuroraLookArchive({
  manifest: buildManifest({
    slug,
    label,
    character,
    uiGroup,
    wgslForm: showForm ? 'show' : 'authoring',
  }),
  wgsl,
  defaults,
});

const parsed = parseAuroraLookArchive(archive);
if (!parsed.ok) {
  console.error('Archive failed validation after build:');
  for (const e of parsed.errors) {
    console.error(`  ${e.path}: ${e.message}`);
  }
  process.exit(1);
}

writeFileSync(outPath, archive);
console.log(
  `wrote ${outPath} (${archive.byteLength} bytes) slug=${slug} form=${parsed.bundle.manifest.wgslForm}`,
);

const importDir = arg('--import-dir');
if (importDir) {
  const result = installAuroraLookArchive(archive, { dataDir: resolve(importDir) });
  if (!result.ok) {
    console.error('install failed:');
    for (const e of result.errors) console.error(`  ${e.path}: ${e.message}`);
    process.exit(1);
  }
  console.log(
    `installed dual-deck under ${resolve(importDir)} overwritten=${result.overwritten} wgsl=${result.wgslFile}`,
  );
}

const importHttp = arg('--import-http');
if (importHttp) {
  const origin = importHttp.replace(/\/$/, '');
  const res = await fetch(`${origin}/api/looks/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: archive,
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error(`import HTTP ${res.status}:`, body);
    process.exit(1);
  }
  console.log('import HTTP ok:', body);
}
