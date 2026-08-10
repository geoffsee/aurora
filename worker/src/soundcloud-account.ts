const SOUNDCLOUD_API_ORIGIN = 'https://api.soundcloud.com';
const SOUNDCLOUD_AUTH_ORIGIN = 'https://secure.soundcloud.com';
const SESSION_KEY = 'session';
const CONSOLE_TOKEN_KEY = 'console-token';
const PENDING_PREFIX = 'oauth:';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_SKEW_MS = 30 * 1000;
const MAX_PENDING_AUTHORIZATIONS = 16;

export type SoundCloudAccountEnv = {
  SOUNDCLOUD_CLIENT_ID?: string;
  SOUNDCLOUD_CLIENT_SECRET?: string;
  SOUNDCLOUD_REDIRECT_URI?: string;
};

type OAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string | null;
};

type PendingAuthorization = {
  verifier: string;
  expiresAt: number;
};

type TrackSource = 'likes' | 'mine' | 'following';

type SoundCloudStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(keys: string | string[]): Promise<boolean>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
};

type SoundCloudObjectState = {
  storage: SoundCloudStorage;
};

const TRACK_PATHS: Record<TrackSource, string> = {
  likes: '/me/likes/tracks',
  mine: '/me/tracks',
  following: '/me/followings/tracks',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomBase64Url(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const challenge = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return { verifier, challenge };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseBearer(request: Request): string {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? '';
}

function parseSession(payload: unknown): OAuthSession {
  const body = record(payload);
  const accessToken = text(body.access_token);
  const refreshToken = text(body.refresh_token);
  if (!accessToken || !refreshToken) throw new Error('SoundCloud returned an invalid token');
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + Math.max(1, number(body.expires_in) ?? 3600) * 1000,
    scope: text(body.scope),
  };
}

function errorMessage(status: number, payload: unknown): string {
  const body = record(payload);
  return text(body.message) ?? text(body.error) ?? `SoundCloud request failed (${status})`;
}

function normalizeProfile(value: unknown) {
  const item = record(value);
  return {
    id: typeof item.id === 'number' || typeof item.id === 'string' ? item.id : '',
    username: text(item.username) ?? 'SoundCloud user',
    permalinkUrl: text(item.permalink_url),
    avatarUrl: text(item.avatar_url),
    followersCount: number(item.followers_count),
    followingsCount: number(item.followings_count),
    trackCount: number(item.track_count),
  };
}

function normalizeTrack(value: unknown) {
  const item = record(value);
  const user = record(item.user);
  const id = typeof item.id === 'number' || typeof item.id === 'string' ? item.id : null;
  const title = text(item.title);
  const permalinkUrl = text(item.permalink_url);
  if (id === null || !title || !permalinkUrl) return null;
  return {
    id,
    title,
    permalinkUrl,
    artworkUrl: text(item.artwork_url),
    duration: number(item.duration) ?? 0,
    genre: text(item.genre),
    playbackCount: number(item.playback_count),
    likesCount: number(item.likes_count),
    user: {
      username: text(user.username) ?? 'Unknown artist',
      permalinkUrl: text(user.permalink_url),
      avatarUrl: text(user.avatar_url),
    },
  };
}

async function jsonPayload(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

export class SoundCloudAccount {
  constructor(
    private readonly state: SoundCloudObjectState,
    private readonly env: SoundCloudAccountEnv,
  ) {}

  private configured(): boolean {
    return Boolean(
      this.env.SOUNDCLOUD_CLIENT_ID?.trim() &&
        this.env.SOUNDCLOUD_CLIENT_SECRET?.trim() &&
        this.env.SOUNDCLOUD_REDIRECT_URI?.trim(),
    );
  }

  private async authorized(request: Request): Promise<boolean> {
    const expected = (await this.state.storage.get<string>(CONSOLE_TOKEN_KEY)) ?? '';
    return timingSafeEqual(expected, parseBearer(request));
  }

  private async session(): Promise<OAuthSession | null> {
    return (await this.state.storage.get<OAuthSession>(SESSION_KEY)) ?? null;
  }

  private async token(): Promise<string> {
    let session = await this.session();
    if (!session) throw new Error('SoundCloud account is not connected');
    if (session.expiresAt - TOKEN_EXPIRY_SKEW_MS <= Date.now()) {
      session = await this.refresh(session.refreshToken);
    }
    return session.accessToken;
  }

  private async refresh(refreshToken: string): Promise<OAuthSession> {
    if (!this.configured()) throw new Error('SoundCloud Worker is not configured');
    const response = await fetch(`${SOUNDCLOUD_AUTH_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: {
        accept: 'application/json; charset=utf-8',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.env.SOUNDCLOUD_CLIENT_ID!.trim(),
        client_secret: this.env.SOUNDCLOUD_CLIENT_SECRET!.trim(),
        refresh_token: refreshToken,
      }),
    });
    const payload = await jsonPayload(response);
    if (!response.ok) {
      await this.state.storage.delete([SESSION_KEY, CONSOLE_TOKEN_KEY]);
      throw new Error(errorMessage(response.status, payload));
    }
    const session = parseSession(payload);
    await this.state.storage.put(SESSION_KEY, session);
    return session;
  }

  private async api(path: string): Promise<unknown> {
    const response = await fetch(new URL(path, SOUNDCLOUD_API_ORIGIN), {
      headers: {
        accept: 'application/json; charset=utf-8',
        authorization: `OAuth ${await this.token()}`,
      },
    });
    const payload = await jsonPayload(response);
    if (!response.ok) throw new Error(errorMessage(response.status, payload));
    return payload;
  }

  private async authorize(): Promise<Response> {
    if (!this.configured()) {
      return Response.json(
        { error: 'SoundCloud Worker secrets are not configured' },
        { status: 503 },
      );
    }
    const pending = await this.state.storage.list<PendingAuthorization>({ prefix: PENDING_PREFIX });
    const now = Date.now();
    const expired = [...pending.entries()]
      .filter(([, value]) => value.expiresAt <= now)
      .map(([key]) => key);
    if (expired.length > 0) await this.state.storage.delete(expired);
    if (pending.size - expired.length >= MAX_PENDING_AUTHORIZATIONS) {
      return Response.json({ error: 'Too many pending SoundCloud sign-ins' }, { status: 429 });
    }

    const { verifier, challenge } = await pkce();
    const oauthState = randomBase64Url(32);
    await this.state.storage.put<PendingAuthorization>(`${PENDING_PREFIX}${oauthState}`, {
      verifier,
      expiresAt: now + OAUTH_STATE_TTL_MS,
    });
    const url = new URL('/authorize', SOUNDCLOUD_AUTH_ORIGIN);
    url.searchParams.set('client_id', this.env.SOUNDCLOUD_CLIENT_ID!.trim());
    url.searchParams.set('redirect_uri', this.env.SOUNDCLOUD_REDIRECT_URI!.trim());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', oauthState);
    return Response.json({ ok: true, url: url.href });
  }

  private async callback(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as {
      code?: unknown;
      state?: unknown;
    };
    const code = typeof body.code === 'string' ? body.code : '';
    const oauthState = typeof body.state === 'string' ? body.state : '';
    const key = `${PENDING_PREFIX}${oauthState}`;
    const pending = oauthState
      ? await this.state.storage.get<PendingAuthorization>(key)
      : undefined;
    if (oauthState) await this.state.storage.delete(key);
    if (!code || !pending || pending.expiresAt <= Date.now()) {
      return Response.json(
        { error: 'SoundCloud authorization expired or has invalid state' },
        { status: 400 },
      );
    }

    const response = await fetch(`${SOUNDCLOUD_AUTH_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: {
        accept: 'application/json; charset=utf-8',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.env.SOUNDCLOUD_CLIENT_ID!.trim(),
        client_secret: this.env.SOUNDCLOUD_CLIENT_SECRET!.trim(),
        redirect_uri: this.env.SOUNDCLOUD_REDIRECT_URI!.trim(),
        code_verifier: pending.verifier,
        code,
      }),
    });
    const payload = await jsonPayload(response);
    if (!response.ok) {
      return Response.json({ error: errorMessage(response.status, payload) }, { status: 502 });
    }
    const session = parseSession(payload);
    const consoleToken = randomBase64Url(48);
    await this.state.storage.put({
      [SESSION_KEY]: session,
      [CONSOLE_TOKEN_KEY]: consoleToken,
    });
    return Response.json({ ok: true, consoleToken });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/authorize') return this.authorize();
    if (request.method === 'POST' && url.pathname === '/callback') return this.callback(request);

    if (!this.configured()) {
      return Response.json({ configured: false, connected: false, profile: null });
    }
    if (!(await this.authorized(request))) {
      const status = url.pathname === '/status' ? 200 : 401;
      return Response.json({ configured: true, connected: false, profile: null }, { status });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      const session = await this.session();
      if (!session) return Response.json({ configured: true, connected: false, profile: null });
      try {
        return Response.json({
          configured: true,
          connected: true,
          profile: normalizeProfile(await this.api('/me')),
        });
      } catch {
        return Response.json({ configured: true, connected: false, profile: null });
      }
    }

    if (request.method === 'GET' && url.pathname === '/tracks') {
      const source = url.searchParams.get('source') ?? 'likes';
      if (!Object.hasOwn(TRACK_PATHS, source)) {
        return Response.json({ error: 'Invalid track source' }, { status: 400 });
      }
      const apiUrl = new URL(TRACK_PATHS[source as TrackSource], SOUNDCLOUD_API_ORIGIN);
      apiUrl.searchParams.set('linked_partitioning', 'true');
      apiUrl.searchParams.set('limit', '50');
      const payload = record(await this.api(`${apiUrl.pathname}${apiUrl.search}`));
      const collection = Array.isArray(payload.collection) ? payload.collection : [];
      return Response.json({
        ok: true,
        source,
        tracks: collection.map(normalizeTrack).filter((track) => track !== null),
      });
    }

    if (request.method === 'POST' && url.pathname === '/logout') {
      const session = await this.session();
      await this.state.storage.delete([SESSION_KEY, CONSOLE_TOKEN_KEY]);
      if (session) {
        await fetch(`${SOUNDCLOUD_AUTH_ORIGIN}/sign-out`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ access_token: session.accessToken }),
        }).catch(() => undefined);
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
