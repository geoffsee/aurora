import { describe, expect, test } from 'vitest';
import {
  createBridgeAuthorizer,
  createOtpStore,
  OTP_ATTEMPT_WINDOW_MS,
  OTP_CODE_TTL_MS,
  OTP_MAX_ATTEMPTS_PER_WINDOW,
  OTP_MAX_CODE_ATTEMPTS,
  OTP_MAX_SESSIONS,
  OTP_SESSION_TTL_MS,
} from '../../bridge/otp-store.ts';
import { PAIRING_CODE_ALPHABET, PAIRING_CODE_LENGTH } from '../../shared/pairing-code.ts';

/** Distinct, deterministic codes that are valid in the real alphabet. */
function fakeCode(seq: number): string {
  let out = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    out += PAIRING_CODE_ALPHABET[(seq + i * 7) % PAIRING_CODE_ALPHABET.length];
  }
  return out;
}

/** A well-formed code that is never the minted one. */
const WRONG_CODE = 'ZZZZZZZZ';

/** A store with a movable clock and predictable codes/tokens. */
function harness(start = 1_000) {
  let clock = start;
  let codeSeq = 0;
  let tokenSeq = 0;
  const store = createOtpStore({
    now: () => clock,
    generateCode: () => fakeCode(codeSeq++),
    generateToken: () => `token-${tokenSeq++}`,
  });
  return {
    store,
    advance(ms: number) {
      clock += ms;
    },
    get clock() {
      return clock;
    },
  };
}

describe('mint', () => {
  test('issues a code with the relay-matching TTL', () => {
    const { store, clock } = harness();
    const minted = store.mint();
    expect(minted.code).toBe(fakeCode(0));
    expect(minted.expiresAt).toBe(clock + OTP_CODE_TTL_MS);
    expect(store.stats()).toMatchObject({ hasCode: true, sessions: 0 });
  });

  test('a second mint retires the first — one live code at a time', () => {
    const { store } = harness();
    const first = store.mint();
    const second = store.mint();
    expect(second.code).not.toBe(first.code);
    expect(store.redeem(first.code)).toMatchObject({ ok: false, status: 401 });
    expect(store.redeem(second.code).ok).toBe(true);
  });
});

describe('redeem', () => {
  test('exchanges a code for a session token', () => {
    const h = harness();
    const minted = h.store.mint();
    const result = h.store.redeem(minted.code);
    expect(result).toEqual({
      ok: true,
      token: 'token-0',
      expiresAt: h.clock + OTP_SESSION_TTL_MS,
    });
    expect(h.store.isSessionToken('token-0')).toBe(true);
  });

  test('accepts operator formatting — spaces, dashes, lowercase', () => {
    const { store } = harness();
    const minted = store.mint();
    const typed = `${minted.code.slice(0, 4)}-${minted.code.slice(4)}`.toLowerCase();
    expect(store.redeem(typed).ok).toBe(true);
  });

  test('is single-use: the code is dead the moment it works', () => {
    const { store } = harness();
    const minted = store.mint();
    expect(store.redeem(minted.code).ok).toBe(true);
    expect(store.redeem(minted.code)).toMatchObject({ ok: false, status: 404 });
  });

  test('rejects an expired code and clears it', () => {
    const h = harness();
    const minted = h.store.mint();
    h.advance(OTP_CODE_TTL_MS);
    expect(h.store.redeem(minted.code)).toMatchObject({ ok: false, status: 410 });
    expect(h.store.stats().hasCode).toBe(false);
  });

  test('burns the code after too many well-formed wrong guesses', () => {
    const { store } = harness();
    const minted = store.mint();
    for (let i = 0; i < OTP_MAX_CODE_ATTEMPTS - 1; i += 1) {
      expect(store.redeem(WRONG_CODE)).toMatchObject({ ok: false, status: 401 });
    }
    expect(store.redeem(WRONG_CODE)).toMatchObject({ ok: false, status: 429 });
    // Burned: even the right code is gone now.
    expect(store.redeem(minted.code)).toMatchObject({ ok: false, status: 404 });
  });

  test('malformed input does not spend the attempt budget', () => {
    // Otherwise anyone on the LAN can burn every code an operator issues by
    // posting junk — a denial of pairing that costs the attacker nothing.
    const { store } = harness();
    const minted = store.mint();
    for (let i = 0; i < OTP_MAX_CODE_ATTEMPTS + 3; i += 1) {
      expect(store.redeem('nope')).toMatchObject({ ok: false, status: 400 });
    }
    expect(store.redeem(minted.code).ok).toBe(true);
  });

  test('rejects codes containing ambiguous characters outside the alphabet', () => {
    const { store } = harness();
    store.mint();
    expect(store.redeem('ZZZZ0110')).toMatchObject({ ok: false, status: 400 });
  });

  test('flood-limits the endpoint independently of any one code', () => {
    const h = harness();
    h.store.mint();
    for (let i = 0; i < OTP_MAX_ATTEMPTS_PER_WINDOW; i += 1) h.store.redeem('nope');
    expect(h.store.redeem('nope')).toMatchObject({ ok: false, status: 429 });

    // The window slides, so a legitimate operator is not locked out for good.
    h.advance(OTP_ATTEMPT_WINDOW_MS);
    expect(h.store.redeem('nope')).toMatchObject({ ok: false, status: 400 });
  });

  test('no active code is a 404, not a hint about what would have worked', () => {
    const { store } = harness();
    expect(store.redeem(fakeCode(0))).toMatchObject({ ok: false, status: 404 });
  });
});

describe('session tokens', () => {
  test('an unknown token is never authorized', () => {
    const { store } = harness();
    store.mint();
    expect(store.isSessionToken('token-0')).toBe(false);
    expect(store.isSessionToken('')).toBe(false);
  });

  test('expire on their own so a forgotten phone does not stay live forever', () => {
    const h = harness();
    const minted = h.store.mint();
    const result = h.store.redeem(minted.code);
    expect(result.ok).toBe(true);
    h.advance(OTP_SESSION_TTL_MS - 1);
    expect(h.store.isSessionToken('token-0')).toBe(true);
    h.advance(1);
    expect(h.store.isSessionToken('token-0')).toBe(false);
    expect(h.store.stats().sessions).toBe(0);
  });

  test('survive reconnects — the whole point of issuing a token', () => {
    const h = harness();
    const minted = h.store.mint();
    h.store.redeem(minted.code);
    h.advance(60_000);
    expect(h.store.isSessionToken('token-0')).toBe(true);
    expect(h.store.isSessionToken('token-0')).toBe(true);
  });

  test('evicts the oldest session past the cap', () => {
    const h = harness();
    for (let i = 0; i < OTP_MAX_SESSIONS; i += 1) {
      h.store.redeem(h.store.mint().code);
    }
    expect(h.store.stats().sessions).toBe(OTP_MAX_SESSIONS);
    expect(h.store.isSessionToken('token-0')).toBe(true);

    h.store.redeem(h.store.mint().code);
    expect(h.store.stats().sessions).toBe(OTP_MAX_SESSIONS);
    expect(h.store.isSessionToken('token-0')).toBe(false);
    expect(h.store.isSessionToken(`token-${OTP_MAX_SESSIONS}`)).toBe(true);
  });

  test('revokeAll kills every phone and any outstanding code', () => {
    const h = harness();
    h.store.redeem(h.store.mint().code);
    h.store.redeem(h.store.mint().code);
    h.store.mint();

    expect(h.store.revokeAll()).toBe(2);
    expect(h.store.isSessionToken('token-0')).toBe(false);
    expect(h.store.isSessionToken('token-1')).toBe(false);
    expect(h.store.stats()).toEqual({ hasCode: false, codeExpiresAt: null, sessions: 0 });
  });
});

describe('createBridgeAuthorizer — the /ws and package-import gate', () => {
  const wsUrl = (token?: string) =>
    new URL(`https://show.lan/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`);

  test('an ungated instance stays open, exactly as before OTP existed', () => {
    const h = harness();
    const authorize = createBridgeAuthorizer(null, h.store);
    expect(authorize(wsUrl())).toBe(true);
  });

  test('a gated instance rejects an upgrade with no token', () => {
    const h = harness();
    const authorize = createBridgeAuthorizer('configured-secret', h.store);
    expect(authorize(wsUrl())).toBe(false);
  });

  test('a gated instance rejects an upgrade with the wrong token', () => {
    const h = harness();
    const authorize = createBridgeAuthorizer('configured-secret', h.store);
    expect(authorize(wsUrl('configured-secrez'))).toBe(false);
    expect(authorize(wsUrl('configured'))).toBe(false);
  });

  test('the configured token still works', () => {
    const h = harness();
    const authorize = createBridgeAuthorizer('configured-secret', h.store);
    expect(authorize(wsUrl('configured-secret'))).toBe(true);
  });

  test('a redeemed session token opens the socket', () => {
    const h = harness();
    const authorize = createBridgeAuthorizer('configured-secret', h.store);
    const redeemed = h.store.redeem(h.store.mint().code);
    expect(redeemed.ok).toBe(true);
    expect(authorize(wsUrl('token-0'))).toBe(true);
  });

  test('and stops opening it once revoked', () => {
    const h = harness();
    const authorize = createBridgeAuthorizer('configured-secret', h.store);
    h.store.redeem(h.store.mint().code);
    expect(authorize(wsUrl('token-0'))).toBe(true);
    h.store.revokeAll();
    expect(authorize(wsUrl('token-0'))).toBe(false);
  });

  test('and stops opening it once expired', () => {
    const h = harness();
    const authorize = createBridgeAuthorizer('configured-secret', h.store);
    h.store.redeem(h.store.mint().code);
    h.advance(OTP_SESSION_TTL_MS);
    expect(authorize(wsUrl('token-0'))).toBe(false);
  });

  test('an unredeemed pairing code is not itself a credential', () => {
    // The code is a bearer of one exchange, never of control. If this ever
    // passes, the short-code space becomes the security boundary.
    const h = harness();
    const authorize = createBridgeAuthorizer('configured-secret', h.store);
    const minted = h.store.mint();
    expect(authorize(wsUrl(minted.code))).toBe(false);
  });

  test('reads the header form too, for fetch callers', () => {
    const h = harness();
    const authorize = createBridgeAuthorizer('configured-secret', h.store);
    h.store.redeem(h.store.mint().code);
    const headers = new Headers({ 'x-aurora-token': 'token-0' });
    expect(authorize(new URL('https://show.lan/api/packages/import'), headers)).toBe(true);
  });
});
