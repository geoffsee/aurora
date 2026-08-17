import {
  LIVE_SHOW_PROTOCOL_VERSION,
  type PublicShowSummary,
  type ShowListResponse,
} from '../../shared/live-show.ts';

type DirectoryEntry = PublicShowSummary & {
  sourceIpHash?: string;
  publicBaseUrl?: string;
};

type RegistrationRecord = {
  registrationId: string;
  challenge: string;
  publicBaseUrl: string;
  sourceIpHash: string;
  expiresAt: number;
};

type AttemptWindow = { startedAt: number; count: number };
type ShowReservation = {
  id: string;
  runtime: PublicShowSummary['runtime'];
  sourceIpHash: string;
  endsAt: number;
  publicBaseUrl?: string;
};
type OriginClaim = { showId: string; endsAt: number };

const SHOW_PREFIX = 'show:';
const REGISTRATION_PREFIX = 'registration:';
const CREATE_PREFIX = 'create:';
const CODE_PREFIX = 'code:';
const ORIGIN_PREFIX = 'origin:';
const RESERVATION_PREFIX = 'reservation:';
const REGISTRATION_TTL_MS = 5 * 60_000;
const CREATE_WINDOW_MS = 60 * 60_000;
const CODE_WINDOW_MS = 10 * 60_000;

function showKey(id: string): string {
  return `${SHOW_PREFIX}${id}`;
}

function cleanLimit(raw: string | null): number {
  return Math.max(1, Math.min(100, Number(raw) || 50));
}

export class ShowDirectory implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/shows') {
      return this.list(url);
    }

    if (request.method === 'PUT' && url.pathname.startsWith('/shows/')) {
      const id = decodeURIComponent(url.pathname.slice('/shows/'.length));
      const entry = await request.json<DirectoryEntry>();
      if (!id || entry.id !== id) return Response.json({ error: 'invalid show' }, { status: 400 });
      await this.state.storage.put(showKey(id), entry);
      await this.scheduleCleanup(entry.endsAt);
      return Response.json({ ok: true });
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/shows/')) {
      const id = decodeURIComponent(url.pathname.slice('/shows/'.length));
      const existing = await this.state.storage.get<DirectoryEntry>(showKey(id));
      const reservation = await this.state.storage.get<ShowReservation>(
        `${RESERVATION_PREFIX}${id}`,
      );
      await this.state.storage.delete([showKey(id), `${RESERVATION_PREFIX}${id}`]);
      const publicBaseUrl = reservation?.publicBaseUrl ?? existing?.publicBaseUrl;
      if (publicBaseUrl) {
        const originKey = `${ORIGIN_PREFIX}${publicBaseUrl}`;
        const owner = await this.state.storage.get<OriginClaim | string>(originKey);
        const ownerId = typeof owner === 'string' ? owner : owner?.showId;
        if (ownerId === id) await this.state.storage.delete(originKey);
      }
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/reserve-show') {
      const reservation = await request.json<ShowReservation>();
      if (
        !reservation.id ||
        !reservation.sourceIpHash ||
        !['docker', 'native', 'pages'].includes(reservation.runtime) ||
        !Number.isFinite(reservation.endsAt) ||
        reservation.endsAt <= Date.now()
      ) {
        return Response.json({ error: 'invalid show reservation' }, { status: 400 });
      }
      const reservations = await this.activeReservations();
      if (
        reservation.runtime === 'pages' &&
        reservations.filter(
          (entry) => entry.runtime === 'pages' && entry.sourceIpHash === reservation.sourceIpHash,
        ).length >= 2
      ) {
        console.warn(JSON.stringify({ scope: 'live-show', event: 'pages_active_limit' }));
        return Response.json(
          { error: 'two active Pages shows are already running' },
          { status: 429 },
        );
      }
      if (reservation.publicBaseUrl) {
        const key = `${ORIGIN_PREFIX}${reservation.publicBaseUrl}`;
        const existing = await this.state.storage.get<OriginClaim | string>(key);
        const existingShowId = typeof existing === 'string' ? existing : existing?.showId;
        const existingEndsAt =
          typeof existing === 'string'
            ? (await this.state.storage.get<DirectoryEntry>(showKey(existing)))?.endsAt
            : existing?.endsAt;
        if (
          existingShowId &&
          existingShowId !== reservation.id &&
          (existingEndsAt ?? Number.POSITIVE_INFINITY) > Date.now()
        ) {
          console.warn(JSON.stringify({ scope: 'live-show', event: 'origin_claim_conflict' }));
          return Response.json({ error: 'public URL already has an active show' }, { status: 409 });
        }
        await this.state.storage.put(key, {
          showId: reservation.id,
          endsAt: reservation.endsAt,
        } satisfies OriginClaim);
      }
      await this.state.storage.put(`${RESERVATION_PREFIX}${reservation.id}`, reservation);
      await this.scheduleCleanup(reservation.endsAt);
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/registrations') {
      const body = await request.json<{
        registrationId: string;
        challenge: string;
        publicBaseUrl: string;
        sourceIpHash: string;
      }>();
      const record: RegistrationRecord = { ...body, expiresAt: Date.now() + REGISTRATION_TTL_MS };
      await this.state.storage.put(`${REGISTRATION_PREFIX}${record.registrationId}`, record);
      await this.scheduleCleanup(record.expiresAt);
      return Response.json(record);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/registrations/')) {
      const id = decodeURIComponent(url.pathname.slice('/registrations/'.length));
      const key = `${REGISTRATION_PREFIX}${id}`;
      const record = await this.state.storage.get<RegistrationRecord>(key);
      if (!record || record.expiresAt <= Date.now()) {
        if (record) await this.state.storage.delete(key);
        return Response.json({ error: 'registration expired' }, { status: 404 });
      }
      return Response.json(record);
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/registrations/')) {
      const id = decodeURIComponent(url.pathname.slice('/registrations/'.length));
      await this.state.storage.delete(`${REGISTRATION_PREFIX}${id}`);
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/claim-origin') {
      const { publicBaseUrl, showId } = await request.json<{
        publicBaseUrl: string;
        showId: string;
      }>();
      const key = `${ORIGIN_PREFIX}${publicBaseUrl}`;
      const existing = await this.state.storage.get<OriginClaim | string>(key);
      const existingShowId = typeof existing === 'string' ? existing : existing?.showId;
      if (existingShowId && existingShowId !== showId) {
        const active =
          typeof existing === 'string'
            ? await this.state.storage.get<DirectoryEntry>(showKey(existing))
            : existing;
        if (active && active.endsAt > Date.now()) {
          return Response.json({ error: 'public URL already has an active show' }, { status: 409 });
        }
      }
      await this.state.storage.put(key, showId);
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/rate/create') {
      const { sourceIpHash } = await request.json<{
        sourceIpHash: string;
      }>();
      const allowed = await this.takeAttempt(
        `${CREATE_PREFIX}${sourceIpHash}`,
        CREATE_WINDOW_MS,
        6,
      );
      if (!allowed) {
        console.warn(JSON.stringify({ scope: 'live-show', event: 'creation_rate_limit' }));
        return Response.json({ error: 'show creation rate limit reached' }, { status: 429 });
      }
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/rate/code') {
      const { showId, sourceIpHash, success } = await request.json<{
        showId: string;
        sourceIpHash: string;
        success?: boolean;
      }>();
      const key = `${CODE_PREFIX}${showId}:${sourceIpHash}`;
      if (success) {
        await this.state.storage.delete(key);
        return Response.json({ ok: true });
      }
      const allowed = await this.takeAttempt(key, CODE_WINDOW_MS, 5);
      if (!allowed) {
        console.warn(
          JSON.stringify({ scope: 'live-show', event: 'closed_code_rate_limit', showId }),
        );
        return Response.json(
          { error: 'too many incorrect codes; try again later' },
          { status: 429 },
        );
      }
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  }

  private async activeEntries(): Promise<DirectoryEntry[]> {
    const values = await this.state.storage.list<DirectoryEntry>({ prefix: SHOW_PREFIX });
    const now = Date.now();
    const active: DirectoryEntry[] = [];
    const expired: string[] = [];
    for (const [key, entry] of values) {
      if (entry.endsAt <= now || !entry.sourceOnline || !entry.originOnline) expired.push(key);
      else active.push(entry);
    }
    if (expired.length > 0) await this.state.storage.delete(expired);
    active.sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id));
    return active;
  }

  private async activeReservations(): Promise<ShowReservation[]> {
    const values = await this.state.storage.list<ShowReservation>({ prefix: RESERVATION_PREFIX });
    const now = Date.now();
    const active: ShowReservation[] = [];
    const expired: string[] = [];
    for (const [key, reservation] of values) {
      if (reservation.endsAt <= now) expired.push(key);
      else active.push(reservation);
    }
    if (expired.length > 0) await this.state.storage.delete(expired);
    return active;
  }

  private async list(url: URL): Promise<Response> {
    const entries = await this.activeEntries();
    const cursor = url.searchParams.get('cursor') ?? '';
    const start = cursor ? entries.findIndex((entry) => entry.id === cursor) + 1 : 0;
    const limit = cleanLimit(url.searchParams.get('limit'));
    const page = entries.slice(Math.max(0, start), Math.max(0, start) + limit);
    const next = start + page.length < entries.length ? page.at(-1)?.id : undefined;
    const shows = page.map(({ sourceIpHash: _ip, publicBaseUrl: _url, ...summary }) => summary);
    return Response.json({
      protocolVersion: LIVE_SHOW_PROTOCOL_VERSION,
      shows,
      ...(next ? { cursor: next } : {}),
    } satisfies ShowListResponse);
  }

  private async takeAttempt(key: string, windowMs: number, maximum: number): Promise<boolean> {
    const now = Date.now();
    const stored = await this.state.storage.get<AttemptWindow>(key);
    const record =
      !stored || stored.startedAt + windowMs <= now ? { startedAt: now, count: 0 } : stored;
    record.count += 1;
    await this.state.storage.put(key, record);
    await this.scheduleCleanup(record.startedAt + windowMs);
    return record.count <= maximum;
  }

  private async scheduleCleanup(at: number): Promise<void> {
    const current = await this.state.storage.getAlarm();
    if (current === null || at < current) await this.state.storage.setAlarm(at);
  }

  async alarm(): Promise<void> {
    const values = await this.state.storage.list<unknown>();
    const now = Date.now();
    const expired: string[] = [];
    let next = Number.POSITIVE_INFINITY;
    for (const [key, raw] of values) {
      let expiresAt: number | undefined;
      if (key.startsWith(SHOW_PREFIX)) expiresAt = (raw as DirectoryEntry).endsAt;
      else if (key.startsWith(REGISTRATION_PREFIX))
        expiresAt = (raw as RegistrationRecord).expiresAt;
      else if (key.startsWith(RESERVATION_PREFIX)) expiresAt = (raw as ShowReservation).endsAt;
      else if (key.startsWith(CREATE_PREFIX))
        expiresAt = (raw as AttemptWindow).startedAt + CREATE_WINDOW_MS;
      else if (key.startsWith(CODE_PREFIX))
        expiresAt = (raw as AttemptWindow).startedAt + CODE_WINDOW_MS;
      else if (key.startsWith(ORIGIN_PREFIX)) {
        if (typeof raw === 'string') {
          const show = await this.state.storage.get<DirectoryEntry>(showKey(raw));
          if (!show) {
            expired.push(key);
            continue;
          }
          expiresAt = show.endsAt;
        } else expiresAt = (raw as OriginClaim).endsAt;
      }
      if (expiresAt === undefined) continue;
      if (expiresAt <= now) expired.push(key);
      else next = Math.min(next, expiresAt);
    }
    if (expired.length > 0) await this.state.storage.delete(expired);
    if (Number.isFinite(next)) await this.state.storage.setAlarm(next);
  }
}
