import { describe, expect, test } from 'vitest';
import { LIVE_SHOW_PROTOCOL_VERSION, type PublicShowSummary } from '../../shared/live-show.ts';
import { ShowDirectory } from '../../worker/src/show-directory.ts';

class MemoryStorage {
  values = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(key: string) {
    return this.values.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.values.set(key, value);
  }
  async delete(keys: string | string[]) {
    let deleted = false;
    for (const key of Array.isArray(keys) ? keys : [keys])
      deleted = this.values.delete(key) || deleted;
    return deleted;
  }
  async list<T>({ prefix = '' }: { prefix?: string } = {}) {
    return new Map(
      [...this.values.entries()].filter(([key]) => key.startsWith(prefix)) as [string, T][],
    );
  }
  async getAlarm() {
    return this.alarm;
  }
  async setAlarm(value: number) {
    this.alarm = value;
  }
}

function directory() {
  return new ShowDirectory({ storage: new MemoryStorage() } as never);
}

function summary(id: string, startedAt: number): PublicShowSummary {
  return {
    protocolVersion: LIVE_SHOW_PROTOCOL_VERSION,
    id,
    name: id,
    access: 'open',
    runtime: 'pages',
    startedAt,
    endsAt: Date.now() + 60_000,
    sourceOnline: true,
    originOnline: true,
    viewerCount: 0,
  };
}

describe('ShowDirectory Durable Object', () => {
  test('lists active shows newest first with cursor pagination', async () => {
    const value = directory();
    for (const item of [summary('old', 1), summary('new', 2)]) {
      await value.fetch(
        new Request(`https://directory/shows/${item.id}`, {
          method: 'PUT',
          body: JSON.stringify(item),
        }),
      );
    }
    const first = await value.fetch(new Request('https://directory/shows?limit=1'));
    const firstPage = (await first.json()) as { shows: PublicShowSummary[]; cursor?: string };
    expect(firstPage.shows.map((show) => show.id)).toEqual(['new']);
    const second = await value.fetch(
      new Request(`https://directory/shows?limit=1&cursor=${firstPage.cursor}`),
    );
    expect(((await second.json()) as { shows: PublicShowSummary[] }).shows[0]?.id).toBe('old');
  });

  test('hides offline shows and enforces creation attempt limits', async () => {
    const value = directory();
    const offline = { ...summary('offline', 1), sourceOnline: false };
    await value.fetch(
      new Request('https://directory/shows/offline', {
        method: 'PUT',
        body: JSON.stringify(offline),
      }),
    );
    const list = await value.fetch(new Request('https://directory/shows'));
    expect(((await list.json()) as { shows: unknown[] }).shows).toEqual([]);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await value.fetch(
        new Request('https://directory/rate/create', {
          method: 'POST',
          body: JSON.stringify({ sourceIpHash: 'ip' }),
        }),
      );
      expect(response.ok).toBe(true);
    }
    const blocked = await value.fetch(
      new Request('https://directory/rate/create', {
        method: 'POST',
        body: JSON.stringify({ sourceIpHash: 'ip' }),
      }),
    );
    expect(blocked.status).toBe(429);
  });

  test('reserves Pages capacity and tunnel origins while a source is offline', async () => {
    const value = directory();
    for (const id of ['one', 'two']) {
      const response = await value.fetch(
        new Request('https://directory/reserve-show', {
          method: 'POST',
          body: JSON.stringify({
            id,
            runtime: 'pages',
            sourceIpHash: 'same-ip',
            endsAt: Date.now() + 60_000,
          }),
        }),
      );
      expect(response.ok).toBe(true);
    }
    const third = await value.fetch(
      new Request('https://directory/reserve-show', {
        method: 'POST',
        body: JSON.stringify({
          id: 'three',
          runtime: 'pages',
          sourceIpHash: 'same-ip',
          endsAt: Date.now() + 60_000,
        }),
      }),
    );
    expect(third.status).toBe(429);

    const firstTunnel = await value.fetch(
      new Request('https://directory/reserve-show', {
        method: 'POST',
        body: JSON.stringify({
          id: 'tunnel-one',
          runtime: 'native',
          sourceIpHash: 'ip-one',
          publicBaseUrl: 'https://show.example',
          endsAt: Date.now() + 60_000,
        }),
      }),
    );
    expect(firstTunnel.ok).toBe(true);
    const collision = await value.fetch(
      new Request('https://directory/reserve-show', {
        method: 'POST',
        body: JSON.stringify({
          id: 'tunnel-two',
          runtime: 'docker',
          sourceIpHash: 'ip-two',
          publicBaseUrl: 'https://show.example',
          endsAt: Date.now() + 60_000,
        }),
      }),
    );
    expect(collision.status).toBe(409);
    await value.fetch(new Request('https://directory/shows/tunnel-one', { method: 'DELETE' }));
    const released = await value.fetch(
      new Request('https://directory/reserve-show', {
        method: 'POST',
        body: JSON.stringify({
          id: 'tunnel-two',
          runtime: 'docker',
          sourceIpHash: 'ip-two',
          publicBaseUrl: 'https://show.example',
          endsAt: Date.now() + 60_000,
        }),
      }),
    );
    expect(released.ok).toBe(true);
  });
});
