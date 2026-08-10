/**
 * Remote instance targeting — point a console at an aurora bridge other than
 * the one that served the page.
 *
 * Every URL helper in the codebase already takes a `Pick<Location, …>` rather
 * than reading the global (`bridgeWebSocketUrl`, `projectorPreviewUrl`,
 * `bridgeHttpOrigin`, `staticModesApiBase`). So targeting a remote instance is
 * just handing those helpers a synthetic location instead of `window.location`
 * — no helper changes, and the local case stays byte-identical because it
 * passes the real `location` straight through.
 *
 * Precedence: `?instance=` / `?token=` in the page URL win and are persisted,
 * so a printed or QR-encoded link onboards a phone in one tap. Otherwise the
 * stored target applies. Nothing stored → the page's own origin.
 *
 * Note this is cross-origin by construction: a console served by instance A
 * talking to instance B needs CORS on B's `/api/*` (bridge/index.ts) and TLS
 * that the phone trusts. Same-origin (console served *by* the instance you are
 * driving) needs neither and is the recommended default.
 */

import { ACCESS_TOKEN_QUERY_PARAM } from './access-token.ts';

export const INSTANCE_TARGET_KEY = 'aurora.instance-target';

export type InstanceTarget = {
  /** Absolute origin of the instance, or null to use the page's own origin. */
  origin: string | null;
  /** Bridge access token, or null when the instance requires none. */
  token: string | null;
};

export const LOCAL_INSTANCE: InstanceTarget = { origin: null, token: null };

/** The location-ish shape the URL helpers accept. */
export type InstanceLocation = Pick<
  Location,
  'protocol' | 'hostname' | 'port' | 'host' | 'origin' | 'href' | 'pathname' | 'search'
>;

export type InstanceOriginResult =
  | { ok: true; origin: string | null }
  | { ok: false; error: string };

/**
 * Validate operator-typed instance text into an origin.
 * Bare hosts get `https://` — the bridge is TLS-terminated by Caddy, and a
 * `ws://` bridge from an `https://` console is blocked as mixed content anyway.
 */
export function parseInstanceOrigin(raw: string): InstanceOriginResult {
  const clean = typeof raw === 'string' ? raw.trim() : '';
  if (clean === '') return { ok: true, origin: null };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(clean) ? clean : `https://${clean}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: `"${clean}" is not a valid address` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Instance must be an http:// or https:// address' };
  }
  if (!url.hostname) {
    return { ok: false, error: 'Instance address is missing a host' };
  }
  return { ok: true, origin: url.origin };
}

/** Normalize a token field; blank means "instance requires no token". */
export function parseInstanceToken(raw: string): string | null {
  const clean = typeof raw === 'string' ? raw.trim() : '';
  return clean === '' ? null : clean;
}

/**
 * The location to hand URL helpers.
 * Local target → the real location (identical behaviour to before this existed).
 */
export function instanceLocationFor(
  target: InstanceTarget,
  loc: InstanceLocation = location,
): InstanceLocation {
  if (!target.origin) return loc;
  const url = new URL(target.origin);
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    host: url.host,
    origin: url.origin,
    href: `${url.origin}/`,
    pathname: '/',
    search: '',
  };
}

/** True when the console is driving an instance other than its own origin. */
export function isRemoteInstance(target: InstanceTarget, loc: Pick<Location, 'origin'> = location) {
  return target.origin !== null && target.origin !== loc.origin;
}

/** Human-readable target for status UI. */
export function describeInstanceTarget(
  target: InstanceTarget,
  loc: Pick<Location, 'origin'> = location,
): string {
  return target.origin ?? loc.origin ?? 'this page';
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readStored(storage: StorageLike | null): InstanceTarget {
  if (!storage) return LOCAL_INSTANCE;
  try {
    const raw = storage.getItem(INSTANCE_TARGET_KEY);
    if (!raw) return LOCAL_INSTANCE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return LOCAL_INSTANCE;
    const record = parsed as { origin?: unknown; token?: unknown };
    const origin =
      typeof record.origin === 'string'
        ? parseInstanceOrigin(record.origin)
        : { ok: true as const, origin: null };
    return {
      origin: origin.ok ? origin.origin : null,
      token: typeof record.token === 'string' ? parseInstanceToken(record.token) : null,
    };
  } catch {
    return LOCAL_INSTANCE;
  }
}

/** Persist a target. A fully-local target clears the key rather than storing nulls. */
export function saveInstanceTarget(
  target: InstanceTarget,
  storage: StorageLike | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    if (!target.origin && !target.token) {
      storage.removeItem(INSTANCE_TARGET_KEY);
      return;
    }
    storage.setItem(INSTANCE_TARGET_KEY, JSON.stringify(target));
  } catch {
    /* quota / private mode — the in-memory target still drives this session */
  }
}

/**
 * Resolve the active target: URL params override and persist, else stored.
 * Pass `search` explicitly in tests; defaults to the live location.
 */
export function loadInstanceTarget(
  loc: Pick<Location, 'search'> = location,
  storage: StorageLike | null = safeStorage(),
): InstanceTarget {
  const stored = readStored(storage);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(loc.search ?? '');
  } catch {
    return stored;
  }

  const rawInstance = params.get('instance');
  const rawToken = params.get(ACCESS_TOKEN_QUERY_PARAM);
  if (rawInstance === null && rawToken === null) return stored;

  const parsedOrigin = rawInstance === null ? null : parseInstanceOrigin(rawInstance);
  const next: InstanceTarget = {
    origin:
      parsedOrigin === null ? stored.origin : parsedOrigin.ok ? parsedOrigin.origin : stored.origin,
    token: rawToken === null ? stored.token : parseInstanceToken(rawToken),
  };
  saveInstanceTarget(next, storage);
  return next;
}
