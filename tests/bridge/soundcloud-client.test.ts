import { describe, expect, test, vi } from 'vitest';
import {
  createSoundCloudPkce,
  normalizeSoundCloudTrack,
  SoundCloudClient,
  soundCloudConfigFromEnv,
} from '../../bridge/soundcloud-client.ts';
import {
  formatSoundCloudDuration,
  soundCloudWidgetUrl,
} from '../../web/controls/lib/soundcloud.ts';

describe('SoundCloud configuration and PKCE', () => {
  test('requires all three server-side OAuth settings', () => {
    expect(soundCloudConfigFromEnv({ SOUNDCLOUD_CLIENT_ID: 'id' })).toBeNull();
    expect(
      soundCloudConfigFromEnv({
        SOUNDCLOUD_CLIENT_ID: ' id ',
        SOUNDCLOUD_CLIENT_SECRET: ' secret ',
        SOUNDCLOUD_REDIRECT_URI: ' https://localhost:8444/api/soundcloud/callback ',
      }),
    ).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://localhost:8444/api/soundcloud/callback',
    });
  });

  test('creates an S256-compatible verifier and challenge', async () => {
    const pair = await createSoundCloudPkce();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.challenge).not.toBe(pair.verifier);
  });
});

describe('SoundCloud account client', () => {
  test('exchanges an authorization code, keeps secrets server-side, and loads likes', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/oauth/token')) {
        const body = init?.body as URLSearchParams;
        expect(body.get('client_secret')).toBe('secret');
        expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
        return Response.json({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          scope: '*',
        });
      }
      expect(new Headers(init?.headers).get('authorization')).toBe('OAuth access');
      if (url.endsWith('/me')) {
        return Response.json({
          id: 7,
          username: 'Geoff',
          permalink_url: 'https://soundcloud.com/geoff',
        });
      }
      if (url.includes('/me/likes/tracks')) {
        return Response.json({
          collection: [
            {
              id: 12,
              urn: 'soundcloud:tracks:12',
              title: 'Night Drive',
              permalink_url: 'https://soundcloud.com/geoff/night-drive',
              duration: 185000,
              user: { username: 'Geoff' },
            },
          ],
        });
      }
      return Response.json({}, { status: 404 });
    });
    const client = new SoundCloudClient(
      {
        clientId: 'client',
        clientSecret: 'secret',
        redirectUri: 'https://localhost:8444/api/soundcloud/callback',
      },
      { fetch: fetchMock, now: () => 1_000 },
    );

    const authorizeUrl = new URL(await client.createAuthorizationUrl());
    expect(authorizeUrl.origin).toBe('https://secure.soundcloud.com');
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.has('client_secret')).toBe(false);

    await client.completeAuthorization(
      'authorization-code',
      authorizeUrl.searchParams.get('state')!,
    );
    expect(await client.status()).toMatchObject({
      configured: true,
      connected: true,
      profile: { username: 'Geoff' },
    });
    expect(await client.tracks('likes')).toMatchObject([
      { id: 12, title: 'Night Drive', user: { username: 'Geoff' } },
    ]);
  });
});

describe('SoundCloud presentation helpers', () => {
  test('normalizes API tracks and rejects incomplete resources', () => {
    expect(normalizeSoundCloudTrack({ id: 1, title: 'Missing URL' })).toBeNull();
    expect(
      normalizeSoundCloudTrack({
        id: 1,
        title: 'Track',
        permalink_url: 'https://soundcloud.com/artist/track',
        user: { username: 'Artist' },
      }),
    ).toMatchObject({ title: 'Track', user: { username: 'Artist' } });
  });

  test('builds widget URLs only for HTTPS SoundCloud permalinks', () => {
    expect(soundCloudWidgetUrl('https://evil.example/track')).toBeNull();
    expect(soundCloudWidgetUrl('javascript:alert(1)')).toBeNull();
    const widget = new URL(soundCloudWidgetUrl('https://soundcloud.com/artist/track')!);
    expect(widget.origin).toBe('https://w.soundcloud.com');
    expect(widget.searchParams.get('url')).toBe('https://soundcloud.com/artist/track');
    expect(widget.searchParams.get('auto_play')).toBe('true');
  });

  test('formats track duration', () => {
    expect(formatSoundCloudDuration(185_000)).toBe('3:05');
  });
});
