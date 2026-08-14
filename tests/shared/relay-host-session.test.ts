import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  clearHostSession,
  ensureHostSession,
  type HostSession,
  isCodeExpired,
  loadGuestPaired,
  loadHostSession,
  markGuestPaired,
  RELAY_PAIRED_KEY,
  saveHostSession,
} from '../../shared/relay-session.ts';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const SESSION: HostSession = {
  relayBase: 'https://relay.example',
  sessionId: 'session-1',
  hostToken: 'host-token',
  code: 'ABCDEFGH',
  codeExpiresAt: 10_000,
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
});

describe('ensureHostSession', () => {
  test('adopts the stored session without touching the relay', async () => {
    saveHostSession(SESSION);
    const fetchImpl = vi.fn();
    const result = await ensureHostSession('https://relay.example', fetchImpl as never);
    expect(result).toEqual({ ok: true, value: SESSION });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('registers when this origin has no session — first surface open wins', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        protocolVersion: 1,
        sessionId: 'fresh',
        hostToken: 'fresh-token',
        code: 'JKMNPQRS',
        codeExpiresAt: 42,
      }),
    );
    const result = await ensureHostSession('https://relay.example', fetchImpl as never);
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Registration is persisted, so the other surface adopts it rather than
    // registering a second session against the same show.
    expect(loadHostSession()?.sessionId).toBe('fresh');
  });

  test('surfaces the relay error rather than inventing a session', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: 'relay down' }, { status: 503 }));
    const result = await ensureHostSession('https://relay.example', fetchImpl as never);
    expect(result).toEqual({ ok: false, error: 'relay down' });
    expect(loadHostSession()).toBeNull();
  });
});

describe('guest paired mark', () => {
  test('round-trips for the session it was written against', () => {
    markGuestPaired('session-1', 1234);
    expect(loadGuestPaired('session-1')).toEqual({ sessionId: 'session-1', pairedAt: 1234 });
  });

  test('a mark from an earlier session does not read as paired', () => {
    markGuestPaired('session-1', 1234);
    expect(loadGuestPaired('session-2')).toBeNull();
  });

  test('ignores a corrupt mark', () => {
    localStorage.setItem(RELAY_PAIRED_KEY, '{"sessionId":"session-1"}');
    expect(loadGuestPaired('session-1')).toBeNull();
  });

  test('an empty session id never matches', () => {
    markGuestPaired('', 1234);
    expect(loadGuestPaired('')).toBeNull();
  });
});

describe('clearHostSession', () => {
  test('drops the session and its paired mark so a restart is clean', () => {
    saveHostSession(SESSION);
    markGuestPaired(SESSION.sessionId, 1234);
    clearHostSession();
    expect(loadHostSession()).toBeNull();
    expect(loadGuestPaired(SESSION.sessionId)).toBeNull();
  });
});

describe('isCodeExpired', () => {
  test('compares against the relay-supplied expiry', () => {
    expect(isCodeExpired(SESSION, 9_999)).toBe(false);
    expect(isCodeExpired(SESSION, 10_000)).toBe(true);
    expect(isCodeExpired(SESSION, 10_001)).toBe(true);
  });

  test('a missing expiry is not treated as expired', () => {
    // Older stored sessions predate codeExpiresAt; refusing to show their code
    // would be worse than letting the relay reject it.
    expect(isCodeExpired({ ...SESSION, codeExpiresAt: 0 }, 10_000)).toBe(false);
  });
});
