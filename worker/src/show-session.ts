/**
 * One Durable Object per show session: the relay itself.
 *
 * Deliberately dumb — it authenticates sockets and forwards message payloads
 * verbatim. It never parses an OscFrame, so the control schema evolves in the
 * app without the Worker being redeployed.
 *
 * Uses the WebSocket Hibernation API (`acceptWebSocket`), so a session idling
 * between sets holds no billable duration; role is carried in the socket tag,
 * which survives hibernation where in-memory maps do not.
 */

import { generateSessionToken } from '../../shared/pairing-code.ts';
import type { RelayRole } from '../../shared/relay-protocol.ts';

type SessionRecord = {
  hostToken: string;
  guestTokens: string[];
  createdAt: number;
};

const SESSION_KEY = 'session';
/** Bounded so a leaked code cannot fan a session out indefinitely. */
const MAX_GUESTS = 8;

export class ShowSession implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  private async record(): Promise<SessionRecord | null> {
    return (await this.state.storage.get<SessionRecord>(SESSION_KEY)) ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/init') {
      const existing = await this.record();
      if (existing) return Response.json({ hostToken: existing.hostToken });
      const hostToken = generateSessionToken();
      await this.state.storage.put<SessionRecord>(SESSION_KEY, {
        hostToken,
        guestTokens: [],
        createdAt: Date.now(),
      });
      return Response.json({ hostToken });
    }

    if (request.method === 'POST' && url.pathname === '/guest') {
      const record = await this.record();
      if (!record) return Response.json({ error: 'unknown session' }, { status: 404 });
      if (record.guestTokens.length >= MAX_GUESTS) {
        return Response.json({ error: 'too many control surfaces' }, { status: 429 });
      }
      const guestToken = generateSessionToken();
      record.guestTokens.push(guestToken);
      await this.state.storage.put<SessionRecord>(SESSION_KEY, record);
      return Response.json({ guestToken });
    }

    if (request.method === 'POST' && url.pathname === '/verify-host') {
      const record = await this.record();
      const token = (await request.json<{ hostToken?: string }>()).hostToken ?? '';
      const ok = record !== null && timingSafeEqual(record.hostToken, token);
      return Response.json({ ok });
    }

    if (url.pathname === '/socket') {
      return this.handleSocket(request, url);
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const record = await this.record();
    if (!record) return new Response('Unknown session', { status: 404 });

    const token = url.searchParams.get('token') ?? '';
    const requestedRole = url.searchParams.get('role');
    const role: RelayRole | null =
      requestedRole === 'host' || requestedRole === 'guest' ? requestedRole : null;
    if (!role) return new Response('Invalid role', { status: 400 });

    const authorized =
      role === 'host'
        ? timingSafeEqual(record.hostToken, token)
        : record.guestTokens.some((candidate) => timingSafeEqual(candidate, token));
    if (!authorized) return new Response('Unauthorized', { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Tag carries the role across hibernation.
    this.state.acceptWebSocket(server, [role]);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Relay verbatim to every other socket on this session. */
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    for (const peer of this.state.getWebSockets()) {
      if (peer === ws) continue;
      try {
        peer.send(message);
      } catch {
        // Peer is closing; its own close handler will clean up.
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code === 1006 ? 1000 : code, reason);
    } catch {
      // Already closed.
    }
  }

  webSocketError(): void {
    // Nothing to do: the socket is torn down by the runtime.
  }
}

/** Constant-time compare so a token cannot be walked out one character at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
