import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  consumeSoundCloudCallback,
  loadSoundCloudWorkerToken,
  SOUNDCLOUD_WORKER_TOKEN_KEY,
  soundCloudApiBase,
} from '../../web/controls/lib/soundcloud.ts';
import { SoundCloudAccount } from '../../worker/src/soundcloud-account.ts';

class MemoryStorage {
  readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(keyOrEntries: string | Record<string, T>, value?: T): Promise<void> {
    if (typeof keyOrEntries === 'string') {
      this.values.set(keyOrEntries, value);
      return;
    }
    for (const [key, entry] of Object.entries(keyOrEntries)) this.values.set(key, entry);
  }

  async delete(keys: string | string[]): Promise<boolean> {
    const list = Array.isArray(keys) ? keys : [keys];
    let deleted = false;
    for (const key of list) deleted = this.values.delete(key) || deleted;
    return deleted;
  }

  async list<T>({ prefix = '' }: { prefix?: string } = {}): Promise<Map<string, T>> {
    return new Map(
      [...this.values.entries()].filter(([key]) => key.startsWith(prefix)) as [string, T][],
    );
  }
}

function account(storage: MemoryStorage) {
  return new SoundCloudAccount({ storage } as never, {
    SOUNDCLOUD_CLIENT_ID: 'client-id',
    SOUNDCLOUD_CLIENT_SECRET: 'client-secret',
    SOUNDCLOUD_REDIRECT_URI: 'https://worker.example/api/soundcloud/callback',
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('SoundCloudAccount Durable Object', () => {
  test('persists OAuth tokens and protects account data with a separate Console token', async () => {
    const storage = new MemoryStorage();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/oauth/token')) {
        const body = init?.body as URLSearchParams;
        expect(body.get('client_secret')).toBe('client-secret');
        expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
        return Response.json({
          access_token: 'soundcloud-access',
          refresh_token: 'soundcloud-refresh',
          expires_in: 3600,
        });
      }
      if (url.endsWith('/me')) {
        expect(new Headers(init?.headers).get('authorization')).toBe('OAuth soundcloud-access');
        return Response.json({ id: 1, username: 'Aurora DJ' });
      }
      if (url.includes('/me/likes/tracks')) {
        return Response.json({
          collection: [
            {
              id: 2,
              title: 'Warehouse',
              permalink_url: 'https://soundcloud.com/aurora/warehouse',
              duration: 180000,
              user: { username: 'Aurora DJ' },
            },
          ],
        });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = account(storage);
    const authorize = await first.fetch(
      new Request('https://account/authorize', { method: 'POST' }),
    );
    const authorizeBody = (await authorize.json()) as { url: string };
    const authorizeUrl = new URL(authorizeBody.url);
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.has('client_secret')).toBe(false);

    const callback = await first.fetch(
      new Request('https://account/callback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'authorization-code',
          state: authorizeUrl.searchParams.get('state'),
        }),
      }),
    );
    const { consoleToken } = (await callback.json()) as { consoleToken: string };
    expect(consoleToken).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(consoleToken).not.toBe('soundcloud-access');

    const rehydrated = account(storage);
    const unauthorized = await rehydrated.fetch(new Request('https://account/tracks?source=likes'));
    expect(unauthorized.status).toBe(401);

    const headers = { authorization: `Bearer ${consoleToken}` };
    const status = await rehydrated.fetch(new Request('https://account/status', { headers }));
    expect(await status.json()).toMatchObject({
      configured: true,
      connected: true,
      profile: { username: 'Aurora DJ' },
    });
    const tracks = await rehydrated.fetch(
      new Request('https://account/tracks?source=likes', { headers }),
    );
    expect(await tracks.json()).toMatchObject({
      tracks: [{ title: 'Warehouse', user: { username: 'Aurora DJ' } }],
    });
  });
});

describe('Pages SoundCloud bootstrap', () => {
  test('reads the Worker origin from the deployed meta tag', () => {
    const doc = {
      querySelector: () => ({ content: 'https://aurora-relay.example.workers.dev/path' }),
    } as unknown as Pick<Document, 'querySelector'>;
    expect(soundCloudApiBase(doc, { origin: 'https://geoffsee.github.io' })).toBe(
      'https://aurora-relay.example.workers.dev',
    );
  });

  test('stores the fragment token and removes OAuth values from the visible URL', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    let replacement = '';
    const result = consumeSoundCloudCallback(
      {
        hash: '#soundcloud=connected&soundcloud_token=console-token&keep=yes',
        pathname: '/aurora/controls/',
        search: '',
      },
      storage,
      (url) => {
        replacement = url;
      },
    );
    expect(result).toEqual({ token: 'console-token', error: null });
    expect(loadSoundCloudWorkerToken(storage)).toBe('console-token');
    expect(values.get(SOUNDCLOUD_WORKER_TOKEN_KEY)).toBe('console-token');
    expect(replacement).toBe('/aurora/controls/#keep=yes');
  });
});
