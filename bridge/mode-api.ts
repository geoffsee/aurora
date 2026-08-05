/**
 * Mode catalog HTTP API: public catalog, compile cache, epoch-scoped asset serve.
 *
 * Routes (wired in bridge/index.ts visual server):
 * - GET /api/modes/catalog
 * - GET /api/modes/compiled?deck=&slug=&epoch=
 * - GET /api/data/e/<epoch>/decks/deck-{a|b}/<slug>/<relpath...>
 *
 * Live-show safety: epoch bumps only refresh the catalog menu; they never tear
 * an active renderer selection. Compile is fail-closed. Asset paths are
 * sandboxed (logical + realpath) against the retained snapshot entry for that
 * epoch so a selection never mixes torn cross-epoch assets.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { CompiledModeWire } from '../shared/compiled-mode-wire.ts';
import {
  type CompileModePresetResult,
  validateAndCompileModePreset,
} from '../shared/mode-preset-schema.ts';
import {
  type CatalogEntry,
  type CatalogSnapshot,
  type CatalogSource,
  type DeckId,
  isValidSlug,
  resolveSandboxedAssetPath,
} from './mode-catalog.ts';

// ── Constants (size / MIME / retention) ──────────────────────────────────────

/** How many catalog epochs of assets + compile cache to retain. */
export const MODE_API_EPOCH_RETENTION = 4;

/** Max bytes for a single served asset under /api/data/e/... (8 MiB). */
export const MODE_API_MAX_ASSET_BYTES = 8 * 1024 * 1024;

/**
 * Extension → Content-Type for mode assets.
 * Unknown extensions fall back to application/octet-stream (still size-capped).
 */
export const MODE_API_ASSET_MIME: Readonly<Record<string, string>> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wgsl': 'text/plain; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.frag': 'text/plain; charset=utf-8',
  '.vert': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

export const MODES_CATALOG_WS_ADDRESS = '/aurora/modes/catalog';

// ── Public catalog (no absolute host paths) ──────────────────────────────────

export type PublicCatalogEntry = {
  slug: string;
  id: string;
  source: CatalogSource;
  legacyIndex?: number;
  label?: string;
  /** Operator UI grouping hint from preset.json. */
  uiGroup?: string;
};

export type PublicCatalogSnapshot = {
  epoch: number;
  scannedAt: string;
  contentHash: string;
  decks: {
    'deck-a': PublicCatalogEntry[];
    'deck-b': PublicCatalogEntry[];
  };
};

function publicEntry(e: CatalogEntry): PublicCatalogEntry {
  const out: PublicCatalogEntry = {
    slug: e.slug,
    id: e.id,
    source: e.source,
  };
  if (e.legacyIndex !== undefined) out.legacyIndex = e.legacyIndex;
  if (e.label !== undefined) out.label = e.label;
  if (e.uiGroup !== undefined) out.uiGroup = e.uiGroup;
  return out;
}

/** Strip absolute host paths from a catalog snapshot for HTTP/WS clients. */
export function toPublicCatalog(snapshot: CatalogSnapshot): PublicCatalogSnapshot {
  return {
    epoch: snapshot.epoch,
    scannedAt: snapshot.scannedAt,
    contentHash: snapshot.contentHash,
    decks: {
      'deck-a': snapshot.decks['deck-a'].map(publicEntry),
      'deck-b': snapshot.decks['deck-b'].map(publicEntry),
    },
  };
}

/** assetBase for a compiled selection under the epoch-scoped asset URL tree. */
export function modeAssetBase(epoch: number, deck: DeckId, slug: string): string {
  // Trailing slash so relative layer refs join cleanly.
  return `/api/data/e/${epoch}/decks/${deck}/${slug}/`;
}

export function compileCacheKey(epoch: number, deck: DeckId, slug: string): string {
  return `${epoch}:${deck}:${slug}`;
}

// ── Realpath sandbox (TOCTOU-hardening on top of logical sandbox) ────────────

/**
 * Resolve `relativePath` under `root` with both logical and realpath checks.
 * Rejects absolute paths, `..` escapes, and symlink escapes that leave root.
 * Returns the real absolute path, or null if unsafe / missing.
 */
export function resolveSandboxedRealPath(root: string, relativePath: string): string | null {
  const logical = resolveSandboxedAssetPath(root, relativePath);
  if (!logical) return null;

  let rootReal: string;
  try {
    rootReal = realpathSync(root);
  } catch {
    return null;
  }

  // Ensure root itself is a directory (defends against swapped files).
  try {
    if (!statSync(rootReal).isDirectory()) return null;
  } catch {
    return null;
  }

  let fileReal: string;
  try {
    // realpath fails if the path does not exist — treat as not found (null).
    fileReal = realpathSync(logical);
  } catch {
    return null;
  }

  const rel = relative(rootReal, fileReal);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  if (rel.split(/[/\\]/).includes('..')) return null;

  return fileReal;
}

export function assetMimeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MODE_API_ASSET_MIME[ext] ?? 'application/octet-stream';
}

// ── Compile from catalog entry (pure over snapshot entry + on-disk preset) ───

export type CompileFromEntryResult =
  | { ok: true; wire: CompiledModeWire }
  | { ok: false; errors: string[] };

/**
 * Read preset.json for a catalog entry and compile to CompiledModeWire.
 * Uses only the entry's path + the given epoch/deck (no live catalog lookup).
 * Fail-closed: IO / parse / validate / compile errors become `{ ok: false }`.
 */
export function compileFromEntry(
  entry: CatalogEntry,
  epoch: number,
  deck: DeckId,
): CompileFromEntryResult {
  const presetLogical = resolveSandboxedAssetPath(entry.path, 'preset.json');
  if (!presetLogical) {
    return { ok: false, errors: ['preset.json path escapes entry root'] };
  }

  const presetReal = resolveSandboxedRealPath(entry.path, 'preset.json');
  if (!presetReal) {
    return { ok: false, errors: ['preset.json missing or not readable under entry root'] };
  }

  let text: string;
  try {
    const st = statSync(presetReal);
    if (!st.isFile()) {
      return { ok: false, errors: ['preset.json is not a regular file'] };
    }
    if (st.size > MODE_API_MAX_ASSET_BYTES) {
      return {
        ok: false,
        errors: [`preset.json exceeds size cap (${MODE_API_MAX_ASSET_BYTES} bytes)`],
      };
    }
    text = readFileSync(presetReal, 'utf8');
  } catch (err) {
    return {
      ok: false,
      errors: [`failed to read preset.json: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (err) {
    return {
      ok: false,
      errors: [
        `preset.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const assetBase = modeAssetBase(epoch, deck, entry.slug);
  const compiled: CompileModePresetResult = validateAndCompileModePreset(raw, {
    epoch,
    deck,
    assetBase,
  });
  if (!compiled.ok) return compiled;
  return { ok: true, wire: compiled.value };
}

// ── ModeApi store (retention + cache + handlers) ─────────────────────────────

type CompileCacheValue = CompileFromEntryResult;

type RetainedEpoch = {
  snapshot: CatalogSnapshot;
  /** key = `${epoch}:${deck}:${slug}` */
  compileCache: Map<string, CompileCacheValue>;
};

export type GetCompiledResult =
  | { status: 200; wire: CompiledModeWire }
  | { status: 400; error: string }
  | { status: 404; error: string }
  | { status: 410; error: string }
  | { status: 422; error: string; errors: string[] };

export type GetAssetResult =
  | { status: 200; body: Uint8Array; contentType: string; bytes: number }
  | { status: 400; error: string }
  | { status: 404; error: string }
  | { status: 410; error: string }
  | { status: 413; error: string };

export type ModeApiOptions = {
  /** Max retained epochs (default MODE_API_EPOCH_RETENTION). */
  retention?: number;
  /** Max asset bytes (default MODE_API_MAX_ASSET_BYTES). */
  maxAssetBytes?: number;
};

/**
 * Holds the current + retained catalog snapshots, compile caches, and pure
 * request handlers. Bridge wires this to HTTP and calls `applySnapshot` on rescan.
 */
export class ModeApi {
  private retained = new Map<number, RetainedEpoch>();
  private currentEpoch = 0;
  private readonly retention: number;
  private readonly maxAssetBytes: number;

  constructor(initial: CatalogSnapshot, opts: ModeApiOptions = {}) {
    this.retention = opts.retention ?? MODE_API_EPOCH_RETENTION;
    this.maxAssetBytes = opts.maxAssetBytes ?? MODE_API_MAX_ASSET_BYTES;
    this.applySnapshot(initial);
  }

  /** Current catalog epoch. */
  get epoch(): number {
    return this.currentEpoch;
  }

  /** Full internal snapshot for the current epoch (includes absolute paths). */
  getCurrentSnapshot(): CatalogSnapshot {
    const r = this.retained.get(this.currentEpoch);
    if (!r) {
      throw new Error('ModeApi has no current snapshot');
    }
    return r.snapshot;
  }

  /** Epochs currently retained (ascending). */
  retainedEpochs(): number[] {
    return [...this.retained.keys()].sort((a, b) => a - b);
  }

  /**
   * Install a new catalog snapshot. When epoch advances, retain it and prune
   * older epochs beyond the retention window. Same-epoch no-op rescans refresh
   * the snapshot metadata but keep the compile cache (content is identical).
   *
   * @returns true when epoch advanced (caller should WS-broadcast catalog).
   */
  applySnapshot(snapshot: CatalogSnapshot): boolean {
    const prevEpoch = this.currentEpoch;
    const existing = this.retained.get(snapshot.epoch);
    if (existing) {
      existing.snapshot = snapshot;
    } else {
      this.retained.set(snapshot.epoch, {
        snapshot,
        compileCache: new Map(),
      });
    }
    this.currentEpoch = snapshot.epoch;
    this.pruneRetention();
    return prevEpoch !== 0 && snapshot.epoch > prevEpoch;
  }

  private pruneRetention(): void {
    const sorted = this.retainedEpochs();
    while (sorted.length > this.retention) {
      const drop = sorted.shift();
      if (drop === undefined) break;
      // Never drop the current epoch even if retention is misconfigured.
      if (drop === this.currentEpoch) continue;
      this.retained.delete(drop);
    }
  }

  getPublicCatalog(): PublicCatalogSnapshot {
    return toPublicCatalog(this.getCurrentSnapshot());
  }

  /**
   * Compile (or cache-hit) a mode for deck/slug at epoch.
   * Epoch omitted → current. Fail-closed on validate/compile errors (422).
   */
  getCompiled(opts: {
    deck: string | null;
    slug: string | null;
    epoch: string | number | null | undefined;
  }): GetCompiledResult {
    const deck = parseDeckId(opts.deck);
    if (!deck) {
      return { status: 400, error: 'query `deck` must be deck-a or deck-b' };
    }
    if (typeof opts.slug !== 'string' || !isValidSlug(opts.slug)) {
      return { status: 400, error: 'query `slug` must be a valid kebab-case slug' };
    }
    const slug = opts.slug;

    let epoch: number;
    if (opts.epoch === null || opts.epoch === undefined || opts.epoch === '') {
      epoch = this.currentEpoch;
    } else {
      const n = typeof opts.epoch === 'number' ? opts.epoch : Number(opts.epoch);
      if (!Number.isInteger(n) || n < 1) {
        return { status: 400, error: 'query `epoch` must be a positive integer when provided' };
      }
      epoch = n;
    }

    const retained = this.retained.get(epoch);
    if (!retained) {
      return {
        status: 410,
        error: `epoch ${epoch} is not retained (current=${this.currentEpoch}, retained=[${this.retainedEpochs().join(',')}])`,
      };
    }

    const entry = retained.snapshot.decks[deck].find((e) => e.slug === slug);
    if (!entry) {
      return { status: 404, error: `mode not found: ${deck}/${slug} @ epoch ${epoch}` };
    }

    const key = compileCacheKey(epoch, deck, slug);
    const cached = retained.compileCache.get(key);
    if (cached) {
      if (cached.ok) return { status: 200, wire: cached.wire };
      return { status: 422, error: 'compile failed', errors: cached.errors };
    }

    // Compile pure over the retained entry (never mixes another epoch's path).
    const result = compileFromEntry(entry, epoch, deck);
    retained.compileCache.set(key, result);
    if (result.ok) return { status: 200, wire: result.wire };
    return { status: 422, error: 'compile failed', errors: result.errors };
  }

  /**
   * Serve a sandboxed asset for a retained epoch.
   * `relPath` is the path under the preset folder (e.g. "preset.json", "assets/x.png").
   */
  getAsset(opts: { epoch: number; deck: string; slug: string; relPath: string }): GetAssetResult {
    if (!Number.isInteger(opts.epoch) || opts.epoch < 1) {
      return { status: 400, error: 'epoch must be a positive integer' };
    }
    const deck = parseDeckId(opts.deck);
    if (!deck) {
      return { status: 400, error: 'deck must be deck-a or deck-b' };
    }
    if (!isValidSlug(opts.slug)) {
      return { status: 400, error: 'slug must be a valid kebab-case slug' };
    }
    if (typeof opts.relPath !== 'string' || opts.relPath === '' || opts.relPath.endsWith('/')) {
      return { status: 400, error: 'asset path required' };
    }

    const retained = this.retained.get(opts.epoch);
    if (!retained) {
      return {
        status: 410,
        error: `epoch ${opts.epoch} is not retained (current=${this.currentEpoch})`,
      };
    }

    const entry = retained.snapshot.decks[deck].find((e) => e.slug === opts.slug);
    if (!entry) {
      return {
        status: 404,
        error: `mode not found: ${deck}/${opts.slug} @ epoch ${opts.epoch}`,
      };
    }

    // Logical sandbox first (cheap reject), then realpath (symlink escape).
    const logical = resolveSandboxedAssetPath(entry.path, opts.relPath);
    if (!logical) {
      return { status: 400, error: 'path escapes preset root or is invalid' };
    }

    const real = resolveSandboxedRealPath(entry.path, opts.relPath);
    if (!real) {
      // Distinguish missing vs escape: if logical was ok but realpath failed, 404.
      if (!existsSync(logical)) {
        return { status: 404, error: 'asset not found' };
      }
      return { status: 400, error: 'path rejected by realpath sandbox' };
    }

    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(real);
    } catch {
      return { status: 404, error: 'asset not found' };
    }
    if (!st.isFile()) {
      return { status: 404, error: 'asset not found' };
    }
    if (st.size > this.maxAssetBytes) {
      return {
        status: 413,
        error: `asset exceeds size cap (${this.maxAssetBytes} bytes)`,
      };
    }

    let body: Buffer;
    try {
      body = readFileSync(real);
    } catch {
      return { status: 404, error: 'asset not found' };
    }
    // Post-read size check (TOCTOU: file may have grown between stat and read).
    if (body.byteLength > this.maxAssetBytes) {
      return {
        status: 413,
        error: `asset exceeds size cap (${this.maxAssetBytes} bytes)`,
      };
    }

    return {
      status: 200,
      body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      contentType: assetMimeForPath(real),
      bytes: body.byteLength,
    };
  }

  // ── HTTP result helpers (for Bun.serve wiring / tests) ─────────────────────

  handleCatalogRequest(): Response {
    return Response.json(this.getPublicCatalog(), {
      headers: { 'cache-control': 'no-store' },
    });
  }

  handleCompiledRequest(url: URL): Response {
    const result = this.getCompiled({
      deck: url.searchParams.get('deck'),
      slug: url.searchParams.get('slug'),
      epoch: url.searchParams.get('epoch'),
    });
    if (result.status === 200) {
      return Response.json(result.wire, {
        headers: { 'cache-control': 'no-store' },
      });
    }
    if (result.status === 422) {
      return Response.json(
        { error: result.error, errors: result.errors },
        { status: 422, headers: { 'cache-control': 'no-store' } },
      );
    }
    return Response.json(
      { error: result.error },
      { status: result.status, headers: { 'cache-control': 'no-store' } },
    );
  }

  /**
   * Parse and handle `/api/data/e/<epoch>/decks/<deck>/<slug>/<rel...>` paths.
   * Returns null when the pathname is not an asset route (caller falls through).
   */
  handleAssetRequest(pathname: string): Response | null {
    const parsed = parseModeAssetPath(pathname);
    if (!parsed) return null;
    const result = this.getAsset(parsed);
    if (result.status === 200) {
      // Copy into a fresh ArrayBuffer-backed Uint8Array for BodyInit typing.
      const body = Uint8Array.from(result.body);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': result.contentType,
          'content-length': String(result.bytes),
          'cache-control': 'public, max-age=60',
        },
      });
    }
    return Response.json(
      { error: result.error },
      { status: result.status, headers: { 'cache-control': 'no-store' } },
    );
  }
}

// ── Path / query parsers ─────────────────────────────────────────────────────

export function parseDeckId(v: string | null | undefined): DeckId | null {
  if (v === 'deck-a' || v === 'deck-b') return v;
  return null;
}

/**
 * Parse `/api/data/e/<epoch>/decks/<deck>/<slug>/<relpath...>`.
 * Returns null if the path does not match the asset prefix shape.
 */
export function parseModeAssetPath(
  pathname: string,
): { epoch: number; deck: string; slug: string; relPath: string } | null {
  // Normalize: no query, leading slash expected.
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const prefix = '/api/data/e/';
  if (!p.startsWith(prefix)) return null;

  const rest = p.slice(prefix.length);
  // <epoch>/decks/<deck>/<slug>/<rel...>
  const parts = rest.split('/').filter((s) => s.length > 0);
  if (parts.length < 4) return null;
  if (parts[1] !== 'decks') return null;

  const epoch = Number(parts[0]);
  if (!Number.isInteger(epoch) || epoch < 1) return null;

  const deck = parts[2];
  const slug = parts[3];
  if (typeof deck !== 'string' || typeof slug !== 'string') return null;
  const relParts = parts.slice(4);
  if (relParts.length === 0) return null;

  // Re-join; reject empty segments already filtered.
  const relPath = relParts.join('/');
  return { epoch, deck, slug, relPath };
}

/**
 * WS fan-out payload for catalog updates (mirrors /aurora/control/state shape).
 */
export function modesCatalogWsMessage(publicCatalog: PublicCatalogSnapshot): {
  address: typeof MODES_CATALOG_WS_ADDRESS;
  args: [PublicCatalogSnapshot];
} {
  return {
    address: MODES_CATALOG_WS_ADDRESS,
    args: [publicCatalog],
  };
}

/** Join helper used by tests when writing fixture trees. */
export function presetJsonPath(entryPath: string): string {
  return join(resolve(entryPath), 'preset.json');
}
