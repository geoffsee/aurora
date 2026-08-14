import { describe, expect, test, vi } from 'vitest';
import {
  mintOtp,
  OTP_PATHS,
  parseOtpError,
  parseOtpMintResponse,
  parseOtpRedeemResponse,
  redeemOtp,
  revokeOtpSessions,
} from '../../shared/otp-auth.ts';

const ORIGIN = 'https://192.168.1.10:8444';

function stubFetch(status: number, body: unknown) {
  return vi.fn(async () => Response.json(body as object, { status }));
}

describe('response parsing', () => {
  test('mint needs a code', () => {
    expect(parseOtpMintResponse({ code: 'ABCDEFGH', expiresAt: 5 })).toEqual({
      code: 'ABCDEFGH',
      expiresAt: 5,
    });
    expect(parseOtpMintResponse({ expiresAt: 5 })).toBeNull();
    expect(parseOtpMintResponse({ code: '   ' })).toBeNull();
    expect(parseOtpMintResponse(null)).toBeNull();
  });

  test('redeem needs a token', () => {
    expect(parseOtpRedeemResponse({ token: 'abc', expiresAt: 9 })).toEqual({
      token: 'abc',
      expiresAt: 9,
    });
    expect(parseOtpRedeemResponse({ token: '' })).toBeNull();
    expect(parseOtpRedeemResponse('nope')).toBeNull();
  });

  test('a missing expiry degrades to 0 rather than rejecting the response', () => {
    expect(parseOtpRedeemResponse({ token: 'abc' })).toEqual({ token: 'abc', expiresAt: 0 });
  });

  test('errors prefer the bridge message', () => {
    expect(parseOtpError({ error: 'that code expired' }, 410)).toBe('that code expired');
    expect(parseOtpError({}, 500)).toBe('bridge HTTP 500');
    expect(parseOtpError(null, 401)).toBe('bridge HTTP 401');
  });
});

describe('mintOtp', () => {
  test('posts to the mint path carrying the access-token header', async () => {
    const fetchImpl = stubFetch(200, { code: 'ABCDEFGH', expiresAt: 123 });
    const result = await mintOtp(ORIGIN, { 'x-aurora-token': 'secret' }, fetchImpl as never);
    expect(result).toEqual({ ok: true, value: { code: 'ABCDEFGH', expiresAt: 123 } });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}${OTP_PATHS.mint}`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-aurora-token']).toBe('secret');
  });

  test('passes the bridge refusal straight through', async () => {
    // An ungated bridge has nothing to pair into — the operator needs to hear
    // that, not a generic failure.
    const fetchImpl = stubFetch(409, { error: 'set AURORA_ACCESS_TOKEN' });
    const result = await mintOtp(ORIGIN, {}, fetchImpl as never);
    expect(result).toEqual({ ok: false, error: 'set AURORA_ACCESS_TOKEN' });
  });

  test('a network failure is an error, not a throw', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await mintOtp(ORIGIN, {}, fetchImpl as never)).toEqual({ ok: false, error: 'offline' });
  });
});

describe('redeemOtp', () => {
  test('sends only the code — no credential required', async () => {
    const fetchImpl = stubFetch(200, { token: 'session-token', expiresAt: 999 });
    const result = await redeemOtp(ORIGIN, 'abcd-efgh', fetchImpl as never);
    expect(result).toEqual({ ok: true, value: { token: 'session-token', expiresAt: 999 } });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}${OTP_PATHS.redeem}`);
    expect(JSON.parse(String(init.body))).toEqual({ code: 'abcd-efgh' });
    expect((init.headers as Record<string, string>)['x-aurora-token']).toBeUndefined();
  });

  test('surfaces the rejection reason so the operator knows to ask for a new code', async () => {
    const fetchImpl = stubFetch(410, { error: 'that code expired — ask for a new one' });
    expect(await redeemOtp(ORIGIN, 'ABCDEFGH', fetchImpl as never)).toEqual({
      ok: false,
      error: 'that code expired — ask for a new one',
    });
  });

  test('a 200 with no token is treated as a failure', async () => {
    const fetchImpl = stubFetch(200, { ok: true });
    expect(await redeemOtp(ORIGIN, 'ABCDEFGH', fetchImpl as never)).toEqual({
      ok: false,
      error: 'bridge returned an unusable session',
    });
  });
});

describe('revokeOtpSessions', () => {
  test('reports how many phones were kicked', async () => {
    const fetchImpl = stubFetch(200, { revoked: 3 });
    expect(await revokeOtpSessions(ORIGIN, {}, fetchImpl as never)).toEqual({
      ok: true,
      value: { revoked: 3 },
    });
  });

  test('a response without a count still succeeds at zero', async () => {
    const fetchImpl = stubFetch(200, {});
    expect(await revokeOtpSessions(ORIGIN, {}, fetchImpl as never)).toEqual({
      ok: true,
      value: { revoked: 0 },
    });
  });
});
