/**
 * Install a `.aurora-package` archive into the override data dir (AURORA_DATA_DIR).
 *
 * Writes dual-deck packs:
 *   $DATA/decks/deck-{a,b}/<slug>/preset.json
 *   $DATA/decks/deck-{a,b}/<slug>/<slug_with_underscores>.wgsl
 *
 * Staging uses `<slug>.tmp` folders (skipped by the catalog scanner), then
 * atomically renames into place. Re-import of the same slug overwrites.
 *
 * Never writes into the bundled `data/` tree — only the override root.
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  AURORA_PACKAGE_MAX_ARCHIVE_BYTES,
  type AuroraPackageValidationError,
  auroraPackageToModePreset,
  auroraPackageWgslFileName,
  isThreePackageBundle,
  isWgslPackageBundle,
  parseAuroraPackageArchive,
} from '../shared/aurora-package.ts';
import { validateModePreset } from '../shared/mode-preset-schema.ts';
import { DECK_IDS, type DeckId, isValidSlug } from './mode-catalog.ts';

export type PackageImportOptions = {
  /** Absolute or relative override data root (AURORA_DATA_DIR). */
  dataDir: string;
  /** Remap authoring WGSL → show form (default true). */
  remapAuthoring?: boolean;
  /** Base for resolving relative dataDir (default process.cwd()). */
  cwd?: string;
};

export type PackageImportSuccess = {
  ok: true;
  slug: string;
  label: string;
  uiGroup?: string;
  decks: readonly DeckId[];
  /** Absolute paths to installed pack folders per deck. */
  paths: Record<DeckId, string>;
  /** True when at least one deck folder already existed before install. */
  overwritten: boolean;
  target: 'pack-fullscreen' | 'threejs';
  entryFile: string;
  renderer?: 'webgl2' | 'webgpu';
  wgslFile?: string;
  wgslForm?: 'show' | 'authoring';
  trustedCode: boolean;
};

export type PackageImportFailure = {
  ok: false;
  errors: AuroraPackageValidationError[];
};

export type PackageImportResult = PackageImportSuccess | PackageImportFailure;

export type PackageArchiveBodyResult =
  | { ok: true; bytes: Uint8Array; remapAuthoring: boolean }
  | { ok: false; errors: AuroraPackageValidationError[]; status: number };

/**
 * Resolve the override root from an explicit path or env.
 * Returns null when unset / whitespace-only (import is disabled).
 */
export function resolvePackageImportDataDir(opts?: {
  overrideRoot?: string | null;
  env?: Record<string, string | undefined>;
  cwd?: string;
}): string | null {
  const cwd = opts?.cwd ?? process.cwd();
  let raw: string | null | undefined = opts?.overrideRoot;
  if (raw === undefined) {
    const env = opts?.env ?? process.env;
    raw = env.AURORA_DATA_DIR;
  }
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return resolve(cwd, raw.trim());
}

function fail(errors: AuroraPackageValidationError[]): PackageImportFailure {
  return { ok: false, errors };
}

function writeTextAtomic(filePath: string, text: string): void {
  writeFileSync(filePath, text, { encoding: 'utf8' });
}

/**
 * Replace `finalDir` with contents of `stagingDir` (same parent).
 * Uses rename; on failure leaves staging in place and restores previous final if possible.
 */
function swapStagingIntoPlace(stagingDir: string, finalDir: string): void {
  const parent = dirname(stagingDir);
  const backupDir = join(parent, `${basename(finalDir)}.old.tmp`);

  if (existsSync(backupDir)) {
    rmSync(backupDir, { recursive: true, force: true });
  }

  if (existsSync(finalDir)) {
    renameSync(finalDir, backupDir);
    try {
      renameSync(stagingDir, finalDir);
      rmSync(backupDir, { recursive: true, force: true });
    } catch (err) {
      // Best-effort rollback.
      try {
        if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
        renameSync(backupDir, finalDir);
      } catch {
        /* ignore nested rollback errors */
      }
      throw err;
    }
  } else {
    renameSync(stagingDir, finalDir);
  }
}

/**
 * Install one package archive under the override data dir for both decks.
 * Pure of HTTP — call `rescanModeCatalog()` after a successful install.
 */
export function installAuroraPackageArchive(
  bytes: Uint8Array,
  opts: PackageImportOptions,
): PackageImportResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return fail([{ path: 'archive', message: 'empty body' }]);
  }
  if (bytes.byteLength > AURORA_PACKAGE_MAX_ARCHIVE_BYTES) {
    return fail([
      {
        path: 'archive',
        message: `exceeds ${AURORA_PACKAGE_MAX_ARCHIVE_BYTES} bytes`,
      },
    ]);
  }

  const parsed = parseAuroraPackageArchive(bytes, {
    remapAuthoring: opts.remapAuthoring !== false,
  });
  if (!parsed.ok) return fail(parsed.errors);

  const { bundle } = parsed;
  const slug = bundle.manifest.slug;
  if (!isValidSlug(slug)) {
    return fail([{ path: 'manifest.slug', message: 'must be kebab-case slug' }]);
  }

  const preset = auroraPackageToModePreset(bundle);
  const validated = validateModePreset(preset);
  if (!validated.ok) {
    return fail(validated.errors.map((message) => ({ path: 'preset.json', message })));
  }

  const dataRoot = resolve(opts.cwd ?? process.cwd(), opts.dataDir);
  const entryFile = isThreePackageBundle(bundle)
    ? bundle.manifest.entry
    : auroraPackageWgslFileName(slug);
  const presetJson = `${JSON.stringify(validated.value, null, 2)}\n`;

  const paths = {} as Record<DeckId, string>;
  let overwritten = false;

  for (const deck of DECK_IDS) {
    const deckRoot = join(dataRoot, 'decks', deck);
    mkdirSync(deckRoot, { recursive: true });

    const finalDir = join(deckRoot, slug);
    const stagingDir = join(deckRoot, `${slug}.tmp`);

    if (existsSync(finalDir)) overwritten = true;

    // Clean leftover staging from a prior crash.
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
    mkdirSync(stagingDir, { recursive: true });

    try {
      writeTextAtomic(join(stagingDir, 'preset.json'), presetJson);
      if (isWgslPackageBundle(bundle)) {
        const wgslText = bundle.wgsl.endsWith('\n') ? bundle.wgsl : `${bundle.wgsl}\n`;
        writeTextAtomic(join(stagingDir, entryFile), wgslText);
      } else {
        writeTextAtomic(join(stagingDir, bundle.manifest.source), bundle.source);
        writeTextAtomic(join(stagingDir, bundle.manifest.entry), bundle.javascript);
        if (bundle.sourceMap)
          writeTextAtomic(join(stagingDir, 'visualization.js.map'), bundle.sourceMap);
        for (const asset of bundle.manifest.assets) {
          const destination = join(stagingDir, ...asset.path.split('/'));
          mkdirSync(dirname(destination), { recursive: true });
          const data = bundle.assets[asset.path];
          if (!data) throw new Error(`validated asset missing: ${asset.path}`);
          writeFileSync(destination, data);
        }
      }
      swapStagingIntoPlace(stagingDir, finalDir);
    } catch (err) {
      // Leave no half-written staging if rename failed mid-flight.
      try {
        if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return fail([
        {
          path: `decks/${deck}/${slug}`,
          message: err instanceof Error ? err.message : String(err),
        },
      ]);
    }

    paths[deck] = finalDir;
  }

  return {
    ok: true,
    slug,
    label: bundle.manifest.label,
    uiGroup: bundle.manifest.uiGroup,
    decks: DECK_IDS,
    paths,
    overwritten,
    target: bundle.manifest.target,
    entryFile,
    renderer: isThreePackageBundle(bundle) ? bundle.manifest.renderer : undefined,
    wgslFile: isWgslPackageBundle(bundle) ? entryFile : undefined,
    wgslForm: isWgslPackageBundle(bundle) ? bundle.manifest.wgslForm : undefined,
    trustedCode: isThreePackageBundle(bundle),
  };
}

/**
 * Read archive bytes from an HTTP request.
 *
 * Accepts:
 * - Raw binary body (`application/zip`, `application/octet-stream`,
 *   `application/x-aurora-package`, or empty content-type)
 * - JSON `{ "archiveBase64": "..." }` or `{ "archive": "<base64>" }`
 *
 * Query/body flag `remapAuthoring` (default true): set false / 0 / "false" to skip remap.
 */
export async function readPackageArchiveFromRequest(
  request: Request,
  url?: URL,
): Promise<PackageArchiveBodyResult> {
  const search = url ?? new URL(request.url);
  const qRemap = search.searchParams.get('remapAuthoring');
  let remapAuthoring = true;
  if (qRemap === '0' || qRemap === 'false') remapAuthoring = false;

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.includes('application/json')) {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return {
        ok: false,
        status: 400,
        errors: [{ path: 'body', message: 'Body must be JSON { archiveBase64: string }' }],
      };
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        ok: false,
        status: 400,
        errors: [{ path: 'body', message: 'Body must be a JSON object' }],
      };
    }
    const o = payload as Record<string, unknown>;
    if (o.remapAuthoring === false || o.remapAuthoring === 0 || o.remapAuthoring === 'false') {
      remapAuthoring = false;
    }
    const b64 =
      typeof o.archiveBase64 === 'string'
        ? o.archiveBase64
        : typeof o.archive === 'string'
          ? o.archive
          : '';
    if (!b64.trim()) {
      return {
        ok: false,
        status: 400,
        errors: [{ path: 'archiveBase64', message: 'required non-empty base64 string' }],
      };
    }
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(Buffer.from(b64.trim(), 'base64'));
    } catch {
      return {
        ok: false,
        status: 400,
        errors: [{ path: 'archiveBase64', message: 'invalid base64' }],
      };
    }
    if (bytes.byteLength === 0) {
      return {
        ok: false,
        status: 400,
        errors: [{ path: 'archiveBase64', message: 'decoded archive is empty' }],
      };
    }
    if (bytes.byteLength > AURORA_PACKAGE_MAX_ARCHIVE_BYTES) {
      return {
        ok: false,
        status: 413,
        errors: [
          {
            path: 'archive',
            message: `exceeds ${AURORA_PACKAGE_MAX_ARCHIVE_BYTES} bytes`,
          },
        ],
      };
    }
    return { ok: true, bytes, remapAuthoring };
  }

  // Raw body path.
  let buf: ArrayBuffer;
  try {
    buf = await request.arrayBuffer();
  } catch {
    return {
      ok: false,
      status: 400,
      errors: [{ path: 'body', message: 'failed to read request body' }],
    };
  }
  const bytes = new Uint8Array(buf);
  if (bytes.byteLength === 0) {
    return {
      ok: false,
      status: 400,
      errors: [
        {
          path: 'body',
          message:
            'empty body; send zip bytes or JSON { archiveBase64 } (Content-Type: application/zip)',
        },
      ],
    };
  }
  if (bytes.byteLength > AURORA_PACKAGE_MAX_ARCHIVE_BYTES) {
    return {
      ok: false,
      status: 413,
      errors: [
        {
          path: 'archive',
          message: `exceeds ${AURORA_PACKAGE_MAX_ARCHIVE_BYTES} bytes`,
        },
      ],
    };
  }
  return { ok: true, bytes, remapAuthoring };
}
