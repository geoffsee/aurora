/** Browser-safe helpers for directory joins and isolated audience bootstrap. */

import {
  type HostShowSession,
  LIVE_SHOW_PATHS,
  type ShowAccess,
  type ShowRuntime,
  type ViewerGrant,
} from './live-show.ts';
import { normalizeRelayBaseUrl, parseRelayError } from './relay-protocol.ts';

export const LIVE_SHOW_VIEWER_SESSION_KEY = 'aurora.live.viewer';
export const LIVE_SHOW_HOST_SESSION_KEY = 'aurora.live.host';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ViewerSession = {
  showId: string;
  viewerToken: string;
  liveApiUrl: string;
  expiresAt: number;
};

function storageOrNull(kind: 'local' | 'session'): StorageLike | null {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

function readRecord<T>(storage: StorageLike | null, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeRecord(storage: StorageLike | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing can disable storage; the current navigation still fails closed.
  }
}

export function loadViewerSession(
  storage: StorageLike | null = storageOrNull('session'),
): ViewerSession | null {
  const value = readRecord<ViewerSession>(storage, LIVE_SHOW_VIEWER_SESSION_KEY);
  if (!value?.showId || !value.viewerToken || !value.liveApiUrl || value.expiresAt <= Date.now()) {
    return null;
  }
  return value;
}

/** Move fragment credentials to sessionStorage and clear them from the address bar. */
export function consumeViewerFragment(
  loc: Pick<Location, 'hash' | 'pathname' | 'search'> = location,
  storage: StorageLike | null = storageOrNull('session'),
  replace: (url: string) => void = (url) => history.replaceState(null, '', url),
): ViewerSession | null {
  const params = new URLSearchParams((loc.hash ?? '').replace(/^#/, ''));
  const showId = params.get('show')?.trim() ?? '';
  const viewerToken = params.get('grant')?.trim() ?? '';
  const api = params.get('api')?.trim() ?? '';
  const expiresAt = Number(params.get('expires'));
  if (showId && viewerToken && api && Number.isFinite(expiresAt)) {
    const liveApiUrl = normalizeRelayBaseUrl(api);
    if (liveApiUrl) {
      const session = { showId, viewerToken, liveApiUrl, expiresAt } satisfies ViewerSession;
      writeRecord(storage, LIVE_SHOW_VIEWER_SESSION_KEY, session);
      for (const key of ['show', 'grant', 'api', 'expires']) params.delete(key);
      replace(`${loc.pathname}${loc.search}${params.size > 0 ? `#${params}` : ''}`);
      return session;
    }
  }
  return loadViewerSession(storage);
}

export function isAudienceViewer(storage: StorageLike | null = storageOrNull('session')): boolean {
  const value = readRecord<Partial<ViewerSession>>(storage, LIVE_SHOW_VIEWER_SESSION_KEY);
  // Keep an expired audience tab on the receive-only path so a reload cannot
  // fall through to local `/ws` or mount a relay host.
  return Boolean(value?.showId && value.viewerToken && value.liveApiUrl);
}

export function isAudienceViewerSurface(
  loc: { pathname?: string; href?: string } = location,
): boolean {
  let pathname = loc.pathname ?? '';
  if (!pathname && loc.href) {
    try {
      pathname = new URL(loc.href).pathname;
    } catch {
      /* ignore */
    }
  }
  return /(?:^|\/)viewer(?:\/|$)/.test(pathname);
}

export function saveHostShowSession(
  session: HostShowSession,
  storage: StorageLike | null = storageOrNull('local'),
): void {
  writeRecord(storage, LIVE_SHOW_HOST_SESSION_KEY, session);
}

export function loadHostShowSession(
  storage: StorageLike | null = storageOrNull('local'),
): HostShowSession | null {
  const value = readRecord<HostShowSession>(storage, LIVE_SHOW_HOST_SESSION_KEY);
  return value?.show?.id && value.hostToken ? value : null;
}

export function clearHostShowSession(storage: StorageLike | null = storageOrNull('local')): void {
  try {
    storage?.removeItem(LIVE_SHOW_HOST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveLiveApiBase(
  doc: Pick<Document, 'querySelector'> = document,
  fallback = 'https://aurora-relay.seemueller.workers.dev',
): string {
  const configured = doc
    .querySelector<HTMLMetaElement>('meta[name="aurora-live-api"]')
    ?.content.trim();
  if (configured && !configured.startsWith('__')) {
    const normalized = normalizeRelayBaseUrl(configured);
    if (normalized) return normalized;
  }
  return fallback;
}

async function jsonRequest<T>(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; value: T } | { ok: false; error: string; status: number }> {
  try {
    const response = await fetchImpl(url, init);
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: parseRelayError(payload, response.status),
        status: response.status,
      };
    }
    return { ok: true, value: payload as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      status: 0,
    };
  }
}

export async function joinLiveShow(
  liveApiUrl: string,
  showId: string,
  code?: string,
  fetchImpl: typeof fetch = fetch,
) {
  const base = normalizeRelayBaseUrl(liveApiUrl);
  if (!base) return { ok: false as const, error: 'invalid live API URL', status: 0 };
  return jsonRequest<ViewerGrant>(
    `${base}${LIVE_SHOW_PATHS.shows}/${encodeURIComponent(showId)}/join`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code || undefined }),
    },
    fetchImpl,
  );
}

export async function createPagesLiveShow(
  liveApiUrl: string,
  input: {
    name: string;
    access: ShowAccess;
    durationMs: number;
    relaySessionId: string;
    relayHostToken: string;
  },
  fetchImpl: typeof fetch = fetch,
) {
  const base = normalizeRelayBaseUrl(liveApiUrl);
  if (!base) return { ok: false as const, error: 'invalid live API URL', status: 0 };
  const result = await jsonRequest<HostShowSession>(
    `${base}${LIVE_SHOW_PATHS.shows}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, runtime: 'pages' satisfies ShowRuntime }),
    },
    fetchImpl,
  );
  if (result.ok) saveHostShowSession(result.value);
  return result;
}

export function liveShowManageHeaders(hostToken: string): HeadersInit {
  return { authorization: `Bearer ${hostToken}`, 'content-type': 'application/json' };
}
