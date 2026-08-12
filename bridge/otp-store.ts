/**
 * One-time passwords for LAN mobile clients.
 *
 * `AURORA_ACCESS_TOKEN` is a 32-character hex string. It is the right shape for
 * a config file and the wrong shape for a phone at load-in: nobody types it
 * correctly on a handset in a dark room, so in practice it gets shared as a
 * tokenised URL — which is the *long-lived* credential travelling through chat.
 *
 * This gives the LAN path what the relay already proved works: a short typable
 * code, redeemed **once**, for a random session token that does the actual
 * authenticating. Same shape, same alphabet, same TTL, so an operator learns one
 * flow (issue #281).
 *
 * Design decisions this file bakes in, from the issue's open questions:
 *
 * - **Issued codes, not TOTP.** TOTP needs a shared secret provisioned into an
 *   authenticator app before the show — more setup, another dependency, and no
 *   better than a 5-minute code for a credential handed over once at load-in.
 * - **Beside `AURORA_ACCESS_TOKEN`, not replacing it.** The env var stays the
 *   operator's configured secret and is what authorises *minting*. A redeemed
 *   session token is accepted anywhere the configured token is.
 * - **The bridge mints locally.** Reusing the relay Worker would put an internet
 *   round-trip in the middle of pairing a phone to a LAN box, which is the one
 *   place the relay exists to avoid needing.
 *
 * State is in-memory on purpose: a bridge restart revokes every phone session,
 * which is the behaviour you want from a show machine between gigs.
 */

import {
  isAuthorizedRequest,
  readRequestToken,
  timingSafeEqualString,
} from '../shared/access-token.ts';
import {
  generatePairingCode,
  generateSessionToken,
  isValidPairingCode,
  MAX_PAIR_ATTEMPTS,
  normalizePairingCode,
  PAIRING_CODE_TTL_MS,
} from '../shared/pairing-code.ts';

/** Matches the relay's code lifetime — one flow, one set of expectations. */
export const OTP_CODE_TTL_MS = PAIRING_CODE_TTL_MS;

/** Long enough for load-in through teardown; short enough to not outlive a gig. */
export const OTP_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Wrong-but-well-formed guesses before the code is burned. */
export const OTP_MAX_CODE_ATTEMPTS = MAX_PAIR_ATTEMPTS;

/** Coarse flood guard on the redeem endpoint, independent of any one code. */
export const OTP_ATTEMPT_WINDOW_MS = 60_000;
export const OTP_MAX_ATTEMPTS_PER_WINDOW = 20;

/**
 * Concurrent phone sessions. Bounded both to keep the constant-time scan short
 * and so a forgotten phone cannot accumulate credentials indefinitely.
 */
export const OTP_MAX_SESSIONS = 8;

export type OtpMint = { code: string; expiresAt: number };

export type OtpRedeemResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; status: number; error: string };

export type OtpStoreStats = {
  hasCode: boolean;
  codeExpiresAt: number | null;
  sessions: number;
};

export type OtpStore = {
  /** Issue a code, replacing any outstanding one. */
  mint(): OtpMint;
  /** Exchange an operator-typed code for a session token. */
  redeem(rawCode: string): OtpRedeemResult;
  /** True when `token` is a live session token. */
  isSessionToken(token: string): boolean;
  /** Drop every session token and any outstanding code. Returns sessions killed. */
  revokeAll(): number;
  stats(): OtpStoreStats;
};

type PendingCode = {
  code: string;
  expiresAt: number;
  attemptsLeft: number;
};

export function createOtpStore(
  options: {
    now?: () => number;
    generateCode?: () => string;
    generateToken?: () => string;
    codeTtlMs?: number;
    sessionTtlMs?: number;
  } = {},
): OtpStore {
  const now = options.now ?? (() => Date.now());
  const makeCode = options.generateCode ?? (() => generatePairingCode());
  const makeToken = options.generateToken ?? (() => generateSessionToken());
  const codeTtlMs = options.codeTtlMs ?? OTP_CODE_TTL_MS;
  const sessionTtlMs = options.sessionTtlMs ?? OTP_SESSION_TTL_MS;

  let pending: PendingCode | null = null;
  /** token → expiry. Insertion order is age order, which is the eviction order. */
  const sessions = new Map<string, number>();
  let attemptWindow: number[] = [];

  function pruneSessions(at: number): void {
    for (const [token, expiresAt] of sessions) {
      if (expiresAt <= at) sessions.delete(token);
    }
  }

  function floodLimited(at: number): boolean {
    attemptWindow = attemptWindow.filter((stamp) => at - stamp < OTP_ATTEMPT_WINDOW_MS);
    if (attemptWindow.length >= OTP_MAX_ATTEMPTS_PER_WINDOW) return true;
    attemptWindow.push(at);
    return false;
  }

  return {
    mint() {
      const at = now();
      // One outstanding code at a time: minting a second would leave the first
      // live and shoulder-surfable with nothing on screen saying so.
      pending = {
        code: makeCode(),
        expiresAt: at + codeTtlMs,
        attemptsLeft: OTP_MAX_CODE_ATTEMPTS,
      };
      return { code: pending.code, expiresAt: pending.expiresAt };
    },

    redeem(rawCode: string) {
      const at = now();
      if (floodLimited(at)) {
        return { ok: false, status: 429, error: 'too many attempts — wait a minute' };
      }

      const code = normalizePairingCode(rawCode);
      // A malformed code is not a guess at a real one, so it must not spend the
      // budget — otherwise anyone on the LAN can burn every code an operator
      // issues by posting junk.
      if (!isValidPairingCode(code)) {
        return { ok: false, status: 400, error: 'that code does not look right' };
      }

      if (!pending) {
        return { ok: false, status: 404, error: 'no pairing code is active' };
      }
      if (pending.expiresAt <= at) {
        pending = null;
        return { ok: false, status: 410, error: 'that code expired — ask for a new one' };
      }

      if (!timingSafeEqualString(pending.code, code)) {
        pending.attemptsLeft -= 1;
        if (pending.attemptsLeft <= 0) {
          // Burn rather than allow an unbounded walk through a small space.
          pending = null;
          return { ok: false, status: 429, error: 'too many wrong codes — ask for a new one' };
        }
        return { ok: false, status: 401, error: 'that code is not right' };
      }

      // Single-use: the code stops being a credential the moment it works.
      pending = null;
      pruneSessions(at);
      if (sessions.size >= OTP_MAX_SESSIONS) {
        const oldest = sessions.keys().next();
        if (!oldest.done) sessions.delete(oldest.value);
      }
      const token = makeToken();
      const expiresAt = at + sessionTtlMs;
      sessions.set(token, expiresAt);
      return { ok: true, token, expiresAt };
    },

    isSessionToken(token: string) {
      if (typeof token !== 'string' || token === '') return false;
      const at = now();
      pruneSessions(at);
      // Constant-time against every live token rather than a map lookup, so a
      // caller cannot learn a prefix from response timing. Bounded by
      // OTP_MAX_SESSIONS.
      let match = false;
      for (const candidate of sessions.keys()) {
        if (timingSafeEqualString(candidate, token)) match = true;
      }
      return match;
    },

    revokeAll() {
      const killed = sessions.size;
      sessions.clear();
      pending = null;
      return killed;
    },

    stats() {
      const at = now();
      pruneSessions(at);
      const live = pending !== null && pending.expiresAt > at;
      return {
        hasCode: live,
        codeExpiresAt: live && pending ? pending.expiresAt : null,
        sessions: sessions.size,
      };
    },
  };
}

/**
 * The bridge's control-plane gate: the configured token, or a live phone session.
 *
 * Wrapping `isAuthorizedRequest` rather than replacing it keeps the "no token
 * configured means open" behaviour intact, and keeps a redeemed session token
 * accepted in exactly the places the configured token is — `/ws` and package
 * import — and nowhere else.
 */
export function createBridgeAuthorizer(
  configured: string | null,
  store: OtpStore,
): (url: Pick<URL, 'searchParams'>, headers?: Pick<Headers, 'get'>) => boolean {
  return (url, headers) => {
    if (isAuthorizedRequest(configured, url, headers)) return true;
    // Unreachable when `configured` is null (the call above already allowed it),
    // but stated explicitly so the invariant survives a refactor.
    if (!configured) return true;
    const presented = readRequestToken(url, headers);
    return presented !== null && store.isSessionToken(presented);
  };
}
