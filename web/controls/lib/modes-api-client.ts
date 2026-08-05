/**
 * HTTP client for the bridge mode catalog / compile API (#237 / #241).
 * Browser-safe: no Node imports. Origin is derived from controls→projector mapping.
 */

import { type MenuCatalogSnapshot, parsePublicCatalog } from './mode-catalog-menu.ts';
import { CONTROLS_PORT, PROJECTOR_PORT } from './projector-url.ts';

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

export function modesCatalogUrl(
  loc: Pick<Location, 'protocol' | 'hostname' | 'port'> = location,
): string {
  return `${bridgeHttpOrigin(loc)}/api/modes/catalog`;
}

export function modesCompiledUrl(
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

export type FetchCatalogResult =
  | { ok: true; catalog: MenuCatalogSnapshot }
  | { ok: false; error: string; status?: number };

export async function fetchModesCatalog(
  loc: Pick<Location, 'protocol' | 'hostname' | 'port'> = location,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchCatalogResult> {
  try {
    const res = await fetchImpl(modesCatalogUrl(loc), {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, error: `catalog HTTP ${res.status}`, status: res.status };
    }
    const raw: unknown = await res.json();
    const catalog = parsePublicCatalog(raw);
    if (!catalog) {
      return { ok: false, error: 'catalog response was not a valid snapshot' };
    }
    return { ok: true, catalog };
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
  loc: Pick<Location, 'protocol' | 'hostname' | 'port'> = location,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchCompiledResult> {
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
