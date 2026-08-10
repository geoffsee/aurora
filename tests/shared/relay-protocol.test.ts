import { describe, expect, test } from 'vitest';
import {
  normalizeRelayBaseUrl,
  parsePairResponse,
  parseRegisterResponse,
  parseRelayError,
  parseRotateCodeResponse,
  relaySocketUrl,
} from '../../shared/relay-protocol.ts';

describe('parseRegisterResponse', () => {
  const valid = {
    protocolVersion: 1,
    sessionId: 'abc-123',
    hostToken: 'tok',
    code: 'ABCD2345',
    codeExpiresAt: 1000,
  };

  test('accepts a well-formed payload', () => {
    expect(parseRegisterResponse(valid)).toEqual(valid);
  });

  test('normalizes a formatted code', () => {
    expect(parseRegisterResponse({ ...valid, code: 'abcd-2345' })?.code).toBe('ABCD2345');
  });

  test('rejects payloads missing identity or carrying a bad code', () => {
    expect(parseRegisterResponse({ ...valid, sessionId: '' })).toBeNull();
    expect(parseRegisterResponse({ ...valid, hostToken: '' })).toBeNull();
    expect(parseRegisterResponse({ ...valid, code: 'NOPE' })).toBeNull();
    expect(parseRegisterResponse(null)).toBeNull();
    expect(parseRegisterResponse([valid])).toBeNull();
  });
});

describe('parseRotateCodeResponse / parsePairResponse', () => {
  test('rotate requires a valid code', () => {
    expect(parseRotateCodeResponse({ code: 'ABCD2345', codeExpiresAt: 5 })).toEqual({
      code: 'ABCD2345',
      codeExpiresAt: 5,
    });
    expect(parseRotateCodeResponse({ code: 'X' })).toBeNull();
  });

  test('pair requires session and token', () => {
    expect(parsePairResponse({ sessionId: 's', guestToken: 'g' })).toEqual({
      protocolVersion: 1,
      sessionId: 's',
      guestToken: 'g',
    });
    expect(parsePairResponse({ sessionId: 's' })).toBeNull();
    expect(parsePairResponse({ guestToken: 'g' })).toBeNull();
  });
});

describe('parseRelayError', () => {
  test('prefers the server message, else summarizes the status', () => {
    expect(parseRelayError({ error: 'code expired' }, 410)).toBe('code expired');
    expect(parseRelayError(null, 500)).toBe('relay HTTP 500');
    expect(parseRelayError({}, 404)).toBe('relay HTTP 404');
  });
});

describe('normalizeRelayBaseUrl', () => {
  test('adds https to a bare host and reduces to an origin', () => {
    expect(normalizeRelayBaseUrl('relay.example.workers.dev')).toBe(
      'https://relay.example.workers.dev',
    );
    expect(normalizeRelayBaseUrl('https://relay.example.dev/some/path?x=1')).toBe(
      'https://relay.example.dev',
    );
  });

  test('rejects junk and non-http schemes', () => {
    expect(normalizeRelayBaseUrl('')).toBeNull();
    expect(normalizeRelayBaseUrl('ws://relay.example.dev')).toBeNull();
    expect(normalizeRelayBaseUrl('not a url')).toBeNull();
  });
});

describe('relaySocketUrl', () => {
  test('upgrades the scheme and carries session, token, and role', () => {
    const url = new URL(
      relaySocketUrl('https://relay.example.dev', {
        sessionId: 's1',
        token: 'tok',
        role: 'guest',
      }),
    );
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe('/api/socket');
    expect(url.searchParams.get('session')).toBe('s1');
    expect(url.searchParams.get('token')).toBe('tok');
    expect(url.searchParams.get('role')).toBe('guest');
  });

  test('uses ws for an http relay (local wrangler dev)', () => {
    const url = new URL(
      relaySocketUrl('http://127.0.0.1:8787', { sessionId: 's', token: 't', role: 'host' }),
    );
    expect(url.protocol).toBe('ws:');
  });

  test('throws on an unusable base URL rather than building a broken socket', () => {
    expect(() =>
      relaySocketUrl('nope://x', { sessionId: 's', token: 't', role: 'host' }),
    ).toThrow();
  });
});
