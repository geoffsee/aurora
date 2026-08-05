/**
 * Deck preset catalog: resolve data dirs, scan slug folders, overlay-merge by slug.
 *
 * Resolve order: AURORA_DATA_DIR / explicit override **overlays** the bundled
 * read-only `data/` tree. Override entries fully replace bundled for that slug
 * only — never replace the entire catalog, never deep-merge JSON, never copy
 * bundled → override on first run.
 *
 * Epoch is content-hash based: no-op rescans keep the same epoch; any change
 * to the merged catalog bumps epoch by 1 (monotonic).
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

export const DECK_IDS = ['deck-a', 'deck-b'] as const;
export type DeckId = (typeof DECK_IDS)[number];

export type CatalogSource = 'bundled' | 'override';

/** One selectable visualization pack under a deck root. */
export type CatalogEntry = {
  slug: string;
  id: string;
  /** Absolute path to the preset folder (contains preset.json). */
  path: string;
  source: CatalogSource;
  legacyIndex?: number;
  label?: string;
};

export type CatalogSnapshot = {
  /** Monotonic; bumps only when contentHash changes after a successful rescan. */
  epoch: number;
  /** ISO-8601 timestamp of the scan that produced this snapshot. */
  scannedAt: string;
  /**
   * Stable hash of merged catalog content (slug/id/source/path/label/legacyIndex).
   * Used to decide whether epoch should advance.
   */
  contentHash: string;
  decks: {
    'deck-a': CatalogEntry[];
    'deck-b': CatalogEntry[];
  };
};

export type ResolvedDataDirs = {
  /** Absolute path to bundled `data/` (read-only layer). */
  bundledRoot: string;
  /** Absolute path to override root, or null when unset/empty. */
  overrideRoot: string | null;
  decksBundled: Record<DeckId, string>;
  decksOverride: Record<DeckId, string | null>;
};

/** Kebab-case slug: lowercase letters, digits, single hyphens between segments. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(name: string): boolean {
  return typeof name === 'string' && SLUG_RE.test(name);
}

/**
 * Resolve bundled + optional override data roots.
 *
 * Override comes from `overrideRoot` option first, then `AURORA_DATA_DIR` env.
 * Empty / whitespace-only override is treated as missing (full bundled catalog).
 */
export function resolveDataDirs(opts: {
  bundledRoot: string;
  /** Explicit override (e.g. CLI `--data-dir`). Wins over env when provided. */
  overrideRoot?: string | null;
  env?: Record<string, string | undefined>;
  /** Base for resolving relative paths (default: process.cwd()). */
  cwd?: string;
}): ResolvedDataDirs {
  const cwd = opts.cwd ?? process.cwd();
  const bundledRoot = resolve(cwd, opts.bundledRoot);

  let overrideRaw: string | null | undefined = opts.overrideRoot;
  if (overrideRaw === undefined) {
    const env = opts.env ?? process.env;
    const fromEnv = env.AURORA_DATA_DIR;
    overrideRaw = fromEnv === undefined ? null : fromEnv;
  }

  const trimmed =
    typeof overrideRaw === 'string' && overrideRaw.trim() !== '' ? overrideRaw.trim() : null;
  const overrideRoot = trimmed === null ? null : resolve(cwd, trimmed);

  const decksBundled = {
    'deck-a': join(bundledRoot, 'decks', 'deck-a'),
    'deck-b': join(bundledRoot, 'decks', 'deck-b'),
  } as const;
  const decksOverride: Record<DeckId, string | null> = {
    'deck-a': overrideRoot ? join(overrideRoot, 'decks', 'deck-a') : null,
    'deck-b': overrideRoot ? join(overrideRoot, 'decks', 'deck-b') : null,
  };

  return { bundledRoot, overrideRoot, decksBundled, decksOverride };
}

/**
 * Parse and validate minimal preset.json metadata.
 * Required: id (non-empty string). slug, if present, must match folder name.
 * id is preferred as identity; when slug is omitted, id must equal folder slug.
 */
export function parsePresetMeta(
  raw: unknown,
  folderSlug: string,
): { id: string; label?: string; legacyIndex?: number } | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!id) return null;

  if (typeof o.slug === 'string') {
    const slug = o.slug.trim();
    if (slug !== folderSlug) return null;
  } else if (id !== folderSlug) {
    // No explicit slug: require id to match the folder name so identity is stable.
    return null;
  }

  let label: string | undefined;
  if (typeof o.label === 'string' && o.label.trim() !== '') {
    label = o.label.trim();
  }

  let legacyIndex: number | undefined;
  if (o.legacyIndex !== undefined && o.legacyIndex !== null) {
    const n = Number(o.legacyIndex);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
    legacyIndex = n;
  }

  return { id, label, legacyIndex };
}

/**
 * List valid preset folders under a deck root.
 * Skips: non-directories, names ending in `.tmp`, invalid slugs, missing/invalid preset.json.
 */
export function scanDeckCatalog(deckRoot: string, source: CatalogSource): CatalogEntry[] {
  const root = resolve(deckRoot);
  if (!existsSync(root)) return [];

  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(root);
  } catch {
    return [];
  }
  if (!st.isDirectory()) return [];

  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }

  const entries: CatalogEntry[] = [];
  for (const name of names) {
    if (name.endsWith('.tmp')) continue;
    if (name.startsWith('.')) continue;
    if (!isValidSlug(name)) continue;

    const folderPath = join(root, name);
    let folderStat: ReturnType<typeof statSync>;
    try {
      folderStat = statSync(folderPath);
    } catch {
      continue;
    }
    if (!folderStat.isDirectory()) continue;

    const presetPath = join(folderPath, 'preset.json');
    if (!existsSync(presetPath)) continue;

    let text: string;
    try {
      text = readFileSync(presetPath, 'utf8');
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      continue;
    }

    const meta = parsePresetMeta(parsed, name);
    if (!meta) continue;

    entries.push({
      slug: name,
      id: meta.id,
      path: folderPath,
      source,
      ...(meta.legacyIndex !== undefined ? { legacyIndex: meta.legacyIndex } : {}),
      ...(meta.label !== undefined ? { label: meta.label } : {}),
    });
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  return entries;
}

/**
 * Overlay merge by slug: override fully replaces bundled for that slug only.
 * Bundled-only slugs remain; override-only slugs appear; empty override ⇒ bundled intact.
 */
export function mergeCatalog(bundled: CatalogEntry[], override: CatalogEntry[]): CatalogEntry[] {
  const bySlug = new Map<string, CatalogEntry>();
  for (const e of bundled) {
    bySlug.set(e.slug, e);
  }
  for (const e of override) {
    bySlug.set(e.slug, e);
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Stable content fingerprint for epoch decisions. */
export function catalogContentHash(decks: CatalogSnapshot['decks']): string {
  const lines: string[] = [];
  for (const deck of DECK_IDS) {
    for (const e of decks[deck]) {
      lines.push(
        [
          deck,
          e.slug,
          e.id,
          e.source,
          e.path,
          e.label ?? '',
          e.legacyIndex === undefined ? '' : String(e.legacyIndex),
        ].join('\t'),
      );
    }
  }
  return createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
}

/**
 * Build a snapshot from resolved dirs. When `previous` is provided and the
 * content hash is unchanged, epoch is preserved; otherwise epoch = previous+1
 * (or 1 when no previous).
 */
export function buildCatalogSnapshot(
  dirs: ResolvedDataDirs,
  previous: CatalogSnapshot | null = null,
  now: () => Date = () => new Date(),
): CatalogSnapshot {
  const decks = {
    'deck-a': mergeCatalog(
      scanDeckCatalog(dirs.decksBundled['deck-a'], 'bundled'),
      dirs.decksOverride['deck-a'] ? scanDeckCatalog(dirs.decksOverride['deck-a'], 'override') : [],
    ),
    'deck-b': mergeCatalog(
      scanDeckCatalog(dirs.decksBundled['deck-b'], 'bundled'),
      dirs.decksOverride['deck-b'] ? scanDeckCatalog(dirs.decksOverride['deck-b'], 'override') : [],
    ),
  };

  const contentHash = catalogContentHash(decks);
  let epoch: number;
  if (previous && previous.contentHash === contentHash) {
    epoch = previous.epoch;
  } else if (previous) {
    epoch = previous.epoch + 1;
  } else {
    epoch = 1;
  }

  return {
    epoch,
    scannedAt: now().toISOString(),
    contentHash,
    decks,
  };
}

/**
 * Resolve a relative asset path under a preset/deck root, rejecting `..` escapes
 * and absolute paths. Returns the absolute sandboxed path, or null if unsafe.
 */
export function resolveSandboxedAssetPath(root: string, relativePath: string): string | null {
  if (typeof relativePath !== 'string' || relativePath === '') return null;
  if (relativePath.includes('\0')) return null;

  // Normalize separators; reject absolute and drive-like paths early.
  const cleaned = relativePath.replace(/\\/g, '/');
  if (cleaned.startsWith('/') || /^[a-zA-Z]:/.test(cleaned)) return null;
  if (isAbsolute(relativePath)) return null;

  const rootAbs = resolve(root);
  // Use normalize on the relative piece only to collapse . and .., then join.
  const normalizedRel = normalize(cleaned);
  // After normalize, reject any remaining escape
  if (
    normalizedRel === '..' ||
    normalizedRel.startsWith(`..${sep}`) ||
    normalizedRel.startsWith('../')
  ) {
    return null;
  }

  const joined = resolve(rootAbs, normalizedRel);
  const rel = relative(rootAbs, joined);
  if (rel === '' && normalizedRel !== '.' && normalizedRel !== '') {
    // resolve quirks — treat empty relative as root only when asking for "."
  }
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  // Windows: relative can use backslash
  if (rel.split(/[/\\]/).includes('..')) return null;

  return joined;
}

/** Human-readable summary for bridge boot logs. */
export function formatCatalogSummary(snapshot: CatalogSnapshot): string {
  const a = snapshot.decks['deck-a'];
  const b = snapshot.decks['deck-b'];
  const count = (entries: CatalogEntry[]) => {
    const bundled = entries.filter((e) => e.source === 'bundled').length;
    const override = entries.filter((e) => e.source === 'override').length;
    return `${entries.length} (bundled=${bundled}, override=${override})`;
  };
  return (
    `[catalog] epoch=${snapshot.epoch} hash=${snapshot.contentHash}` +
    ` deck-a=${count(a)} deck-b=${count(b)}`
  );
}

/**
 * Load the full catalog from repo `data/` + optional AURORA_DATA_DIR / override.
 * Pure entrypoint for bridge boot (no HTTP).
 */
export function loadModeCatalog(opts: {
  /** Repo root (parent of `data/`). */
  appRoot: string;
  overrideRoot?: string | null;
  env?: Record<string, string | undefined>;
  previous?: CatalogSnapshot | null;
  /**
   * Base for resolving relative AURORA_DATA_DIR / overrideRoot.
   * Defaults to process.cwd() so `AURORA_DATA_DIR=./my-modes` matches the shell.
   */
  cwd?: string;
}): CatalogSnapshot {
  const dirs = resolveDataDirs({
    // Absolute when appRoot is absolute (bridge boot path).
    bundledRoot: join(opts.appRoot, 'data'),
    overrideRoot: opts.overrideRoot,
    env: opts.env,
    cwd: opts.cwd ?? process.cwd(),
  });
  return buildCatalogSnapshot(dirs, opts.previous ?? null);
}
