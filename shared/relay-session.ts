/**
 * Browser client for the relay Worker (worker/src/index.ts).
 *
 * Two roles, two stored credentials:
 * - **host** — the projector. Registers a session, displays a pairing code.
 * - **guest** — a control surface. Types the code once, keeps a token.
 *
 * The code is never stored as the credential; it is exchanged for a long random
 * token and then useless. That split is what makes a short, typable code safe.
 */

import { isValidPairingCode, normalizePairingCode } from './pairing-code.ts';
import {
  normalizeRelayBaseUrl,
  parsePairResponse,
  parseRegisterResponse,
  parseRelayError,
  parseRotateCodeResponse,
  RELAY_PATHS,
  type RelayRole,
  relaySocketUrl,
} from './relay-protocol.ts';

export const RELAY_HOST_SESSION_KEY = 'aurora.relay.host';
export const RELAY_GUEST_SESSION_KEY = 'aurora.relay.guest';
export const RELAY_BASE_URL_KEY = 'aurora.relay.base';
/** Set by the projector on the first guest frame; read by Console's pairing UI. */
export const RELAY_PAIRED_KEY = 'aurora.relay.paired';

/**
 * Deployed relay. Overridable with `?relay=` (persisted) so a fork can point at
 * its own Worker without a rebuild.
 */
export const DEFAULT_RELAY_BASE_URL = 'https://aurora-relay.seemueller.workers.dev';

export type HostSession = {
  relayBase: string;
  sessionId: string;
  hostToken: string;
  code: string;
  codeExpiresAt: number;
};

export type GuestSession = {
  relayBase: string;
  sessionId: string;
  guestToken: string;
};

/** Evidence that at least one guest has actually sent a frame on a session. */
export type PairedMark = {
  sessionId: string;
  pairedAt: number;
};

export type RelayResult<T> = { ok: true; value: T } | { ok: false; error: string };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readJsonItem<T>(storage: StorageLike | null, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function writeJsonItem(storage: StorageLike | null, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — the in-memory session still drives this tab */
  }
}

/** Relay origin for this page: `?relay=` wins and persists, else stored, else default. */
export function resolveRelayBaseUrl(
  loc: Pick<Location, 'search'> = location,
  storage: StorageLike | null = safeStorage(),
): string {
  let fromQuery: string | null = null;
  try {
    fromQuery = new URLSearchParams(loc.search ?? '').get('relay');
  } catch {
    fromQuery = null;
  }
  if (fromQuery) {
    const normalized = normalizeRelayBaseUrl(fromQuery);
    if (normalized) {
      if (storage) {
        try {
          storage.setItem(RELAY_BASE_URL_KEY, normalized);
        } catch {
          /* ignore */
        }
      }
      return normalized;
    }
  }
  if (storage) {
    try {
      const stored = storage.getItem(RELAY_BASE_URL_KEY);
      const normalized = stored ? normalizeRelayBaseUrl(stored) : null;
      if (normalized) return normalized;
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_RELAY_BASE_URL;
}

export function loadHostSession(storage: StorageLike | null = safeStorage()): HostSession | null {
  const record = readJsonItem<HostSession>(storage, RELAY_HOST_SESSION_KEY);
  if (!record?.sessionId || !record.hostToken || !record.relayBase) return null;
  return record;
}

export function saveHostSession(
  session: HostSession,
  storage: StorageLike | null = safeStorage(),
): void {
  writeJsonItem(storage, RELAY_HOST_SESSION_KEY, session);
}

export function loadGuestSession(storage: StorageLike | null = safeStorage()): GuestSession | null {
  const record = readJsonItem<GuestSession>(storage, RELAY_GUEST_SESSION_KEY);
  if (!record?.sessionId || !record.guestToken || !record.relayBase) return null;
  return record;
}

export function saveGuestSession(
  session: GuestSession,
  storage: StorageLike | null = safeStorage(),
): void {
  writeJsonItem(storage, RELAY_GUEST_SESSION_KEY, session);
}

export function clearGuestSession(storage: StorageLike | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(RELAY_GUEST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Forget the host session so the next `ensureHostSession` registers a new one.
 *
 * The recovery path when a stored session outlives its Durable Object: rotate
 * starts answering 404 and no amount of retrying fixes it.
 */
export function clearHostSession(storage: StorageLike | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(RELAY_HOST_SESSION_KEY);
    storage.removeItem(RELAY_PAIRED_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Record that a guest has paired.
 *
 * The relay tells nobody who is connected — the Durable Object forwards bytes
 * and keeps no roster — so "someone paired" is only observable as the first
 * inbound guest frame, which lands on the projector. Console and projector are
 * the same origin on Pages (`/aurora/` and `/aurora/controls/`), so a storage
 * key is the whole mechanism: no new protocol, no Worker redeploy.
 *
 * Consequence worth knowing: this is a per-browser signal. A Console running on
 * a different machine than the projector will not see it, and shows the code as
 * unpaired until it is rotated or the session is reset.
 */
export function markGuestPaired(
  sessionId: string,
  pairedAt: number,
  storage: StorageLike | null = safeStorage(),
): void {
  if (!sessionId) return;
  writeJsonItem(storage, RELAY_PAIRED_KEY, { sessionId, pairedAt } satisfies PairedMark);
}

/** Read the paired mark, ignoring one left behind by an earlier session. */
export function loadGuestPaired(
  sessionId: string,
  storage: StorageLike | null = safeStorage(),
): PairedMark | null {
  const record = readJsonItem<PairedMark>(storage, RELAY_PAIRED_KEY);
  if (!record || typeof record.pairedAt !== 'number') return null;
  if (!sessionId || record.sessionId !== sessionId) return null;
  return record;
}

/** True when a code has passed its TTL and the relay will refuse it. */
export function isCodeExpired(session: HostSession, now: number): boolean {
  return typeof session.codeExpiresAt === 'number' && session.codeExpiresAt > 0
    ? session.codeExpiresAt <= now
    : false;
}

async function postJson(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<{ status: number; payload: unknown; ok: boolean }> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const payload: unknown = await res.json().catch(() => null);
  return { status: res.status, payload, ok: res.ok };
}

/** Register this browser as the host (projector) of a new session. */
export async function registerHostSession(
  relayBase: string = resolveRelayBaseUrl(),
  fetchImpl: typeof fetch = fetch,
): Promise<RelayResult<HostSession>> {
  const origin = normalizeRelayBaseUrl(relayBase);
  if (!origin) return { ok: false, error: 'invalid relay address' };
  try {
    const { ok, status, payload } = await postJson(
      `${origin}${RELAY_PATHS.register}`,
      {},
      fetchImpl,
    );
    if (!ok) return { ok: false, error: parseRelayError(payload, status) };
    const parsed = parseRegisterResponse(payload);
    if (!parsed) return { ok: false, error: 'relay returned an unusable session' };
    const session: HostSession = { relayBase: origin, ...parsed };
    saveHostSession(session);
    return { ok: true, value: session };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The stored host session, registering one if this origin has none yet.
 *
 * Whichever surface opens first owns registration — projector or Console, it
 * does not matter, because they share an origin (and therefore this key) on the
 * Pages layout. That is what lets Console render the code without taking the
 * render role away from the projector.
 */
export async function ensureHostSession(
  relayBase: string = resolveRelayBaseUrl(),
  fetchImpl: typeof fetch = fetch,
): Promise<RelayResult<HostSession>> {
  const existing = loadHostSession();
  if (existing) return { ok: true, value: existing };
  return registerHostSession(relayBase, fetchImpl);
}

/** Ask the relay for a fresh code (the old one expired or was shown too widely). */
export async function rotateHostCode(
  session: HostSession,
  fetchImpl: typeof fetch = fetch,
): Promise<RelayResult<HostSession>> {
  try {
    const { ok, status, payload } = await postJson(
      `${session.relayBase}${RELAY_PATHS.rotateCode}`,
      { sessionId: session.sessionId, hostToken: session.hostToken },
      fetchImpl,
    );
    if (!ok) return { ok: false, error: parseRelayError(payload, status) };
    const parsed = parseRotateCodeResponse(payload);
    if (!parsed) return { ok: false, error: 'relay returned an unusable code' };
    const next: HostSession = { ...session, ...parsed };
    saveHostSession(next);
    return { ok: true, value: next };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Redeem an operator-typed code for a guest token. */
export async function pairAsGuest(
  rawCode: string,
  relayBase: string = resolveRelayBaseUrl(),
  fetchImpl: typeof fetch = fetch,
): Promise<RelayResult<GuestSession>> {
  const origin = normalizeRelayBaseUrl(relayBase);
  if (!origin) return { ok: false, error: 'invalid relay address' };
  const code = normalizePairingCode(rawCode);
  if (!isValidPairingCode(code)) {
    return { ok: false, error: 'That code does not look right — check the projector.' };
  }
  try {
    const { ok, status, payload } = await postJson(
      `${origin}${RELAY_PATHS.pair}`,
      { code },
      fetchImpl,
    );
    if (!ok) return { ok: false, error: parseRelayError(payload, status) };
    const parsed = parsePairResponse(payload);
    if (!parsed) return { ok: false, error: 'relay returned an unusable pairing' };
    const session: GuestSession = {
      relayBase: origin,
      sessionId: parsed.sessionId,
      guestToken: parsed.guestToken,
    };
    saveGuestSession(session);
    return { ok: true, value: session };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** WebSocket URL for a stored session in either role. */
export function socketUrlForSession(session: HostSession | GuestSession, role: RelayRole): string {
  const token =
    role === 'host' ? (session as HostSession).hostToken : (session as GuestSession).guestToken;
  return relaySocketUrl(session.relayBase, { sessionId: session.sessionId, token, role });
}
