/**
 * One Durable Object per live pairing code — a short-lived pointer to a session.
 *
 * Addressing the object by the code itself (`idFromName(code)`) shards pairing
 * naturally: no global directory to bottleneck on, and lookups are strongly
 * consistent, which KV's eventual consistency would not give a phone typing a
 * code seconds after the projector displayed it.
 *
 * The code is single-use for pairing and dies on TTL or attempt exhaustion.
 */

import { MAX_PAIR_ATTEMPTS } from '../../shared/pairing-code.ts';

type CodeRecord = {
  sessionId: string;
  expiresAt: number;
  attempts: number;
  redeemed: boolean;
};

const CODE_KEY = 'code';

export class PairingCode implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/claim') {
      const body = await request.json<{ sessionId?: string; ttlMs?: number }>();
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
      const ttlMs = typeof body.ttlMs === 'number' ? body.ttlMs : 0;
      if (!sessionId || ttlMs <= 0) {
        return Response.json({ error: 'invalid claim' }, { status: 400 });
      }
      const existing = await this.state.storage.get<CodeRecord>(CODE_KEY);
      // Collision on a live code: the caller retries with a fresh one rather
      // than silently repointing an in-flight pairing at a different session.
      if (existing && !existing.redeemed && existing.expiresAt > Date.now()) {
        return Response.json({ error: 'code in use' }, { status: 409 });
      }
      const expiresAt = Date.now() + ttlMs;
      await this.state.storage.put<CodeRecord>(CODE_KEY, {
        sessionId,
        expiresAt,
        attempts: 0,
        redeemed: false,
      });
      // Self-clean so expired codes do not accumulate storage.
      await this.state.storage.setAlarm(expiresAt + 60_000);
      return Response.json({ expiresAt });
    }

    if (request.method === 'POST' && url.pathname === '/redeem') {
      const record = await this.state.storage.get<CodeRecord>(CODE_KEY);
      if (!record) return Response.json({ error: 'unknown code' }, { status: 404 });
      if (record.redeemed) return Response.json({ error: 'code already used' }, { status: 410 });
      if (record.expiresAt <= Date.now()) {
        await this.state.storage.deleteAll();
        return Response.json({ error: 'code expired' }, { status: 410 });
      }
      if (record.attempts >= MAX_PAIR_ATTEMPTS) {
        await this.state.storage.deleteAll();
        return Response.json({ error: 'too many attempts' }, { status: 429 });
      }
      record.redeemed = true;
      await this.state.storage.put<CodeRecord>(CODE_KEY, record);
      return Response.json({ sessionId: record.sessionId });
    }

    if (request.method === 'POST' && url.pathname === '/miss') {
      // A wrong guess against *this* code slot; counts toward its budget.
      const record = await this.state.storage.get<CodeRecord>(CODE_KEY);
      if (!record) return Response.json({ ok: true });
      record.attempts += 1;
      if (record.attempts >= MAX_PAIR_ATTEMPTS) {
        await this.state.storage.deleteAll();
      } else {
        await this.state.storage.put<CodeRecord>(CODE_KEY, record);
      }
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}
