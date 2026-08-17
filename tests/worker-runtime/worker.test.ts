import { env, runInDurableObject } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';

const worker = (
  exports as unknown as {
    default: { fetch(request: Request): Promise<Response> };
  }
).default;

function nextJsonMessage(socket: WebSocket, predicate: (value: unknown) => boolean) {
  return new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('timed out waiting for websocket frame')),
      2_000,
    );
    socket.addEventListener('message', function listener(event) {
      const value: unknown = JSON.parse(String(event.data));
      if (!predicate(value)) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', listener);
      resolve(value);
    });
  });
}

describe('live-show Worker runtime', () => {
  test('keeps phone relay health backward compatible', async () => {
    const response = await worker.fetch(new Request('https://worker.example/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, protocolVersion: 1 });
  });

  test('serves an empty active directory from the global Durable Object', async () => {
    const response = await worker.fetch(new Request('https://worker.example/api/shows'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ protocolVersion: 1, shows: [] });
  });

  test('streams the content-addressed viewer runtime from reserved R2 storage', async () => {
    const bindings = env as unknown as { LIVE_SHOW_ASSETS: R2Bucket };
    const file = 'aurora-0123456789abcdef.wasm';
    await bindings.LIVE_SHOW_ASSETS.put(
      `viewer-runtime/${file}`,
      new Uint8Array([0, 97, 115, 109]),
    );

    const response = await worker.fetch(
      new Request(`https://worker.example/viewer/runtime/${file}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/wasm');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 97, 115, 109]));
  });

  test('validates show creation before allocating a session', async () => {
    const response = await worker.fetch(
      new Request('https://worker.example/api/shows', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.10' },
        body: JSON.stringify({ name: '', access: 'open', runtime: 'pages' }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'show name is required' });
  });

  test('registration accepts only public HTTPS origins', async () => {
    for (const publicUrl of ['http://show.example', 'https://localhost', 'https://192.168.1.2']) {
      const response = await worker.fetch(
        new Request('https://worker.example/api/show-registrations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ publicUrl }),
        }),
      );
      expect(response.status).toBe(400);
    }
  });

  test('rotates salted closed codes without revoking existing signed viewer grants', async () => {
    const bindings = env as unknown as {
      SHOW_SESSION: DurableObjectNamespace;
      LIVE_SHOW_ASSETS: R2Bucket;
    };
    const showId = crypto.randomUUID();
    const stub = bindings.SHOW_SESSION.get(bindings.SHOW_SESSION.idFromName(showId));
    const endsAt = Date.now() + 60_000;
    const initialized = await stub.fetch('https://relay/init-live', {
      method: 'POST',
      body: JSON.stringify({
        id: showId,
        name: 'Runtime test',
        access: 'closed',
        runtime: 'pages',
        startedAt: Date.now(),
        endsAt,
        code: 'ABCDEFGH',
      }),
    });
    const credentials = (await initialized.json()) as { hostToken: string };
    await runInDurableObject(stub, async (_instance, state) => {
      const record = await state.storage.get<Record<string, unknown>>('session');
      const live = record?.live as Record<string, unknown>;
      live.sourceOnline = true;
      live.originOnline = true;
      live.lastSourceAt = Date.now();
      await state.storage.put('session', record);
    });

    const wrong = await stub.fetch('https://relay/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ZZZZZZZZ' }),
    });
    expect(wrong.status).toBe(401);
    const joined = await stub.fetch('https://relay/join', {
      method: 'POST',
      body: JSON.stringify({ code: 'ABCDEFGH' }),
    });
    const grant = (await joined.json()) as { viewerToken: string };
    expect(grant.viewerToken.split('.')).toHaveLength(2);

    const rotated = await stub.fetch('https://relay/rotate-code', {
      method: 'POST',
      body: JSON.stringify({ hostToken: credentials.hostToken, code: '23456789' }),
    });
    expect(rotated.ok).toBe(true);
    expect(
      (
        await stub.fetch('https://relay/join', {
          method: 'POST',
          body: JSON.stringify({ code: 'ABCDEFGH' }),
        })
      ).status,
    ).toBe(401);

    // The previously issued grant remains valid for packages after rotation.
    const reserve = await stub.fetch('https://relay/package-reserve', {
      method: 'POST',
      body: JSON.stringify({ hostToken: credentials.hostToken, slug: 'test-pack', bytes: 3 }),
    });
    expect(reserve.ok).toBe(true);
    const verified = await stub.fetch('https://relay/verify-package-viewer', {
      method: 'POST',
      body: JSON.stringify({ token: grant.viewerToken, slug: 'test-pack' }),
    });
    expect(await verified.json()).toEqual({ ok: true });
  });

  test('isolates source/viewer sockets, delivers snapshots, and rejects viewer input', async () => {
    const bindings = env as unknown as { SHOW_SESSION: DurableObjectNamespace };
    const showId = crypto.randomUUID();
    const stub = bindings.SHOW_SESSION.get(bindings.SHOW_SESSION.idFromName(showId));
    const initialized = await stub.fetch('https://relay/init-live', {
      method: 'POST',
      body: JSON.stringify({
        id: showId,
        name: 'Socket roles',
        access: 'open',
        runtime: 'pages',
        startedAt: Date.now(),
        endsAt: Date.now() + 60_000,
      }),
    });
    const credentials = (await initialized.json()) as { sourceToken: string };
    const sourceResponse = await stub.fetch(
      `https://relay/socket?role=source&token=${encodeURIComponent(credentials.sourceToken)}`,
      { headers: { Upgrade: 'websocket' } },
    );
    const source = sourceResponse.webSocket;
    expect(sourceResponse.status).toBe(101);
    expect(source).toBeTruthy();
    source?.accept();

    const joined = await stub.fetch('https://relay/join', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const grant = (await joined.json()) as { viewerToken: string };
    const viewerResponse = await stub.fetch(
      `https://relay/socket?role=viewer&token=${encodeURIComponent(grant.viewerToken)}`,
      { headers: { Upgrade: 'websocket' } },
    );
    const viewer = viewerResponse.webSocket;
    expect(viewerResponse.status).toBe(101);
    expect(viewer).toBeTruthy();
    viewer?.accept();

    const liveMessage = nextJsonMessage(
      viewer as WebSocket,
      (value) => (value as { type?: unknown })?.type === 'live-state',
    );
    source?.send(
      JSON.stringify({
        protocolVersion: 1,
        type: 'live-state',
        sequence: 1,
        sentAt: Date.now(),
        frames: [{ address: '/aurora/control/state', args: [{ crossfade: 0.25 }] }],
      }),
    );
    expect(await liveMessage).toMatchObject({
      type: 'live-state',
      frames: [{ address: '/aurora/control/state' }],
    });

    const secondViewerResponse = await stub.fetch(
      `https://relay/socket?role=viewer&token=${encodeURIComponent(grant.viewerToken)}`,
      { headers: { Upgrade: 'websocket' } },
    );
    const secondViewer = secondViewerResponse.webSocket as WebSocket;
    const snapshot = nextJsonMessage(
      secondViewer,
      (value) => (value as { type?: unknown })?.type === 'live-snapshot',
    );
    secondViewer.accept();
    expect(await snapshot).toMatchObject({
      type: 'live-snapshot',
      frames: [{ address: '/aurora/control/state' }],
    });

    const closed = new Promise<CloseEvent>((resolve) =>
      viewer?.addEventListener('close', (event) => resolve(event)),
    );
    viewer?.send(JSON.stringify({ address: '/aurora/control/state', args: [{}] }));
    expect((await closed).code).toBe(1008);
    source?.close(1000, 'done');
    secondViewer.close(1000, 'done');
  });

  test('preserves one-time phone pairing registration alongside live-show APIs', async () => {
    const registered = await worker.fetch(
      new Request('https://worker.example/api/session', {
        method: 'POST',
      }),
    );
    expect(registered.status).toBe(200);
    const session = (await registered.json()) as { code: string; sessionId: string };
    const paired = await worker.fetch(
      new Request('https://worker.example/api/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: session.code }),
      }),
    );
    expect(await paired.json()).toMatchObject({ sessionId: session.sessionId });
  });
});
