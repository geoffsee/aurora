/**
 * Bridge access token — gates the *control plane* when `AURORA_ACCESS_TOKEN` is set.
 *
 * The bridge binds on 0.0.0.0 so phones and second machines can reach it
 * (see `host` in bridge/index.ts). Without a token, anyone who can route to
 * the port can open `/ws` and drive the show. Setting the env var closes that.
 *
 * What is gated, and why only this much:
 * - `/ws` — every show mutation flows through the WebSocket bus, so gating the
 *   upgrade gates control itself.
 * - `POST /api/packages/import` — the only route that writes to disk.
 *
 * Read-only mode catalog GETs (`/api/modes/*`) stay open: they return show
 * *definitions*, not control, and the projector page fetches them before it has
 * anywhere to read a token from. Revisit if catalogs ever carry secrets.
 *
 * Browsers cannot set headers on a WebSocket handshake, so the token travels as
 * a query param there. `fetch` callers may use either the param or the header.
 */

export const ACCESS_TOKEN_QUERY_PARAM = 'token';
export const ACCESS_TOKEN_HEADER = 'x-aurora-token';

/**
 * Constant-time string compare.
 *
 * Leaks length (standard for this construction) but not content, so a caller
 * cannot walk the token out one character at a time.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Normalize a configured token: blank/whitespace means "no token required". */
export function normalizeAccessToken(raw: string | undefined | null): string | null {
  const clean = typeof raw === 'string' ? raw.trim() : '';
  return clean === '' ? null : clean;
}

type TokenHeaders = Pick<Headers, 'get'>;

/** Pull a presented token off a request: `?token=` first, then the header. */
export function readRequestToken(
  url: Pick<URL, 'searchParams'>,
  headers?: TokenHeaders,
): string | null {
  const fromQuery = url.searchParams.get(ACCESS_TOKEN_QUERY_PARAM);
  if (fromQuery?.trim()) return fromQuery.trim();
  const fromHeader = headers?.get(ACCESS_TOKEN_HEADER);
  if (fromHeader?.trim()) return fromHeader.trim();
  const auth = headers?.get('authorization');
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

/**
 * True when the request may proceed.
 * An instance with no configured token is open — same as today's behaviour.
 */
export function isAuthorizedRequest(
  configured: string | null,
  url: Pick<URL, 'searchParams'>,
  headers?: TokenHeaders,
): boolean {
  if (!configured) return true;
  const presented = readRequestToken(url, headers);
  if (!presented) return false;
  return timingSafeEqualString(configured, presented);
}

/** Append `?token=` to a URL when a token is configured. */
export function withAccessToken(url: string, token: string | null): string {
  if (!token) return url;
  const parsed = new URL(url);
  parsed.searchParams.set(ACCESS_TOKEN_QUERY_PARAM, token);
  return parsed.href;
}

/** Headers for a token-bearing `fetch` (WebSocket cannot use these). */
export function accessTokenHeaders(token: string | null): Record<string, string> {
  return token ? { [ACCESS_TOKEN_HEADER]: token } : {};
}
