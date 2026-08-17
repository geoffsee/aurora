/**
 * aurora relay Worker.
 *
 * Pairs a projector (host) with control surfaces (guests) for the GitHub Pages
 * deployment, where there is no local bridge and no LAN certificate to trust.
 * Both ends load over a public CA and meet here.
 *
 * The relay brokers opaque payloads. It authenticates sockets and forwards
 * bytes; it does not parse control state, so nothing about the show schema is
 * knowable here — or needs redeploying when that schema changes.
 */

import {
  bearerToken,
  clampShowDuration,
  type HostShowSession,
  isShowAccess,
  isShowRuntime,
  LIVE_SHOW_MAX_PACKAGE_ARCHIVE_BYTES,
  LIVE_SHOW_PATHS,
  LIVE_SHOW_PROTOCOL_VERSION,
  normalizeShowCode,
  normalizeShowName,
  type PublicShowSummary,
  type ShowRegistration,
  showSocketUrl,
  type ViewerGrant,
} from '../../shared/live-show.ts';
import {
  generatePairingCode,
  generateSessionToken,
  isValidPairingCode,
  normalizePairingCode,
  PAIRING_CODE_TTL_MS,
} from '../../shared/pairing-code.ts';
import {
  RELAY_PATHS,
  RELAY_PROTOCOL_VERSION,
  type RegisterSessionResponse,
} from '../../shared/relay-protocol.ts';
import { PairingCode } from './pairing-code-do.ts';
import { ShowDirectory } from './show-directory.ts';
import { ShowSession } from './show-session.ts';
import { SoundCloudAccount, type SoundCloudAccountEnv } from './soundcloud-account.ts';

export { PairingCode, ShowDirectory, ShowSession, SoundCloudAccount };

export type Env = SoundCloudAccountEnv & {
  SHOW_SESSION: DurableObjectNamespace;
  SHOW_DIRECTORY: DurableObjectNamespace;
  PAIRING_CODE: DurableObjectNamespace;
  SOUNDCLOUD_ACCOUNT: DurableObjectNamespace;
  SOUNDCLOUD_CONSOLE_URL?: string;
  SOUNDCLOUD_ALLOWED_ORIGIN?: string;
  LIVE_SHOW_ASSETS: R2Bucket;
  VIEWER_ASSETS?: Fetcher;
  VIEWER_BASE_URL?: string;
};

const SOUNDCLOUD_API_PREFIX = '/api/soundcloud';

function liveLog(event: string, detail: Record<string, unknown>): void {
  console.log(JSON.stringify({ scope: 'live-show', event, ...detail }));
}

/**
 * Open CORS: authentication is by bearer-style token in the request, never a
 * cookie, so there is no ambient authority for another origin to borrow. This
 * also lets a fork on its own Pages domain use a shared relay.
 */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '600',
};

function json(body: unknown, init?: ResponseInit): Response {
  const response = Response.json(body, init);
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  return response;
}

function soundCloudCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const allowed = env.SOUNDCLOUD_ALLOWED_ORIGIN?.trim() ?? '';
  if (!origin || !allowed || origin !== allowed) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function withSoundCloudCors(request: Request, env: Env, response: Response): Response {
  // Responses returned by a Durable Object can have an immutable header guard
  // in production. Clone before adding the browser-facing CORS policy.
  const corsResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(soundCloudCorsHeaders(request, env))) {
    corsResponse.headers.set(key, value);
  }
  return corsResponse;
}

/** Read a JSON body, treating malformed input as absent fields. */
async function readJson<T extends object>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json<T>()) ?? {};
  } catch {
    return {};
  }
}

function sessionStub(env: Env, sessionId: string) {
  return env.SHOW_SESSION.get(env.SHOW_SESSION.idFromName(sessionId));
}

function codeStub(env: Env, code: string) {
  return env.PAIRING_CODE.get(env.PAIRING_CODE.idFromName(code));
}

function soundCloudStub(env: Env) {
  return env.SOUNDCLOUD_ACCOUNT.get(env.SOUNDCLOUD_ACCOUNT.idFromName('primary'));
}

function directoryStub(env: Env) {
  return env.SHOW_DIRECTORY.get(env.SHOW_DIRECTORY.idFromName('global'));
}

function randomAudienceCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function normalizedPublicBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '[::1]' ||
      hostname.startsWith('[fc') ||
      hostname.startsWith('[fd') ||
      hostname.startsWith('[fe8')
    ) {
      return null;
    }
    const octets = hostname.split('.').map(Number);
    if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0)) {
      const [first = 0, second = 0] = octets;
      if (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        first >= 224 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
      ) {
        return null;
      }
    }
    return url.origin;
  } catch {
    return null;
  }
}

function sourceIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

async function sourceIpHash(request: Request): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceIp(request))),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function liveViewerBase(request: Request, env: Env): string {
  const configured = env.VIEWER_BASE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).href;
    } catch {
      /* fall through */
    }
  }
  return new URL(LIVE_SHOW_PATHS.viewer, request.url).href;
}

async function manageShowRequest(
  env: Env,
  showId: string,
  hostToken: string,
  path: '/manage' | '/stop' | '/rotate-code',
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return sessionStub(env, showId).fetch(`https://relay${path}`, {
    method: 'POST',
    body: JSON.stringify({ hostToken, ...extra }),
  });
}

function soundCloudConsoleRedirect(env: Env, values: Record<string, string>): Response {
  const configured = env.SOUNDCLOUD_CONSOLE_URL?.trim() ?? '';
  let destination: URL;
  try {
    destination = new URL(configured);
  } catch {
    return Response.json(
      { error: 'SOUNDCLOUD_CONSOLE_URL is not configured on the Worker' },
      { status: 503 },
    );
  }
  destination.hash = new URLSearchParams(values).toString();
  return Response.redirect(destination.href, 302);
}

/** Claim an unused code slot, retrying on the (vanishingly rare) live collision. */
async function claimFreshCode(
  env: Env,
  sessionId: string,
): Promise<{ code: string; codeExpiresAt: number }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePairingCode();
    const res = await codeStub(env, code).fetch('https://relay/claim', {
      method: 'POST',
      body: JSON.stringify({ sessionId, ttlMs: PAIRING_CODE_TTL_MS }),
    });
    if (res.ok) {
      const { expiresAt } = await res.json<{ expiresAt: number }>();
      return { code, codeExpiresAt: expiresAt };
    }
    if (res.status !== 409) throw new Error(`code claim failed (${res.status})`);
  }
  throw new Error('could not allocate a pairing code');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (url.pathname.startsWith(SOUNDCLOUD_API_PREFIX)) {
        const headers = soundCloudCorsHeaders(request, env);
        if (!headers['access-control-allow-origin']) {
          return new Response(null, { status: 403 });
        }
        return new Response(null, { status: 204, headers });
      }
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // --- Personal SoundCloud account for the static GitHub Pages Console ---
    if (request.method === 'GET' && url.pathname === `${SOUNDCLOUD_API_PREFIX}/callback`) {
      const oauthError = url.searchParams.get('error');
      if (oauthError) {
        return soundCloudConsoleRedirect(env, {
          soundcloud_error: `SoundCloud authorization was denied: ${oauthError}`,
        });
      }
      const code = url.searchParams.get('code') ?? '';
      const state = url.searchParams.get('state') ?? '';
      let result: Response;
      try {
        result = await soundCloudStub(env).fetch('https://soundcloud/callback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });
      } catch {
        return soundCloudConsoleRedirect(env, {
          soundcloud_error: 'SoundCloud token exchange is temporarily unavailable',
        });
      }
      const payload = await result
        .json<{ consoleToken?: string; error?: string }>()
        .catch((): { consoleToken?: string; error?: string } => ({}));
      if (!result.ok || !payload.consoleToken) {
        return soundCloudConsoleRedirect(env, {
          soundcloud_error: payload.error ?? 'SoundCloud authorization failed',
        });
      }
      return soundCloudConsoleRedirect(env, {
        soundcloud: 'connected',
        soundcloud_token: payload.consoleToken,
      });
    }

    if (url.pathname.startsWith(`${SOUNDCLOUD_API_PREFIX}/`)) {
      let internalPath: string | null = null;
      let method = request.method;
      if (request.method === 'GET' && url.pathname === `${SOUNDCLOUD_API_PREFIX}/login`) {
        internalPath = '/authorize';
        method = 'POST';
      } else if (request.method === 'GET' && url.pathname === `${SOUNDCLOUD_API_PREFIX}/status`) {
        internalPath = '/status';
      } else if (request.method === 'GET' && url.pathname === `${SOUNDCLOUD_API_PREFIX}/tracks`) {
        internalPath = `/tracks${url.search}`;
      } else if (request.method === 'POST' && url.pathname === `${SOUNDCLOUD_API_PREFIX}/logout`) {
        internalPath = '/logout';
      }
      if (!internalPath) {
        return withSoundCloudCors(
          request,
          env,
          Response.json({ error: 'not found' }, { status: 404 }),
        );
      }
      const headers = new Headers();
      const authorization = request.headers.get('authorization');
      if (authorization) headers.set('authorization', authorization);
      try {
        const response = await soundCloudStub(env).fetch(`https://soundcloud${internalPath}`, {
          method,
          headers,
        });
        return withSoundCloudCors(request, env, response);
      } catch {
        return withSoundCloudCors(
          request,
          env,
          Response.json(
            { error: 'SoundCloud service is temporarily unavailable' },
            { status: 502 },
          ),
        );
      }
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, protocolVersion: RELAY_PROTOCOL_VERSION });
    }

    // --- Public, active-only live-show directory ---
    if (request.method === 'GET' && url.pathname === LIVE_SHOW_PATHS.shows) {
      const target = new URL('https://directory/shows');
      target.search = url.search;
      const response = await directoryStub(env).fetch(target);
      return json(await response.json(), { status: response.status });
    }

    // Tunnel publishers first obtain a short-lived challenge. Their read-only
    // gateway must expose it verbatim before show creation can succeed.
    if (request.method === 'POST' && url.pathname === LIVE_SHOW_PATHS.registrations) {
      const body = await readJson<{ publicUrl: string }>(request);
      const publicBaseUrl = normalizedPublicBaseUrl(body.publicUrl);
      if (!publicBaseUrl)
        return json({ error: 'publicUrl must be an HTTPS origin' }, { status: 400 });
      const registrationId = crypto.randomUUID();
      const challenge = generateSessionToken();
      const ipHash = await sourceIpHash(request);
      const response = await directoryStub(env).fetch('https://directory/registrations', {
        method: 'POST',
        body: JSON.stringify({ registrationId, challenge, publicBaseUrl, sourceIpHash: ipHash }),
      });
      const record = await response.json<ShowRegistration & { publicBaseUrl: string }>();
      return json({
        registrationId,
        challenge,
        expiresAt: record.expiresAt,
        wellKnownUrl: `${publicBaseUrl}/.well-known/aurora-live-show`,
      } satisfies ShowRegistration);
    }

    if (request.method === 'POST' && url.pathname === LIVE_SHOW_PATHS.shows) {
      const body = await readJson<{
        name: string;
        access: string;
        durationMs: number;
        runtime: string;
        publicUrl: string;
        registrationId: string;
        relaySessionId: string;
        relayHostToken: string;
      }>(request);
      const name = normalizeShowName(body.name);
      if (!name) return json({ error: 'show name is required' }, { status: 400 });
      if (!isShowAccess(body.access))
        return json({ error: 'access must be open or closed' }, { status: 400 });
      if (!isShowRuntime(body.runtime))
        return json({ error: 'invalid show runtime' }, { status: 400 });

      const ipHash = await sourceIpHash(request);
      const rate = await directoryStub(env).fetch('https://directory/rate/create', {
        method: 'POST',
        body: JSON.stringify({ sourceIpHash: ipHash, runtime: body.runtime }),
      });
      if (!rate.ok) return json(await rate.json(), { status: rate.status });

      let publicBaseUrl: string | undefined;
      let proof: string | undefined;
      if (body.runtime === 'pages') {
        const relaySessionId = typeof body.relaySessionId === 'string' ? body.relaySessionId : '';
        const relayHostToken = typeof body.relayHostToken === 'string' ? body.relayHostToken : '';
        if (!relaySessionId || !relayHostToken)
          return json({ error: 'a connected Pages relay host is required' }, { status: 400 });
        const verified = await sessionStub(env, relaySessionId).fetch('https://relay/verify-host', {
          method: 'POST',
          body: JSON.stringify({ hostToken: relayHostToken }),
        });
        const result = await verified.json<{ ok?: boolean; connected?: boolean }>();
        if (!result.ok || !result.connected)
          return json({ error: 'Pages projector relay host is not connected' }, { status: 409 });
      } else {
        const registrationId = typeof body.registrationId === 'string' ? body.registrationId : '';
        const publicUrl = normalizedPublicBaseUrl(body.publicUrl);
        if (!registrationId || !publicUrl)
          return json({ error: 'tunnel verification is required' }, { status: 400 });
        const registrationResponse = await directoryStub(env).fetch(
          `https://directory/registrations/${encodeURIComponent(registrationId)}`,
        );
        if (!registrationResponse.ok)
          return json(await registrationResponse.json(), { status: registrationResponse.status });
        const registration = await registrationResponse.json<{
          challenge: string;
          publicBaseUrl: string;
          sourceIpHash: string;
        }>();
        if (registration.publicBaseUrl !== publicUrl || registration.sourceIpHash !== ipHash)
          return json({ error: 'registration does not match this origin' }, { status: 403 });
        let verification: Response;
        try {
          verification = await fetch(`${publicUrl}/.well-known/aurora-live-show`, {
            redirect: 'manual',
            headers: { 'cache-control': 'no-cache' },
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          return json({ error: 'public origin could not be reached' }, { status: 400 });
        }
        if (verification.status !== 200 || (await verification.text()) !== registration.challenge) {
          return json({ error: 'public origin proof did not match' }, { status: 400 });
        }
        publicBaseUrl = publicUrl;
        proof = registration.challenge;
        await directoryStub(env).fetch(
          `https://directory/registrations/${encodeURIComponent(registrationId)}`,
          { method: 'DELETE' },
        );
      }

      const now = Date.now();
      const endsAt = now + clampShowDuration(body.durationMs);
      const showId = crypto.randomUUID();
      const reservation = await directoryStub(env).fetch('https://directory/reserve-show', {
        method: 'POST',
        body: JSON.stringify({
          id: showId,
          runtime: body.runtime,
          sourceIpHash: ipHash,
          endsAt,
          publicBaseUrl,
        }),
      });
      if (!reservation.ok) return json(await reservation.json(), { status: reservation.status });
      const code = body.access === 'closed' ? randomAudienceCode() : undefined;
      const initialized = await sessionStub(env, showId).fetch('https://relay/init-live', {
        method: 'POST',
        body: JSON.stringify({
          id: showId,
          name,
          access: body.access,
          runtime: body.runtime,
          startedAt: now,
          endsAt,
          code,
          publicBaseUrl,
          proof,
          sourceIpHash: ipHash,
        }),
      });
      if (!initialized.ok) {
        await directoryStub(env).fetch(`https://directory/shows/${encodeURIComponent(showId)}`, {
          method: 'DELETE',
        });
        return json({ error: 'could not create show' }, { status: 503 });
      }
      const created = await initialized.json<{
        hostToken: string;
        sourceToken: string;
        summary: PublicShowSummary;
      }>();
      const session: HostShowSession = {
        protocolVersion: LIVE_SHOW_PROTOCOL_VERSION,
        show: created.summary,
        hostToken: created.hostToken,
        sourceToken: created.sourceToken,
        ...(code ? { code } : {}),
        liveApiUrl: url.origin,
      };
      liveLog('created', {
        showId,
        runtime: body.runtime,
        access: body.access,
        durationMs: endsAt - now,
      });
      return json(session, { status: 201 });
    }

    const showRoute = /^\/api\/shows\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
    if (showRoute) {
      const showId = decodeURIComponent(showRoute[1] ?? '');
      const suffix = showRoute[2] ?? '';
      const stub = sessionStub(env, showId);

      if (request.method === 'GET' && suffix === 'manage') {
        const response = await manageShowRequest(
          env,
          showId,
          bearerToken(request.headers),
          '/manage',
        );
        return json(await response.json(), { status: response.status });
      }

      if (request.method === 'POST' && suffix === 'join') {
        const body = await readJson<{ code: string }>(request);
        const normalizedCode = normalizeShowCode(body.code);
        const response = await stub.fetch('https://relay/join', {
          method: 'POST',
          body: JSON.stringify({ code: normalizedCode }),
        });
        const ipHash = await sourceIpHash(request);
        if (response.status === 401) {
          const failure = await directoryStub(env).fetch('https://directory/rate/code', {
            method: 'POST',
            body: JSON.stringify({ showId, sourceIpHash: ipHash }),
          });
          if (!failure.ok) return json(await failure.json(), { status: failure.status });
          return json({ error: 'incorrect code' }, { status: 401 });
        }
        if (!response.ok) return json(await response.json(), { status: response.status });
        await directoryStub(env).fetch('https://directory/rate/code', {
          method: 'POST',
          body: JSON.stringify({ showId, sourceIpHash: ipHash, success: true }),
        });
        const joined = await response.json<{
          viewerToken: string;
          expiresAt: number;
          summary: PublicShowSummary;
          publicBaseUrl?: string;
        }>();
        liveLog('join_granted', {
          showId,
          runtime: joined.summary.runtime,
          viewerCount: joined.summary.viewerCount,
        });
        const socketUrl = showSocketUrl(url.origin, showId, joined.viewerToken, 'viewer');
        const viewer = new URL(
          joined.summary.runtime === 'pages' || !joined.publicBaseUrl
            ? liveViewerBase(request, env)
            : joined.publicBaseUrl,
        );
        viewer.hash = new URLSearchParams({
          show: showId,
          grant: joined.viewerToken,
          api: url.origin,
          expires: String(joined.expiresAt),
        }).toString();
        return json({
          protocolVersion: LIVE_SHOW_PROTOCOL_VERSION,
          show: joined.summary,
          viewerToken: joined.viewerToken,
          expiresAt: joined.expiresAt,
          socketUrl,
          viewerUrl: viewer.href,
        } satisfies ViewerGrant);
      }

      if (request.method === 'POST' && suffix === 'code/rotate') {
        const code = randomAudienceCode();
        const response = await manageShowRequest(
          env,
          showId,
          bearerToken(request.headers),
          '/rotate-code',
          { code },
        );
        if (!response.ok) return json(await response.json(), { status: response.status });
        liveLog('code_rotated', { showId });
        return json({ code });
      }

      if (request.method === 'DELETE' && suffix === '') {
        const response = await manageShowRequest(
          env,
          showId,
          bearerToken(request.headers),
          '/stop',
        );
        if (response.ok) liveLog('stopped', { showId });
        return json(await response.json(), { status: response.status });
      }

      const packageRoute = /^packages\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(suffix);
      if (packageRoute) {
        const slug = packageRoute[1] as string;
        const key = `${showId}/${slug}.aurora-package`;
        if (request.method === 'PUT') {
          const hostToken = bearerToken(request.headers);
          const bytes = new Uint8Array(await request.arrayBuffer());
          if (bytes.byteLength === 0 || bytes.byteLength > LIVE_SHOW_MAX_PACKAGE_ARCHIVE_BYTES)
            return json({ error: 'invalid package size' }, { status: 413 });
          const reserved = await stub.fetch('https://relay/package-reserve', {
            method: 'POST',
            body: JSON.stringify({ hostToken, slug, bytes: bytes.byteLength }),
          });
          if (!reserved.ok) return json(await reserved.json(), { status: reserved.status });
          const { removed } = await reserved.json<{ removed: string[] }>();
          await env.LIVE_SHOW_ASSETS.put(key, bytes, {
            httpMetadata: { contentType: 'application/zip', cacheControl: 'private, no-store' },
          });
          if (removed.length > 0)
            await env.LIVE_SHOW_ASSETS.delete(
              removed.map((value) => `${showId}/${value}.aurora-package`),
            );
          liveLog('package_uploaded', {
            showId,
            slug,
            bytes: bytes.byteLength,
            removed: removed.length,
          });
          return json({ ok: true, slug, bytes: bytes.byteLength });
        }
        if (request.method === 'GET') {
          const token = bearerToken(request.headers) || url.searchParams.get('token') || '';
          const verified = await stub.fetch('https://relay/verify-package-viewer', {
            method: 'POST',
            body: JSON.stringify({ token, slug }),
          });
          const { ok } = await verified.json<{ ok?: boolean }>();
          if (!ok) return json({ error: 'unauthorized' }, { status: 401 });
          const object = await env.LIVE_SHOW_ASSETS.get(key);
          if (!object) return json({ error: 'package not found' }, { status: 404 });
          return new Response(object.body, {
            headers: {
              'content-type': object.httpMetadata?.contentType ?? 'application/zip',
              'cache-control': 'private, no-store',
              ...CORS_HEADERS,
            },
          });
        }
      }
    }

    // Isolated audience renderer. It has a distinct Worker origin so trusted
    // Three.js packages cannot read Console/projector storage or credentials.
    if (request.method === 'GET' && url.pathname.startsWith('/viewer/') && env.VIEWER_ASSETS) {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = `/${url.pathname.slice('/viewer/'.length)}`;
      if (assetUrl.pathname === '/') assetUrl.pathname = '/index.html';
      return env.VIEWER_ASSETS.fetch(new Request(assetUrl, request));
    }

    // --- Projector registers, gets its host token and first pairing code ---
    if (request.method === 'POST' && url.pathname === RELAY_PATHS.register) {
      const sessionId = crypto.randomUUID();
      const initRes = await sessionStub(env, sessionId).fetch('https://relay/init', {
        method: 'POST',
      });
      if (!initRes.ok) return json({ error: 'could not create session' }, { status: 500 });
      const { hostToken } = await initRes.json<{ hostToken: string }>();

      try {
        const { code, codeExpiresAt } = await claimFreshCode(env, sessionId);
        const body: RegisterSessionResponse = {
          protocolVersion: RELAY_PROTOCOL_VERSION,
          sessionId,
          hostToken,
          code,
          codeExpiresAt,
        };
        return json(body);
      } catch {
        return json({ error: 'could not allocate a pairing code' }, { status: 503 });
      }
    }

    // --- Host rotates its code (expired, or shown to the wrong room) ---
    if (request.method === 'POST' && url.pathname === RELAY_PATHS.rotateCode) {
      const body = await readJson<{ sessionId: string; hostToken: string }>(request);
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
      const hostToken = typeof body.hostToken === 'string' ? body.hostToken : '';
      if (!sessionId || !hostToken) return json({ error: 'missing session' }, { status: 400 });

      const verify = await sessionStub(env, sessionId).fetch('https://relay/verify-host', {
        method: 'POST',
        body: JSON.stringify({ hostToken }),
      });
      const { ok } = await verify.json<{ ok: boolean }>();
      if (!ok) return json({ error: 'unauthorized' }, { status: 401 });

      try {
        return json(await claimFreshCode(env, sessionId));
      } catch {
        return json({ error: 'could not allocate a pairing code' }, { status: 503 });
      }
    }

    // --- Guest redeems a code for its own token ---
    if (request.method === 'POST' && url.pathname === RELAY_PATHS.pair) {
      const body = await readJson<{ code: string }>(request);
      const code = normalizePairingCode(typeof body.code === 'string' ? body.code : '');
      if (!isValidPairingCode(code)) return json({ error: 'invalid code' }, { status: 400 });

      const redeem = await codeStub(env, code).fetch('https://relay/redeem', { method: 'POST' });
      if (!redeem.ok) {
        const detail = await redeem
          .json<{ error?: string }>()
          .catch((): { error?: string } => ({}));
        return json({ error: detail.error ?? 'pairing failed' }, { status: redeem.status });
      }
      const { sessionId } = await redeem.json<{ sessionId: string }>();

      const guestRes = await sessionStub(env, sessionId).fetch('https://relay/guest', {
        method: 'POST',
      });
      if (!guestRes.ok) {
        const detail = await guestRes
          .json<{ error?: string }>()
          .catch((): { error?: string } => ({}));
        return json({ error: detail.error ?? 'session unavailable' }, { status: guestRes.status });
      }
      const { guestToken } = await guestRes.json<{ guestToken: string }>();

      return json({ protocolVersion: RELAY_PROTOCOL_VERSION, sessionId, guestToken });
    }

    // --- The relay socket ---
    if (url.pathname === RELAY_PATHS.socket) {
      const sessionId = url.searchParams.get('session') ?? '';
      if (!sessionId) return new Response('Missing session', { status: 400 });
      const target = new URL('https://relay/socket');
      target.search = url.search;
      return sessionStub(env, sessionId).fetch(new Request(target, request));
    }

    return json({ error: 'not found' }, { status: 404 });
  },
};
