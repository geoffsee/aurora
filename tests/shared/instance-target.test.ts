import { beforeEach, describe, expect, test } from 'vitest';
import { withAccessToken } from '../../shared/access-token.ts';
import {
  describeInstanceTarget,
  INSTANCE_TARGET_KEY,
  instanceLocationFor,
  isRemoteInstance,
  LOCAL_INSTANCE,
  loadInstanceTarget,
  parseInstanceOrigin,
  parseInstanceToken,
  saveInstanceTarget,
} from '../../shared/instance-target.ts';
import { bridgeWebSocketUrl, projectorPreviewUrl } from '../../web/controls/lib/projector-url.ts';

/** Minimal Storage stand-in so tests never depend on happy-dom's localStorage state. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    size: () => map.size,
  };
}

let storage = memoryStorage();
beforeEach(() => {
  storage = memoryStorage();
});

describe('parseInstanceOrigin', () => {
  test('blank means "this page\'s origin"', () => {
    expect(parseInstanceOrigin('')).toEqual({ ok: true, origin: null });
    expect(parseInstanceOrigin('   ')).toEqual({ ok: true, origin: null });
  });

  test('bare host gets https and reduces to an origin', () => {
    expect(parseInstanceOrigin('192.168.1.10:8444')).toEqual({
      ok: true,
      origin: 'https://192.168.1.10:8444',
    });
    expect(parseInstanceOrigin(' show.local ')).toEqual({ ok: true, origin: 'https://show.local' });
  });

  test('strips path, query, and fragment', () => {
    expect(parseInstanceOrigin('https://host:8444/controls/?x=1#y')).toEqual({
      ok: true,
      origin: 'https://host:8444',
    });
  });

  test('keeps an explicit http scheme', () => {
    expect(parseInstanceOrigin('http://127.0.0.1:3001')).toEqual({
      ok: true,
      origin: 'http://127.0.0.1:3001',
    });
  });

  test('rejects non-http schemes and garbage', () => {
    expect(parseInstanceOrigin('ws://host:8443')).toEqual({
      ok: false,
      error: 'Instance must be an http:// or https:// address',
    });
    expect(parseInstanceOrigin('file:///etc/passwd').ok).toBe(false);
    expect(parseInstanceOrigin('https://').ok).toBe(false);
  });
});

describe('parseInstanceToken', () => {
  test('blank is null, otherwise trimmed', () => {
    expect(parseInstanceToken('')).toBeNull();
    expect(parseInstanceToken('  ')).toBeNull();
    expect(parseInstanceToken(' s3cret ')).toBe('s3cret');
  });
});

describe('instanceLocationFor', () => {
  const page = {
    protocol: 'https:',
    hostname: 'localhost',
    port: '8444',
    host: 'localhost:8444',
    origin: 'https://localhost:8444',
    href: 'https://localhost:8444/controls/',
    pathname: '/controls/',
    search: '',
  };

  test('local target passes the real location through untouched', () => {
    expect(instanceLocationFor(LOCAL_INSTANCE, page)).toBe(page);
  });

  test('remote target yields a clean location at the instance root', () => {
    const loc = instanceLocationFor({ origin: 'https://192.168.1.10:8444', token: null }, page);
    expect(loc).toEqual({
      protocol: 'https:',
      hostname: '192.168.1.10',
      port: '8444',
      host: '192.168.1.10:8444',
      origin: 'https://192.168.1.10:8444',
      href: 'https://192.168.1.10:8444/',
      pathname: '/',
      search: '',
    });
  });

  test('feeds the existing URL helpers without changing them', () => {
    const loc = instanceLocationFor({ origin: 'https://192.168.1.10:8444', token: 's3cret' }, page);
    // Controls port still maps to its sibling projector port on the remote host.
    expect(bridgeWebSocketUrl(loc)).toBe('wss://192.168.1.10:8443/ws');
    expect(projectorPreviewUrl(loc)).toBe('https://192.168.1.10:8443/?embed=1');
    expect(withAccessToken(bridgeWebSocketUrl(loc), 's3cret')).toBe(
      'wss://192.168.1.10:8443/ws?token=s3cret',
    );
  });
});

describe('isRemoteInstance / describeInstanceTarget', () => {
  const page = { origin: 'https://localhost:8444' };

  test('a target equal to the page origin is not remote', () => {
    expect(isRemoteInstance(LOCAL_INSTANCE, page)).toBe(false);
    expect(isRemoteInstance({ origin: 'https://localhost:8444', token: null }, page)).toBe(false);
    expect(isRemoteInstance({ origin: 'https://192.168.1.10:8444', token: null }, page)).toBe(true);
  });

  test('describes the page origin when local', () => {
    expect(describeInstanceTarget(LOCAL_INSTANCE, page)).toBe('https://localhost:8444');
    expect(describeInstanceTarget({ origin: 'https://a:1', token: null }, page)).toBe(
      'https://a:1',
    );
  });
});

describe('saveInstanceTarget / loadInstanceTarget', () => {
  test('round-trips a stored target', () => {
    saveInstanceTarget({ origin: 'https://192.168.1.10:8444', token: 's3cret' }, storage);
    expect(loadInstanceTarget({ search: '' }, storage)).toEqual({
      origin: 'https://192.168.1.10:8444',
      token: 's3cret',
    });
  });

  test('a fully local target clears the key instead of storing nulls', () => {
    saveInstanceTarget({ origin: 'https://a:1', token: 't' }, storage);
    saveInstanceTarget(LOCAL_INSTANCE, storage);
    expect(storage.size()).toBe(0);
    expect(loadInstanceTarget({ search: '' }, storage)).toEqual(LOCAL_INSTANCE);
  });

  test('nothing stored means the page drives its own origin', () => {
    expect(loadInstanceTarget({ search: '' }, storage)).toEqual(LOCAL_INSTANCE);
  });

  test('URL params win and are persisted (printed-link onboarding)', () => {
    const target = loadInstanceTarget(
      { search: '?instance=192.168.1.10:8444&token=s3cret' },
      storage,
    );
    expect(target).toEqual({ origin: 'https://192.168.1.10:8444', token: 's3cret' });
    // Persisted, so a reload without the params keeps driving the same instance.
    expect(loadInstanceTarget({ search: '' }, storage)).toEqual(target);
  });

  test('a token-only URL keeps the stored origin (projector onboarding)', () => {
    saveInstanceTarget({ origin: 'https://192.168.1.10:8444', token: null }, storage);
    expect(loadInstanceTarget({ search: '?token=s3cret' }, storage)).toEqual({
      origin: 'https://192.168.1.10:8444',
      token: 's3cret',
    });
  });

  test('an invalid ?instance= falls back to the stored origin rather than wiping it', () => {
    saveInstanceTarget({ origin: 'https://192.168.1.10:8444', token: 's3cret' }, storage);
    expect(loadInstanceTarget({ search: '?instance=ws://nope' }, storage)).toEqual({
      origin: 'https://192.168.1.10:8444',
      token: 's3cret',
    });
  });

  test('corrupt storage degrades to local instead of throwing', () => {
    storage.setItem(INSTANCE_TARGET_KEY, '{not json');
    expect(loadInstanceTarget({ search: '' }, storage)).toEqual(LOCAL_INSTANCE);
  });

  test('a stored origin that no longer parses is dropped', () => {
    storage.setItem(INSTANCE_TARGET_KEY, JSON.stringify({ origin: 'ws://bad', token: 't' }));
    expect(loadInstanceTarget({ search: '' }, storage)).toEqual({ origin: null, token: 't' });
  });

  test('a null storage (private mode) is not fatal', () => {
    expect(() => saveInstanceTarget({ origin: 'https://a:1', token: null }, null)).not.toThrow();
    expect(loadInstanceTarget({ search: '' }, null)).toEqual(LOCAL_INSTANCE);
  });
});
