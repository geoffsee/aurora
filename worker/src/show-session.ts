/** One Durable Object per phone-pairing or public live-show session. */

import {
  coalesceAudienceFrames,
  filterAudienceFrame,
  LIVE_SHOW_BATCH_MAX_BYTES,
  LIVE_SHOW_MAX_PACKAGE_BYTES,
  LIVE_SHOW_MAX_PACKAGES,
  LIVE_SHOW_MAX_VIEWERS,
  LIVE_SHOW_OFFLINE_GRACE_MS,
  LIVE_SHOW_ORIGIN_PROBE_MS,
  LIVE_SHOW_PROTOCOL_VERSION,
  LIVE_SHOW_SOURCE_STATUS_ADDRESS,
  type LiveStateBatch,
  type LiveStateFrame,
  type LiveStateSnapshot,
  type PublicShowSummary,
  type ShowAccess,
  type ShowRuntime,
} from '../../shared/live-show.ts';
import { generateSessionToken } from '../../shared/pairing-code.ts';
import type { RelayRole } from '../../shared/relay-protocol.ts';

type SessionRecord = {
  hostToken: string;
  guestTokens: string[];
  createdAt: number;
  live?: {
    id: string;
    name: string;
    access: ShowAccess;
    runtime: ShowRuntime;
    startedAt: number;
    endsAt: number;
    sourceToken: string;
    viewerKey: string;
    codeSalt?: string;
    codeDigest?: string;
    publicBaseUrl?: string;
    proof?: string;
    sourceIpHash?: string;
    sourceOnline: boolean;
    originOnline: boolean;
    lastSourceAt: number;
    lastOriginAt: number;
    lastOriginProbeAt: number;
    stopped: boolean;
    sequence: number;
    packages: Array<{ slug: string; bytes: number; uploadedAt: number }>;
  };
};

type LiveEnv = {
  SHOW_DIRECTORY: DurableObjectNamespace;
  LIVE_SHOW_ASSETS?: R2Bucket;
};

const SESSION_KEY = 'session';
const SNAPSHOT_KEY = 'live-snapshot';
const MAX_GUESTS = 8;
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const base64 = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<string> {
  return bytesToBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
  );
}

async function signGrant(key: string, showId: string, expiresAt: number): Promise<string> {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ s: showId, e: expiresAt })));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyGrant(
  key: string,
  showId: string,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const decoded = base64UrlToBytes(payload);
  if (!decoded) return false;
  let grant: { s?: string; e?: number };
  try {
    grant = JSON.parse(new TextDecoder().decode(decoded)) as { s?: string; e?: number };
  } catch {
    return false;
  }
  if (grant.s !== showId || typeof grant.e !== 'number' || grant.e <= now) return false;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signatureBytes = base64UrlToBytes(signature);
  return signatureBytes
    ? crypto.subtle.verify('HMAC', cryptoKey, signatureBytes, encoder.encode(payload))
    : false;
}

export class ShowSession implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: LiveEnv,
  ) {}

  private async record(): Promise<SessionRecord | null> {
    return (await this.state.storage.get<SessionRecord>(SESSION_KEY)) ?? null;
  }

  private directory() {
    return this.env.SHOW_DIRECTORY.get(this.env.SHOW_DIRECTORY.idFromName('global'));
  }

  private summary(record: SessionRecord): PublicShowSummary | null {
    const live = record.live;
    if (!live) return null;
    return {
      protocolVersion: LIVE_SHOW_PROTOCOL_VERSION,
      id: live.id,
      name: live.name,
      access: live.access,
      runtime: live.runtime,
      startedAt: live.startedAt,
      endsAt: live.endsAt,
      sourceOnline: live.sourceOnline,
      originOnline: live.originOnline,
      viewerCount: this.state.getWebSockets('viewer').length,
    };
  }

  private async syncDirectory(record: SessionRecord): Promise<void> {
    const summary = this.summary(record);
    if (!summary || record.live?.stopped || summary.endsAt <= Date.now()) {
      if (record.live) {
        await this.directory().fetch(
          `https://directory/shows/${encodeURIComponent(record.live.id)}`,
          {
            method: 'DELETE',
          },
        );
      }
      return;
    }
    if (!summary.sourceOnline || !summary.originOnline) {
      await this.directory().fetch(`https://directory/shows/${encodeURIComponent(summary.id)}`, {
        method: 'DELETE',
      });
      return;
    }
    await this.directory().fetch(`https://directory/shows/${encodeURIComponent(summary.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...summary,
        sourceIpHash: record.live?.sourceIpHash,
        publicBaseUrl: record.live?.publicBaseUrl,
      }),
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Existing phone-pairing API remains unchanged.
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

    if (request.method === 'POST' && url.pathname === '/init-live') {
      const body = await request.json<{
        id: string;
        name: string;
        access: ShowAccess;
        runtime: ShowRuntime;
        startedAt: number;
        endsAt: number;
        code?: string;
        publicBaseUrl?: string;
        proof?: string;
        sourceIpHash?: string;
      }>();
      const existing = await this.record();
      if (existing?.live && !existing.live.stopped)
        return Response.json({ error: 'show exists' }, { status: 409 });
      const hostToken = generateSessionToken();
      const sourceToken = generateSessionToken();
      const viewerKey = generateSessionToken();
      const codeSalt = body.code ? generateSessionToken() : undefined;
      const codeDigest =
        body.code && codeSalt ? await sha256(`${codeSalt}:${body.code}`) : undefined;
      const record: SessionRecord = {
        hostToken,
        guestTokens: [],
        createdAt: body.startedAt,
        live: {
          ...body,
          sourceToken,
          viewerKey,
          codeSalt,
          codeDigest,
          sourceOnline: false,
          originOnline: body.runtime === 'pages' || Boolean(body.publicBaseUrl && body.proof),
          lastSourceAt: 0,
          lastOriginAt:
            body.runtime === 'pages' || (body.publicBaseUrl && body.proof) ? Date.now() : 0,
          lastOriginProbeAt: Date.now(),
          stopped: false,
          sequence: 0,
          packages: [],
        },
      };
      await this.state.storage.put(SESSION_KEY, record);
      await this.state.storage.setAlarm(Math.min(body.endsAt, Date.now() + 15_000));
      return Response.json({ hostToken, sourceToken, summary: this.summary(record) });
    }

    if (request.method === 'POST' && url.pathname === '/guest') {
      const record = await this.record();
      if (!record) return Response.json({ error: 'unknown session' }, { status: 404 });
      if (record.guestTokens.length >= MAX_GUESTS)
        return Response.json({ error: 'too many control surfaces' }, { status: 429 });
      const guestToken = generateSessionToken();
      record.guestTokens.push(guestToken);
      await this.state.storage.put(SESSION_KEY, record);
      return Response.json({ guestToken });
    }

    if (request.method === 'POST' && url.pathname === '/verify-host') {
      const record = await this.record();
      const token = (await request.json<{ hostToken?: string }>()).hostToken ?? '';
      return Response.json({
        ok: record !== null && timingSafeEqual(record.hostToken, token),
        connected: this.state.getWebSockets('host').length > 0,
      });
    }

    if (request.method === 'POST' && url.pathname === '/manage') {
      const record = await this.record();
      const { hostToken } = await request.json<{ hostToken?: string }>();
      if (!record?.live || !timingSafeEqual(record.hostToken, hostToken ?? ''))
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      return Response.json({
        show: this.summary(record),
        sourceConnected: this.state.getWebSockets('source').length > 0,
        packages: record.live.packages,
      });
    }

    if (request.method === 'POST' && url.pathname === '/join') {
      const record = await this.record();
      const { code } = await request.json<{ code?: string }>();
      const live = record?.live;
      if (!record || !live || live.stopped || live.endsAt <= Date.now())
        return Response.json({ error: 'show ended' }, { status: 410 });
      if (!live.sourceOnline || !live.originOnline)
        return Response.json({ error: 'show source is reconnecting' }, { status: 503 });
      if (live.access === 'closed') {
        const digest = live.codeSalt ? await sha256(`${live.codeSalt}:${code ?? ''}`) : '';
        if (!live.codeDigest || !timingSafeEqual(live.codeDigest, digest))
          return Response.json({ error: 'incorrect code' }, { status: 401 });
      }
      const viewerToken = await signGrant(live.viewerKey, live.id, live.endsAt);
      return Response.json({
        viewerToken,
        expiresAt: live.endsAt,
        summary: this.summary(record),
        publicBaseUrl: live.publicBaseUrl,
      });
    }

    if (request.method === 'POST' && url.pathname === '/rotate-code') {
      const record = await this.record();
      const { hostToken, code } = await request.json<{ hostToken?: string; code?: string }>();
      if (!record?.live || !timingSafeEqual(record.hostToken, hostToken ?? ''))
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      if (record.live.access !== 'closed')
        return Response.json({ error: 'show is open' }, { status: 409 });
      record.live.codeSalt = generateSessionToken();
      record.live.codeDigest = await sha256(`${record.live.codeSalt}:${code ?? ''}`);
      await this.state.storage.put(SESSION_KEY, record);
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/stop') {
      const record = await this.record();
      const { hostToken } = await request.json<{ hostToken?: string }>();
      if (!record?.live || !timingSafeEqual(record.hostToken, hostToken ?? ''))
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      await this.stop(record, 'Show stopped');
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/package-reserve') {
      const record = await this.record();
      const { hostToken, slug, bytes } = await request.json<{
        hostToken?: string;
        slug?: string;
        bytes?: number;
      }>();
      if (!record?.live || !timingSafeEqual(record.hostToken, hostToken ?? ''))
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      if (record.live.runtime !== 'pages')
        return Response.json(
          { error: 'packages are only relayed for Pages shows' },
          { status: 409 },
        );
      if (
        !slug ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        !Number.isFinite(bytes) ||
        (bytes ?? 0) <= 0
      )
        return Response.json({ error: 'invalid package' }, { status: 400 });
      const next = record.live.packages.filter((entry) => entry.slug !== slug);
      next.push({ slug, bytes: bytes as number, uploadedAt: Date.now() });
      next.sort((a, b) => b.uploadedAt - a.uploadedAt);
      const removed = next.splice(LIVE_SHOW_MAX_PACKAGES).map((entry) => entry.slug);
      const total = next.reduce((sum, entry) => sum + entry.bytes, 0);
      if (total > LIVE_SHOW_MAX_PACKAGE_BYTES)
        return Response.json({ error: 'show package storage limit exceeded' }, { status: 413 });
      record.live.packages = next;
      await this.state.storage.put(SESSION_KEY, record);
      return Response.json({ ok: true, removed });
    }

    if (request.method === 'POST' && url.pathname === '/verify-package-viewer') {
      const record = await this.record();
      const { token, slug } = await request.json<{ token?: string; slug?: string }>();
      const live = record?.live;
      const ok = Boolean(
        live &&
          token &&
          (await verifyGrant(live.viewerKey, live.id, token)) &&
          live.packages.some((entry) => entry.slug === slug),
      );
      return Response.json({ ok });
    }

    if (url.pathname === '/socket') return this.handleSocket(request, url);
    return new Response('Not found', { status: 404 });
  }

  private async handleSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('Expected WebSocket upgrade', { status: 426 });
    const record = await this.record();
    if (!record) return new Response('Unknown session', { status: 404 });
    const token = url.searchParams.get('token') ?? '';
    const requestedRole = url.searchParams.get('role');
    const role: RelayRole | 'source' | 'viewer' | null =
      requestedRole === 'host' ||
      requestedRole === 'guest' ||
      requestedRole === 'source' ||
      requestedRole === 'viewer'
        ? requestedRole
        : null;
    if (!role) return new Response('Invalid role', { status: 400 });
    let authorized = false;
    if (role === 'host') authorized = timingSafeEqual(record.hostToken, token);
    else if (role === 'guest')
      authorized = record.guestTokens.some((candidate) => timingSafeEqual(candidate, token));
    else if (role === 'source')
      authorized = Boolean(
        record.live && !record.live.stopped && timingSafeEqual(record.live.sourceToken, token),
      );
    else if (record.live)
      authorized = await verifyGrant(record.live.viewerKey, record.live.id, token);
    if (!authorized) return new Response('Unauthorized', { status: 401 });
    if (
      (role === 'source' || role === 'viewer') &&
      (!record.live || record.live.stopped || record.live.endsAt <= Date.now())
    )
      return new Response('Show ended', { status: 410 });
    if (role === 'viewer' && this.state.getWebSockets('viewer').length >= LIVE_SHOW_MAX_VIEWERS)
      return new Response('Show is full', { status: 429 });
    if (role === 'source') {
      for (const existing of this.state.getWebSockets('source')) {
        try {
          existing.close(1012, 'Source replaced');
        } catch {
          /* already closing */
        }
      }
      if (record.live) {
        record.live.sourceOnline = true;
        record.live.lastSourceAt = Date.now();
        await this.state.storage.put(SESSION_KEY, record);
        await this.syncDirectory(record);
      }
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.serializeAttachment({ role });
    this.state.acceptWebSocket(server, [role]);
    if (role === 'source') {
      this.sendSourceStatus(true);
      console.log(
        JSON.stringify({ scope: 'live-show', event: 'source_connected', showId: record.live?.id }),
      );
    }
    if (role === 'viewer') {
      const snapshot = await this.state.storage.get<LiveStateSnapshot>(SNAPSHOT_KEY);
      if (snapshot) server.send(JSON.stringify(snapshot));
      server.send(
        JSON.stringify(this.sourceStatusFrame(this.state.getWebSockets('source').length > 0)),
      );
      await this.syncDirectory(record);
      console.log(
        JSON.stringify({
          scope: 'live-show',
          event: 'viewer_connected',
          showId: record.live?.id,
          viewerCount: this.state.getWebSockets('viewer').length,
        }),
      );
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment?.() as { role?: string } | null;
    const actualRole = attachment?.role ?? this.roleOf(ws);
    if (actualRole === 'viewer') {
      ws.close(1008, 'Audience sockets are receive-only');
      return;
    }
    if (actualRole === 'source') {
      await this.handleSourceMessage(message);
      return;
    }
    const target = actualRole === 'host' ? 'guest' : actualRole === 'guest' ? 'host' : '';
    if (!target) return;
    for (const peer of this.state.getWebSockets(target)) {
      try {
        peer.send(message);
      } catch {
        /* closing */
      }
    }
  }

  private roleOf(ws: WebSocket): string {
    for (const role of ['host', 'guest', 'source', 'viewer']) {
      if (this.state.getWebSockets(role).includes(ws)) return role;
    }
    return '';
  }

  private async handleSourceMessage(message: string | ArrayBuffer): Promise<void> {
    const size =
      typeof message === 'string' ? encoder.encode(message).byteLength : message.byteLength;
    if (size > LIVE_SHOW_BATCH_MAX_BYTES) return;
    let raw: Partial<LiveStateBatch>;
    try {
      raw = JSON.parse(
        typeof message === 'string' ? message : new TextDecoder().decode(message),
      ) as Partial<LiveStateBatch>;
    } catch {
      return;
    }
    if (raw.type !== 'live-state' || !Array.isArray(raw.frames)) return;
    const frames = coalesceAudienceFrames(
      raw.frames
        .map(filterAudienceFrame)
        .filter((frame): frame is LiveStateFrame => frame !== null),
    );
    if (frames.length === 0) return;
    const record = await this.record();
    if (!record?.live || record.live.stopped) return;
    record.live.sequence = Math.max(record.live.sequence + 1, Number(raw.sequence) || 0);
    record.live.sourceOnline = true;
    record.live.lastSourceAt = Date.now();
    const batch: LiveStateBatch = {
      protocolVersion: LIVE_SHOW_PROTOCOL_VERSION,
      type: 'live-state',
      sequence: record.live.sequence,
      sentAt: Date.now(),
      frames,
    };
    const previous = await this.state.storage.get<LiveStateSnapshot>(SNAPSHOT_KEY);
    const snapshotFrames = coalesceAudienceFrames([...(previous?.frames ?? []), ...frames]).slice(
      -100,
    );
    await this.state.storage.put({
      [SESSION_KEY]: record,
      [SNAPSHOT_KEY]: {
        protocolVersion: LIVE_SHOW_PROTOCOL_VERSION,
        type: 'live-snapshot',
        sequence: batch.sequence,
        sentAt: batch.sentAt,
        frames: snapshotFrames,
      } satisfies LiveStateSnapshot,
    });
    const encoded = JSON.stringify(batch);
    if (batch.sequence === 1 || batch.sequence % 20 === 0) {
      console.log(
        JSON.stringify({
          scope: 'live-show',
          event: 'batch',
          showId: record.live.id,
          sequence: batch.sequence,
          frames: frames.length,
          bytes: encoder.encode(encoded).byteLength,
          viewers: this.state.getWebSockets('viewer').length,
        }),
      );
    }
    for (const peer of this.state.getWebSockets('viewer')) {
      try {
        peer.send(encoded);
      } catch {
        /* slow/closing peers do not block others */
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    const attachment = ws.deserializeAttachment?.() as { role?: string } | null;
    const role = attachment?.role ?? this.roleOf(ws);
    try {
      ws.close(code === 1006 ? 1000 : code, reason);
    } catch {
      /* closed */
    }
    this.state.waitUntil(this.onSocketGone(role));
  }

  webSocketError(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment?.() as { role?: string } | null;
    this.state.waitUntil(this.onSocketGone(attachment?.role ?? this.roleOf(ws)));
  }

  private async onSocketGone(role: string): Promise<void> {
    const record = await this.record();
    if (!record?.live) return;
    if (role === 'source' && this.state.getWebSockets('source').length === 0) {
      record.live.lastSourceAt = Date.now();
      await this.state.storage.put(SESSION_KEY, record);
      this.sendSourceStatus(false);
    }
    if (role === 'source' || role === 'viewer') await this.syncDirectory(record);
  }

  private sourceStatusFrame(connected: boolean): LiveStateFrame {
    return { address: LIVE_SHOW_SOURCE_STATUS_ADDRESS, args: [connected ? 1 : 0] };
  }

  private sendSourceStatus(connected: boolean): void {
    const encoded = JSON.stringify(this.sourceStatusFrame(connected));
    for (const peer of this.state.getWebSockets('viewer')) {
      try {
        peer.send(encoded);
      } catch {
        /* closing */
      }
    }
  }

  async alarm(): Promise<void> {
    const record = await this.record();
    const live = record?.live;
    if (!record || !live || live.stopped) return;
    const now = Date.now();
    if (live.endsAt <= now) {
      await this.stop(record, 'Show ended');
      return;
    }
    live.sourceOnline =
      this.state.getWebSockets('source').length > 0 ||
      now - live.lastSourceAt < LIVE_SHOW_OFFLINE_GRACE_MS;
    if (live.runtime !== 'pages' && live.publicBaseUrl && live.proof) {
      const wasOriginOnline = live.originOnline;
      if (now - (live.lastOriginProbeAt ?? 0) >= LIVE_SHOW_ORIGIN_PROBE_MS) {
        live.lastOriginProbeAt = now;
        try {
          const response = await fetch(`${live.publicBaseUrl}/.well-known/aurora-live-show`, {
            redirect: 'manual',
            signal: AbortSignal.timeout(10_000),
          });
          const healthy = response.ok && (await response.text()) === live.proof;
          if (healthy) live.lastOriginAt = now;
        } catch {
          // Grace below handles transient tunnel loss.
        }
      }
      live.originOnline = now - live.lastOriginAt < LIVE_SHOW_OFFLINE_GRACE_MS;
      if (live.originOnline !== wasOriginOnline) {
        console.log(
          JSON.stringify({
            scope: 'live-show',
            event: 'origin_health',
            showId: live.id,
            online: live.originOnline,
          }),
        );
      }
    }
    await this.state.storage.put(SESSION_KEY, record);
    await this.syncDirectory(record);
    await this.state.storage.setAlarm(Math.min(live.endsAt, now + 15_000));
  }

  private async stop(record: SessionRecord, reason: string): Promise<void> {
    if (!record.live) return;
    record.live.stopped = true;
    record.live.sourceOnline = false;
    record.live.viewerKey = generateSessionToken();
    await this.state.storage.put(SESSION_KEY, record);
    await this.syncDirectory(record);
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.close(1000, reason);
      } catch {
        /* closed */
      }
    }
    if (this.env.LIVE_SHOW_ASSETS) {
      const listed = await this.env.LIVE_SHOW_ASSETS.list({ prefix: `${record.live.id}/` });
      if (listed.objects.length > 0)
        await this.env.LIVE_SHOW_ASSETS.delete(listed.objects.map((object) => object.key));
    }
    await this.state.storage.delete(SNAPSHOT_KEY);
    console.log(
      JSON.stringify({
        scope: 'live-show',
        event: 'session_stopped',
        showId: record.live.id,
        reason,
      }),
    );
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
