/**
 * HTTP client for the bridge mode catalog / compile API (#237 / #241).
 * Browser-safe: no Node imports. Origin is derived from controls→projector mapping.
 *
 * Static GitHub Pages ships precompiled catalog files under
 * `{siteBase}/api/modes/catalog.json` and
 * `{siteBase}/api/modes/compiled/{deck}/{slug}.json` (see
 * scripts/stage-static-mode-catalog.ts). Live bridge uses query-string routes.
 */

import {
  compiledWireFromAuthoredPackage,
  getAuthoredPackage,
} from '../../../shared/package-channel.ts';
import { isStaticHosting, staticModesApiBase } from '../../../shared/static-hosting.ts';
import { type MenuCatalogSnapshot, parsePublicCatalog } from './mode-catalog-menu.ts';
import { CONTROLS_PORT, PROJECTOR_PORT } from './projector-url.ts';

type ModesLoc = Pick<Location, 'protocol' | 'hostname' | 'port' | 'pathname' | 'search'>;

/** HTTP origin of the projector/bridge that serves `/api/modes/*`. */
export function bridgeHttpOrigin(
  loc: Pick<Location, 'protocol' | 'hostname' | 'port'> = location,
): string {
  const host = loc.hostname || 'localhost';
  const protocol = loc.protocol || 'http:';
  if (loc.port === String(CONTROLS_PORT)) {
    return `${protocol}//${host}:${PROJECTOR_PORT}`;
  }
  // Native bridge: controls on :3001, visual server on :3000.
  if (loc.port === '3001') {
    return `${protocol}//${host}:3000`;
  }
  const port = loc.port ? `:${loc.port}` : '';
  return `${protocol}//${host}${port}`;
}

/** Live bridge catalog endpoint (no `.json` suffix). */
export function modesCatalogLiveUrl(
  loc: Pick<Location, 'protocol' | 'hostname' | 'port'> = location,
): string {
  return `${bridgeHttpOrigin(loc)}/api/modes/catalog`;
}

/** Static Pages catalog file (project-base-aware). */
export function modesCatalogStaticUrl(loc: ModesLoc = location): string {
  return `${staticModesApiBase(loc)}/api/modes/catalog.json`;
}

/**
 * Preferred catalog URL for this environment.
 * Static hosting → path-based JSON; bridge → live API.
 */
export function modesCatalogUrl(loc: ModesLoc = location): string {
  if (isStaticHosting(loc)) return modesCatalogStaticUrl(loc);
  return modesCatalogLiveUrl(loc);
}

/** Live bridge compiled endpoint (query string). */
export function modesCompiledLiveUrl(
  opts: {
    deck: 'deck-a' | 'deck-b';
    slug: string;
    epoch?: number;
  },
  loc: Pick<Location, 'protocol' | 'hostname' | 'port'> = location,
): string {
  const params = new URLSearchParams({
    deck: opts.deck,
    slug: opts.slug,
  });
  if (opts.epoch !== undefined && Number.isInteger(opts.epoch) && opts.epoch > 0) {
    params.set('epoch', String(opts.epoch));
  }
  return `${bridgeHttpOrigin(loc)}/api/modes/compiled?${params.toString()}`;
}

/** Static Pages compiled wire file. */
export function modesCompiledStaticUrl(
  opts: { deck: 'deck-a' | 'deck-b'; slug: string },
  loc: ModesLoc = location,
): string {
  const slug = encodeURIComponent(opts.slug.trim());
  return `${staticModesApiBase(loc)}/api/modes/compiled/${opts.deck}/${slug}.json`;
}

/**
 * Preferred compiled URL for this environment.
 * Static hosting → path-based JSON; bridge → live query API.
 */
export function modesCompiledUrl(
  opts: {
    deck: 'deck-a' | 'deck-b';
    slug: string;
    epoch?: number;
  },
  loc: ModesLoc = location,
): string {
  if (isStaticHosting(loc)) return modesCompiledStaticUrl(opts, loc);
  return modesCompiledLiveUrl(opts, loc);
}

export type FetchCatalogResult =
  | { ok: true; catalog: MenuCatalogSnapshot }
  | { ok: false; error: string; status?: number };

async function parseCatalogResponse(res: Response): Promise<FetchCatalogResult> {
  if (!res.ok) {
    return { ok: false, error: `catalog HTTP ${res.status}`, status: res.status };
  }
  const raw: unknown = await res.json();
  const catalog = parsePublicCatalog(raw);
  if (!catalog) {
    return { ok: false, error: 'catalog response was not a valid snapshot' };
  }
  return { ok: true, catalog };
}

export async function fetchModesCatalog(
  loc: ModesLoc = location,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchCatalogResult> {
  const primary = modesCatalogUrl(loc);
  try {
    const res = await fetchImpl(primary, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const primaryResult = await parseCatalogResponse(res);
    if (primaryResult.ok) return primaryResult;

    // Bridge path may miss static files during local hybrid; try the other layout once.
    if (!isStaticHosting(loc) && res.status === 404) {
      const staticUrl = modesCatalogStaticUrl(loc);
      if (staticUrl !== primary) {
        const fallback = await fetchImpl(staticUrl, {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        const fallbackResult = await parseCatalogResponse(fallback);
        if (fallbackResult.ok) return fallbackResult;
      }
    }
    return primaryResult;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type FetchCompiledResult =
  | { ok: true; wire: unknown }
  | { ok: false; error: string; status?: number; errors?: string[] };

export async function fetchCompiledMode(
  opts: {
    deck: 'deck-a' | 'deck-b';
    slug: string;
    epoch?: number;
  },
  loc: ModesLoc = location,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchCompiledResult> {
  // Studio-authored packages (localStorage + BroadcastChannel) win over HTTP —
  // required on GitHub Pages where there is no import API.
  const authored = getAuthoredPackage(opts.slug);
  if (authored) {
    return {
      ok: true,
      wire: compiledWireFromAuthoredPackage(opts.deck, authored, opts.epoch ?? 0),
    };
  }
  try {
    const res = await fetchImpl(modesCompiledUrl(opts, loc), {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      return { ok: true, wire: body };
    }
    const errObj =
      body && typeof body === 'object' ? (body as { error?: string; errors?: string[] }) : {};
    return {
      ok: false,
      error: errObj.error ?? `compiled HTTP ${res.status}`,
      status: res.status,
      errors: Array.isArray(errObj.errors) ? errObj.errors : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
