/**
 * Offline mode-pack validator (issue #249).
 *
 * Scans a data-dir root (`decks/deck-a`, `decks/deck-b`) or a single preset.json,
 * runs validateModePreset, reports errors, exits non-zero on failure.
 *
 * Pure scan helpers are exported for unit tests (no process.exit in those paths).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { MODE_PRESET_SLUG_RE, validateModePreset } from '../shared/mode-preset-schema.ts';

export const DECK_IDS = ['deck-a', 'deck-b'] as const;
export type DeckId = (typeof DECK_IDS)[number];

export type PackIssue = {
  /** Absolute or repo-relative path shown to the operator. */
  path: string;
  errors: string[];
};

export type ValidateScanResult = {
  /** Pack folders (or single files) that were validated. */
  scanned: number;
  ok: number;
  failed: number;
  issues: PackIssue[];
  /** Human-readable skip notes (missing roots, .tmp folders, etc.). */
  notes: string[];
};

const SLUG_RE = MODE_PRESET_SLUG_RE;

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Validate one pack folder: must contain preset.json; folder name is the slug.
 */
export function validatePackFolder(packDir: string): PackIssue | null {
  const root = resolve(packDir);
  const folderSlug = basename(root);
  const presetPath = join(root, 'preset.json');
  const errors: string[] = [];

  if (!SLUG_RE.test(folderSlug)) {
    errors.push(
      `folder name must be kebab-case slug [a-z0-9]+(?:-[a-z0-9]+)* (got ${JSON.stringify(folderSlug)})`,
    );
  }

  if (!existsSync(presetPath) || !isFile(presetPath)) {
    errors.push('missing preset.json');
    return { path: root, errors };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(presetPath, 'utf8')) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { path: presetPath, errors: [`invalid JSON: ${msg}`] };
  }

  const validated = validateModePreset(raw);
  if (!validated.ok) {
    errors.push(...validated.errors);
  } else if (validated.value.slug !== folderSlug) {
    errors.push(
      `slug ${JSON.stringify(validated.value.slug)} must match folder name ${JSON.stringify(folderSlug)}`,
    );
  }

  if (errors.length > 0) return { path: presetPath, errors };
  return null;
}

/**
 * Validate a single preset.json file (no folder slug check beyond JSON contents).
 */
export function validatePresetFile(filePath: string): PackIssue | null {
  const path = resolve(filePath);
  if (!existsSync(path) || !isFile(path)) {
    return { path, errors: ['file not found'] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { path, errors: [`invalid JSON: ${msg}`] };
  }

  const validated = validateModePreset(raw);
  if (!validated.ok) return { path, errors: validated.errors };

  // Only enforce folder/slug match for on-disk pack layout (`…/<slug>/preset.json`).
  // Flat fixtures like `supernova-stub.preset.json` skip this check.
  if (basename(path) === 'preset.json') {
    const parent = basename(dirname(path));
    if (parent !== '.' && SLUG_RE.test(parent) && validated.value.slug !== parent) {
      return {
        path,
        errors: [
          `slug ${JSON.stringify(validated.value.slug)} must match parent folder ${JSON.stringify(parent)}`,
        ],
      };
    }
  }

  return null;
}

/**
 * Scan a data-dir root for packs under decks/deck-a and decks/deck-b.
 * Missing deck roots are notes, not failures. Zero packs is success.
 */
export function scanModeDataRoot(dataRoot: string): ValidateScanResult {
  const root = resolve(dataRoot);
  const issues: PackIssue[] = [];
  const notes: string[] = [];
  let scanned = 0;
  let ok = 0;
  let failed = 0;

  if (!existsSync(root)) {
    notes.push(`data root does not exist: ${root}`);
    return { scanned, ok, failed, issues, notes };
  }

  if (!isDirectory(root)) {
    notes.push(`data root is not a directory: ${root}`);
    return { scanned, ok, failed, issues, notes };
  }

  for (const deck of DECK_IDS) {
    const deckRoot = join(root, 'decks', deck);
    if (!existsSync(deckRoot)) {
      notes.push(`no ${deck} root at ${deckRoot}`);
      continue;
    }
    if (!isDirectory(deckRoot)) {
      notes.push(`not a directory: ${deckRoot}`);
      continue;
    }

    let names: string[];
    try {
      names = readdirSync(deckRoot);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notes.push(`cannot read ${deckRoot}: ${msg}`);
      continue;
    }

    for (const name of names) {
      if (name.endsWith('.tmp')) {
        notes.push(`skip .tmp folder: ${join(deckRoot, name)}`);
        continue;
      }
      if (name.startsWith('.')) {
        notes.push(`skip hidden: ${join(deckRoot, name)}`);
        continue;
      }

      const packPath = join(deckRoot, name);
      if (!isDirectory(packPath)) continue;

      if (!SLUG_RE.test(name)) {
        scanned += 1;
        failed += 1;
        issues.push({
          path: packPath,
          errors: [
            `folder name must be kebab-case slug [a-z0-9]+(?:-[a-z0-9]+)* (got ${JSON.stringify(name)})`,
          ],
        });
        continue;
      }

      scanned += 1;
      const issue = validatePackFolder(packPath);
      if (issue) {
        failed += 1;
        issues.push(issue);
      } else {
        ok += 1;
      }
    }
  }

  return { scanned, ok, failed, issues, notes };
}

/**
 * Resolve CLI target: single .json file, or data root (default ./data).
 */
export function validateTarget(target: string): ValidateScanResult {
  const path = resolve(target);

  if (existsSync(path) && isFile(path) && path.endsWith('.json')) {
    const issue = validatePresetFile(path);
    if (issue) {
      return {
        scanned: 1,
        ok: 0,
        failed: 1,
        issues: [issue],
        notes: [],
      };
    }
    return { scanned: 1, ok: 1, failed: 0, issues: [], notes: [] };
  }

  return scanModeDataRoot(path);
}

function formatResult(result: ValidateScanResult): string {
  const lines: string[] = [];
  lines.push(
    `modes:validate — scanned ${result.scanned}, ok ${result.ok}, failed ${result.failed}`,
  );
  for (const note of result.notes) {
    lines.push(`  note: ${note}`);
  }
  for (const issue of result.issues) {
    lines.push(`  FAIL ${issue.path}`);
    for (const err of issue.errors) {
      lines.push(`    - ${err}`);
    }
  }
  if (result.failed === 0) {
    lines.push('PASS');
  } else {
    lines.push('FAIL');
  }
  return lines.join('\n');
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const target = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'data';
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(`Usage: bun run modes:validate [data-root|preset.json]

  data-root   Directory with decks/deck-a and decks/deck-b (default: ./data)
  preset.json Validate a single authoring file

Exit 0 when every discovered pack is valid (including zero packs).
Exit 1 when any pack fails validateModePreset or folder/slug rules.
`);
    return 0;
  }

  const result = validateTarget(target);
  console.log(formatResult(result));
  return result.failed > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main());
}
