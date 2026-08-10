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
  generatePairingCode,
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
import { ShowSession } from './show-session.ts';
import { SoundCloudAccount, type SoundCloudAccountEnv } from './soundcloud-account.ts';

export { PairingCode, ShowSession, SoundCloudAccount };

export type Env = SoundCloudAccountEnv & {
  SHOW_SESSION: DurableObjectNamespace;
  PAIRING_CODE: DurableObjectNamespace;
  SOUNDCLOUD_ACCOUNT: DurableObjectNamespace;
  SOUNDCLOUD_CONSOLE_URL?: string;
  SOUNDCLOUD_ALLOWED_ORIGIN?: string;
};

const SOUNDCLOUD_API_PREFIX = '/api/soundcloud';

/**
 * Open CORS: authentication is by bearer-style token in the request, never a
 * cookie, so there is no ambient authority for another origin to borrow. This
 * also lets a fork on its own Pages domain use a shared relay.
 */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
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
