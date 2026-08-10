/**
 * Wire contract between the browser clients and the relay Worker.
 *
 * The relay exists for the GitHub Pages deployment, where there is no local
 * bridge and no way to trust a LAN certificate: both ends load over a public CA
 * and meet in the middle at Cloudflare. It brokers bytes and nothing else — it
 * never parses an OscFrame, so the control schema can change without the Worker
 * being redeployed or even knowing.
 *
 * Roles: exactly one `host` (the projector, which owns the render) and any
 * number of `guest` control surfaces (phone, tablet, a second operator).
 */

import { isValidPairingCode, normalizePairingCode } from './pairing-code.ts';

export const RELAY_PROTOCOL_VERSION = 1;

export const RELAY_PATHS = {
  /** POST — projector registers and receives its host token + first code. */
  register: '/api/session',
  /** POST — host rotates its pairing code. */
  rotateCode: '/api/session/code',
  /** POST — guest redeems a code for a guest token. */
  pair: '/api/pair',
  /** GET (upgrade) — the relay socket itself. */
  socket: '/api/socket',
} as const;

export type RelayRole = 'host' | 'guest';

export type RegisterSessionResponse = {
  protocolVersion: number;
  sessionId: string;
  hostToken: string;
  code: string;
  codeExpiresAt: number;
};

export type RotateCodeRequest = { sessionId: string; hostToken: string };
export type RotateCodeResponse = { code: string; codeExpiresAt: number };

export type PairRequest = { code: string };
export type PairResponse = {
  protocolVersion: number;
  sessionId: string;
  guestToken: string;
};

export type RelayErrorResponse = { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Parse a register response, or null when the payload is not usable. */
export function parseRegisterResponse(raw: unknown): RegisterSessionResponse | null {
  if (!isRecord(raw)) return null;
  const sessionId = readString(raw.sessionId);
  const hostToken = readString(raw.hostToken);
  const code = normalizePairingCode(readString(raw.code));
  const codeExpiresAt = typeof raw.codeExpiresAt === 'number' ? raw.codeExpiresAt : 0;
  if (!sessionId || !hostToken || !isValidPairingCode(code)) return null;
  return {
    protocolVersion:
      typeof raw.protocolVersion === 'number' ? raw.protocolVersion : RELAY_PROTOCOL_VERSION,
    sessionId,
    hostToken,
    code,
    codeExpiresAt,
  };
}

export function parseRotateCodeResponse(raw: unknown): RotateCodeResponse | null {
  if (!isRecord(raw)) return null;
  const code = normalizePairingCode(readString(raw.code));
  if (!isValidPairingCode(code)) return null;
  return {
    code,
    codeExpiresAt: typeof raw.codeExpiresAt === 'number' ? raw.codeExpiresAt : 0,
  };
}

export function parsePairResponse(raw: unknown): PairResponse | null {
  if (!isRecord(raw)) return null;
  const sessionId = readString(raw.sessionId);
  const guestToken = readString(raw.guestToken);
  if (!sessionId || !guestToken) return null;
  return {
    protocolVersion:
      typeof raw.protocolVersion === 'number' ? raw.protocolVersion : RELAY_PROTOCOL_VERSION,
    sessionId,
    guestToken,
  };
}

/** Extract a server-side error message, falling back to a status summary. */
export function parseRelayError(raw: unknown, status: number): string {
  if (isRecord(raw)) {
    const error = readString(raw.error);
    if (error) return error;
  }
  return `relay HTTP ${status}`;
}

/** Normalize an operator-entered relay URL to an origin with no trailing slash. */
export function normalizeRelayBaseUrl(raw: string): string | null {
  const clean = readString(raw);
  if (!clean) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(clean) ? clean : `https://${clean}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * WebSocket URL for a session.
 * Token travels as a query param because browsers cannot set headers on a
 * WebSocket handshake — the same constraint the local bridge works under.
 */
export function relaySocketUrl(
  baseUrl: string,
  session: { sessionId: string; token: string; role: RelayRole },
): string {
  const origin = normalizeRelayBaseUrl(baseUrl);
  if (!origin) throw new Error(`invalid relay base URL: ${baseUrl}`);
  const url = new URL(`${origin}${RELAY_PATHS.socket}`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('session', session.sessionId);
  url.searchParams.set('token', session.token);
  url.searchParams.set('role', session.role);
  return url.href;
}
