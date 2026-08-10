import { describe, expect, test } from 'vitest';
import {
  ACCESS_TOKEN_HEADER,
  accessTokenHeaders,
  isAuthorizedRequest,
  normalizeAccessToken,
  readRequestToken,
  timingSafeEqualString,
  withAccessToken,
} from '../../shared/access-token.ts';

function req(url: string, headers: Record<string, string> = {}) {
  return { url: new URL(url), headers: new Headers(headers) };
}

describe('normalizeAccessToken', () => {
  test('blank and whitespace mean "no token required"', () => {
    expect(normalizeAccessToken(undefined)).toBeNull();
    expect(normalizeAccessToken('')).toBeNull();
    expect(normalizeAccessToken('   ')).toBeNull();
  });

  test('trims a configured token', () => {
    expect(normalizeAccessToken('  s3cret ')).toBe('s3cret');
  });
});

describe('timingSafeEqualString', () => {
  test('matches only identical strings', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualString('', '')).toBe(true);
  });
});

describe('readRequestToken', () => {
  test('prefers the query param', () => {
    const { url, headers } = req('https://x/ws?token=fromquery', {
      [ACCESS_TOKEN_HEADER]: 'fromheader',
    });
    expect(readRequestToken(url, headers)).toBe('fromquery');
  });

  test('falls back to the header, then bearer auth', () => {
    const header = req('https://x/api', { [ACCESS_TOKEN_HEADER]: 'h' });
    expect(readRequestToken(header.url, header.headers)).toBe('h');
    const bearer = req('https://x/api', { authorization: 'Bearer  b3arer ' });
    expect(readRequestToken(bearer.url, bearer.headers)).toBe('b3arer');
  });

  test('blank values do not count as presented', () => {
    const { url, headers } = req('https://x/ws?token=%20');
    expect(readRequestToken(url, headers)).toBeNull();
  });
});

describe('isAuthorizedRequest', () => {
  test('an instance with no configured token stays open', () => {
    const { url, headers } = req('https://x/ws');
    expect(isAuthorizedRequest(null, url, headers)).toBe(true);
  });

  test('rejects a missing or wrong token when one is configured', () => {
    const missing = req('https://x/ws');
    expect(isAuthorizedRequest('s3cret', missing.url, missing.headers)).toBe(false);
    const wrong = req('https://x/ws?token=nope');
    expect(isAuthorizedRequest('s3cret', wrong.url, wrong.headers)).toBe(false);
  });

  test('accepts the token by query, header, or bearer', () => {
    for (const r of [
      req('https://x/ws?token=s3cret'),
      req('https://x/ws', { [ACCESS_TOKEN_HEADER]: 's3cret' }),
      req('https://x/ws', { authorization: 'Bearer s3cret' }),
    ]) {
      expect(isAuthorizedRequest('s3cret', r.url, r.headers)).toBe(true);
    }
  });
});

describe('withAccessToken', () => {
  test('is a no-op without a token', () => {
    expect(withAccessToken('wss://host:8443/ws', null)).toBe('wss://host:8443/ws');
  });

  test('appends to ws and http URLs alike', () => {
    expect(withAccessToken('wss://host:8443/ws', 's3cret')).toBe('wss://host:8443/ws?token=s3cret');
    expect(withAccessToken('https://host:8443/?embed=1', 's3cret')).toBe(
      'https://host:8443/?embed=1&token=s3cret',
    );
  });

  test('replaces an existing token rather than duplicating it', () => {
    expect(withAccessToken('wss://host/ws?token=old', 'new')).toBe('wss://host/ws?token=new');
  });
});

describe('accessTokenHeaders', () => {
  test('empty without a token', () => {
    expect(accessTokenHeaders(null)).toEqual({});
    expect(accessTokenHeaders('s3cret')).toEqual({ [ACCESS_TOKEN_HEADER]: 's3cret' });
  });
});
