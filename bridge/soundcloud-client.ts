import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SOUNDCLOUD_API_ORIGIN = 'https://api.soundcloud.com';
const SOUNDCLOUD_AUTH_ORIGIN = 'https://secure.soundcloud.com';
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_SKEW_MS = 30 * 1000;

export type SoundCloudConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type SoundCloudTrackSource = 'likes' | 'mine' | 'following';

export type SoundCloudTrack = {
  id: number | string;
  urn: string | null;
  title: string;
  permalinkUrl: string;
  artworkUrl: string | null;
  duration: number;
  genre: string | null;
  playbackCount: number | null;
  likesCount: number | null;
  user: {
    username: string;
    permalinkUrl: string | null;
    avatarUrl: string | null;
  };
};

export type SoundCloudProfile = {
  id: number | string;
  urn: string | null;
  username: string;
  permalinkUrl: string | null;
  avatarUrl: string | null;
  followersCount: number | null;
  followingsCount: number | null;
  trackCount: number | null;
};

type SoundCloudToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string | null;
};

type PendingAuthorization = {
  verifier: string;
  expiresAt: number;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function soundCloudConfigFromEnv(
  env: Record<string, string | undefined>,
): SoundCloudConfig | null {
  const clientId = env.SOUNDCLOUD_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.SOUNDCLOUD_CLIENT_SECRET?.trim() ?? '';
  const redirectUri = env.SOUNDCLOUD_REDIRECT_URI?.trim() ?? '';
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const parsed = new URL(redirectUri);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function randomUrlSafe(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function createSoundCloudPkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = randomUrlSafe(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function normalizeSoundCloudTrack(value: unknown): SoundCloudTrack | null {
  const item = record(value);
  const user = record(item.user);
  const id = typeof item.id === 'number' || typeof item.id === 'string' ? item.id : null;
  const title = nullableString(item.title);
  const permalinkUrl = nullableString(item.permalink_url);
  if (id === null || !title || !permalinkUrl) return null;
  return {
    id,
    urn: nullableString(item.urn),
    title,
    permalinkUrl,
    artworkUrl: nullableString(item.artwork_url),
    duration: nullableNumber(item.duration) ?? 0,
    genre: nullableString(item.genre),
    playbackCount: nullableNumber(item.playback_count),
    likesCount: nullableNumber(item.likes_count),
    user: {
      username: nullableString(user.username) ?? 'Unknown artist',
      permalinkUrl: nullableString(user.permalink_url),
      avatarUrl: nullableString(user.avatar_url),
    },
  };
}

function normalizeProfile(value: unknown): SoundCloudProfile {
  const item = record(value);
  const id = typeof item.id === 'number' || typeof item.id === 'string' ? item.id : '';
  return {
    id,
    urn: nullableString(item.urn),
    username: nullableString(item.username) ?? 'SoundCloud user',
    permalinkUrl: nullableString(item.permalink_url),
    avatarUrl: nullableString(item.avatar_url),
    followersCount: nullableNumber(item.followers_count),
    followingsCount: nullableNumber(item.followings_count),
    trackCount: nullableNumber(item.track_count),
  };
}

function parseToken(value: unknown, now: number): SoundCloudToken {
  const token = record(value);
  const accessToken = nullableString(token.access_token);
  const refreshToken = nullableString(token.refresh_token);
  if (!accessToken || !refreshToken) throw new Error('SoundCloud returned an invalid token');
  const expiresIn = Math.max(1, nullableNumber(token.expires_in) ?? 3600);
  return {
    accessToken,
    refreshToken,
    expiresAt: now + expiresIn * 1000,
    scope: nullableString(token.scope),
  };
}

function apiError(status: number, payload: unknown): Error {
  const body = record(payload);
  const message = nullableString(body.message) ?? nullableString(body.error) ?? `HTTP ${status}`;
  return new Error(`SoundCloud: ${message}`);
}

const sourcePaths: Record<SoundCloudTrackSource, string> = {
  likes: '/me/likes/tracks',
  mine: '/me/tracks',
  following: '/me/followings/tracks',
};

export class SoundCloudClient {
  private token: SoundCloudToken | null = null;
  private profile: SoundCloudProfile | null = null;
  private readonly pending = new Map<string, PendingAuthorization>();

  constructor(
    private readonly config: SoundCloudConfig | null,
    private readonly options: {
      fetch?: FetchLike;
      sessionFile?: string | null;
      now?: () => number;
    } = {},
  ) {
    this.loadSession();
  }

  get configured(): boolean {
    return this.config !== null;
  }

  private get fetchImpl(): FetchLike {
    return this.options.fetch ?? fetch;
  }

  private get now(): number {
    return (this.options.now ?? Date.now)();
  }

  private loadSession(): void {
    const path = this.options.sessionFile;
    if (!path) return;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as SoundCloudToken;
      if (
        typeof parsed.accessToken === 'string' &&
        typeof parsed.refreshToken === 'string' &&
        typeof parsed.expiresAt === 'number'
      ) {
        this.token = parsed;
      }
    } catch {
      // Missing or invalid session files simply mean the account is disconnected.
    }
  }

  private persistSession(): void {
    const path = this.options.sessionFile;
    if (!path || !this.token) return;
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.token)}\n`, { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, path);
  }

  private clearSession(): void {
    this.token = null;
    this.profile = null;
    const path = this.options.sessionFile;
    if (!path) return;
    try {
      unlinkSync(path);
    } catch {
      // It is fine if no persisted session exists.
    }
  }

  private requireConfig(): SoundCloudConfig {
    if (!this.config) {
      throw new Error(
        'SoundCloud is not configured. Set SOUNDCLOUD_CLIENT_ID, SOUNDCLOUD_CLIENT_SECRET, and SOUNDCLOUD_REDIRECT_URI.',
      );
    }
    return this.config;
  }

  async createAuthorizationUrl(): Promise<string> {
    const config = this.requireConfig();
    const { verifier, challenge } = await createSoundCloudPkce();
    const state = randomUrlSafe(32);
    const cutoff = this.now;
    for (const [key, pending] of this.pending) {
      if (pending.expiresAt <= cutoff) this.pending.delete(key);
    }
    this.pending.set(state, { verifier, expiresAt: cutoff + STATE_TTL_MS });

    const url = new URL('/authorize', SOUNDCLOUD_AUTH_ORIGIN);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);
    return url.href;
  }

  async completeAuthorization(code: string, state: string): Promise<void> {
    const config = this.requireConfig();
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.expiresAt <= this.now) {
      throw new Error('SoundCloud authorization expired or has an invalid state');
    }
    const response = await this.fetchImpl(`${SOUNDCLOUD_AUTH_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: {
        accept: 'application/json; charset=utf-8',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code_verifier: pending.verifier,
        code,
      }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(response.status, payload);
    this.token = parseToken(payload, this.now);
    this.persistSession();
    this.profile = await this.fetchProfile();
  }

  private async refresh(): Promise<void> {
    const config = this.requireConfig();
    if (!this.token) throw new Error('SoundCloud account is not connected');
    const response = await this.fetchImpl(`${SOUNDCLOUD_AUTH_ORIGIN}/oauth/token`, {
      method: 'POST',
      headers: {
        accept: 'application/json; charset=utf-8',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: this.token.refreshToken,
      }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.clearSession();
      throw apiError(response.status, payload);
    }
    this.token = parseToken(payload, this.now);
    this.persistSession();
  }

  private async accessToken(): Promise<string> {
    if (!this.token) throw new Error('SoundCloud account is not connected');
    if (this.token.expiresAt - TOKEN_EXPIRY_SKEW_MS <= this.now) await this.refresh();
    if (!this.token) throw new Error('SoundCloud account is not connected');
    return this.token.accessToken;
  }

  private async api(path: string): Promise<unknown> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(new URL(path, SOUNDCLOUD_API_ORIGIN), {
      headers: {
        accept: 'application/json; charset=utf-8',
        authorization: `OAuth ${token}`,
      },
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(response.status, payload);
    return payload;
  }

  private async fetchProfile(): Promise<SoundCloudProfile> {
    return normalizeProfile(await this.api('/me'));
  }

  async status(): Promise<{
    configured: boolean;
    connected: boolean;
    profile: SoundCloudProfile | null;
  }> {
    if (!this.config) return { configured: false, connected: false, profile: null };
    if (!this.token) return { configured: true, connected: false, profile: null };
    try {
      this.profile ??= await this.fetchProfile();
      return { configured: true, connected: true, profile: this.profile };
    } catch {
      return { configured: true, connected: false, profile: null };
    }
  }

  async tracks(source: SoundCloudTrackSource): Promise<SoundCloudTrack[]> {
    const url = new URL(sourcePaths[source], SOUNDCLOUD_API_ORIGIN);
    url.searchParams.set('linked_partitioning', 'true');
    url.searchParams.set('limit', '50');
    const payload = record(await this.api(`${url.pathname}${url.search}`));
    const collection = Array.isArray(payload.collection)
      ? payload.collection
      : Array.isArray(payload)
        ? payload
        : [];
    return collection
      .map((item) => normalizeSoundCloudTrack(item))
      .filter((item): item is SoundCloudTrack => item !== null);
  }

  async disconnect(): Promise<void> {
    const token = this.token?.accessToken;
    this.clearSession();
    if (!token) return;
    await this.fetchImpl(`${SOUNDCLOUD_AUTH_ORIGIN}/sign-out`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: token }),
    }).catch(() => undefined);
  }
}
