/** Local source publisher and management client for the public live-show API. */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  coalesceAudienceFrames,
  expandAudienceFrame,
  filterAudienceFrame,
  type HostShowSession,
  LIVE_SHOW_BATCH_INTERVAL_MS,
  LIVE_SHOW_BATCH_MAX_BYTES,
  LIVE_SHOW_BATCH_MAX_FRAMES,
  LIVE_SHOW_DEFAULT_DURATION_MS,
  LIVE_SHOW_PROTOCOL_VERSION,
  LIVE_SHOW_SOURCE_HEARTBEAT_MS,
  type LiveStateBatch,
  type LiveStateFrame,
  normalizeShowName,
  resolveShowIngress,
  type ShowAccess,
  type ShowIngress,
  type ShowRuntime,
  showSocketUrl,
} from '../shared/live-show.ts';
import { normalizeRelayBaseUrl } from '../shared/relay-protocol.ts';

type FetchLike = typeof fetch;

export class AudienceFrameBatcher {
  private pending: LiveStateFrame[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly emit: (batch: LiveStateFrame[]) => void,
    private readonly intervalMs = LIVE_SHOW_BATCH_INTERVAL_MS,
  ) {}

  push(raw: unknown): boolean {
    const frame = filterAudienceFrame(raw);
    if (!frame) return false;
    const expanded = expandAudienceFrame(frame);
    if (expanded.length === 0) return false;
    for (const part of expanded) {
      if (
        new TextEncoder().encode(JSON.stringify(part)).byteLength >
        LIVE_SHOW_BATCH_MAX_BYTES - 256
      ) {
        return false;
      }
      this.pending.push(part);
    }
    if (this.pending.length >= LIVE_SHOW_BATCH_MAX_FRAMES) this.flush();
    else if (this.timer === null) this.timer = setTimeout(() => this.flush(), this.intervalMs);
    return true;
  }

  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.length === 0) return;
    const frames = coalesceAudienceFrames(this.pending);
    this.pending = [];
    // A single frame is bounded in push(). Split conservatively if aggregate
    // JSON overhead crosses the Worker envelope limit.
    let batch: LiveStateFrame[] = [];
    for (const frame of frames) {
      const candidate = [...batch, frame];
      if (
        new TextEncoder().encode(JSON.stringify(candidate)).byteLength >
        LIVE_SHOW_BATCH_MAX_BYTES - 256
      ) {
        if (batch.length > 0) this.emit(batch);
        batch = [frame];
      } else batch = candidate;
    }
    if (batch.length > 0) this.emit(batch);
  }

  close(): void {
    this.flush();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

export type LiveShowManagerOptions = {
  apiUrl?: string;
  publicUrl?: string;
  tunnelToken?: string;
  ingress?: ShowIngress;
  runtime: Extract<ShowRuntime, 'docker' | 'native'>;
  persistenceFile: string;
  fetchImpl?: FetchLike;
};

type PersistedSession = HostShowSession & { proof?: string };

export class LiveShowManager {
  private readonly apiUrl: string | null;
  private readonly publicUrl: string | null;
  private readonly fetchImpl: FetchLike;
  private session: PersistedSession | null = null;
  private source: WebSocket | null = null;
  private sourceConnected = false;
  private sourceGeneration = 0;
  private sequence = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private proofValue = '';
  private readonly batcher: AudienceFrameBatcher;

  constructor(private readonly options: LiveShowManagerOptions) {
    this.apiUrl = normalizeRelayBaseUrl(options.apiUrl ?? '') ?? null;
    const publicUrl = normalizeRelayBaseUrl(options.publicUrl ?? '');
    this.publicUrl = publicUrl && new URL(publicUrl).protocol === 'https:' ? publicUrl : null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.batcher = new AudienceFrameBatcher((frames) => this.sendBatch(frames));
    this.restore();
  }

  configuration() {
    const missing: string[] = [];
    const ingress = resolveShowIngress(
      this.options.ingress,
      Boolean(this.options.tunnelToken?.trim()),
    );
    if (!this.apiUrl) missing.push('AURORA_LIVE_API_URL');
    if (!this.publicUrl) missing.push('AURORA_SHOW_PUBLIC_URL');
    if (ingress === 'cloudflare' && !this.options.tunnelToken?.trim())
      missing.push('CLOUDFLARE_TUNNEL_TOKEN');
    return {
      enabled: missing.length === 0,
      missing,
      apiUrl: this.apiUrl,
      publicUrl: this.publicUrl,
      runtime: this.options.runtime,
      ingress,
    };
  }

  proof(): string {
    return this.proofValue;
  }

  publish(frame: unknown): void {
    if (!this.session || this.session.show.endsAt <= Date.now()) return;
    this.batcher.push(frame);
  }

  async start(input: {
    name?: unknown;
    access?: unknown;
    durationMs?: unknown;
  }): Promise<Response> {
    const config = this.configuration();
    if (!config.enabled || !this.apiUrl || !this.publicUrl) {
      return Response.json(
        {
          ok: false,
          error: `Live show publishing is disabled. Set ${config.missing.join(', ')} and restart Aurora.`,
          configuration: config,
        },
        { status: 503 },
      );
    }
    if (this.session && this.session.show.endsAt > Date.now()) {
      return Response.json({ ok: false, error: 'a live show is already running' }, { status: 409 });
    }
    const name = normalizeShowName(input.name);
    const access: ShowAccess = input.access === 'closed' ? 'closed' : 'open';
    if (!name) return Response.json({ ok: false, error: 'show name is required' }, { status: 400 });

    const registration = await this.requestJson<{
      registrationId: string;
      challenge: string;
    }>(`${this.apiUrl}/api/show-registrations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publicUrl: this.publicUrl }),
    });
    if (!registration.ok) return registration.response;
    this.proofValue = registration.value.challenge;

    const created = await this.requestJson<HostShowSession>(`${this.apiUrl}/api/shows`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        access,
        durationMs: Number(input.durationMs) || LIVE_SHOW_DEFAULT_DURATION_MS,
        runtime: this.options.runtime,
        publicUrl: this.publicUrl,
        registrationId: registration.value.registrationId,
      }),
    });
    if (!created.ok) {
      this.proofValue = '';
      return created.response;
    }
    this.session = { ...created.value, proof: this.proofValue };
    this.persist();
    this.connectSource();
    return Response.json({ ok: true, session: this.session });
  }

  async status(): Promise<Response> {
    const configuration = this.configuration();
    if (!this.session)
      return Response.json({ ok: true, configuration, session: null, sourceConnected: false });
    if (this.session.show.endsAt <= Date.now()) {
      this.clear();
      return Response.json({ ok: true, configuration, session: null, sourceConnected: false });
    }
    if (!this.apiUrl)
      return Response.json({
        ok: true,
        configuration,
        session: this.session,
        sourceConnected: false,
      });
    const response = await this.fetchImpl(
      `${this.apiUrl}/api/shows/${encodeURIComponent(this.session.show.id)}/manage`,
      { headers: { authorization: `Bearer ${this.session.hostToken}` } },
    ).catch(() => null);
    if (response?.status === 410 || response?.status === 404) this.clear();
    const remote = response?.ok ? await response.json().catch(() => null) : null;
    return Response.json({
      ok: true,
      configuration,
      session: this.session,
      sourceConnected: this.sourceConnected,
      remote,
    });
  }

  async stop(): Promise<Response> {
    if (!this.session || !this.apiUrl) return Response.json({ ok: true });
    const response = await this.fetchImpl(
      `${this.apiUrl}/api/shows/${encodeURIComponent(this.session.show.id)}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${this.session.hostToken}` } },
    ).catch(() => null);
    this.clear();
    return response && !response.ok
      ? Response.json(
          { ok: false, error: `live API returned HTTP ${response.status}` },
          { status: response.status },
        )
      : Response.json({ ok: true });
  }

  async rotateCode(): Promise<Response> {
    if (!this.session || !this.apiUrl)
      return Response.json({ ok: false, error: 'no live show' }, { status: 404 });
    const response = await this.fetchImpl(
      `${this.apiUrl}/api/shows/${encodeURIComponent(this.session.show.id)}/code/rotate`,
      { method: 'POST', headers: { authorization: `Bearer ${this.session.hostToken}` } },
    );
    const payload = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
    if (!response.ok) return Response.json(payload, { status: response.status });
    this.session.code = payload.code;
    this.persist();
    return Response.json({ ok: true, code: payload.code });
  }

  async uploadPackage(slug: string, request: Request): Promise<Response> {
    if (!this.session || !this.apiUrl)
      return Response.json({ ok: false, error: 'no live show' }, { status: 404 });
    return this.fetchImpl(
      `${this.apiUrl}/api/shows/${encodeURIComponent(this.session.show.id)}/packages/${encodeURIComponent(slug)}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${this.session.hostToken}`,
          'content-type': request.headers.get('content-type') ?? 'application/zip',
        },
        body: request.body,
        duplex: 'half',
      } as RequestInit,
    );
  }

  close(): void {
    this.batcher.close();
    this.disconnectSource();
  }

  private sendBatch(frames: LiveStateFrame[]): void {
    if (!this.source || this.source.readyState !== WebSocket.OPEN) return;
    const batch: LiveStateBatch = {
      protocolVersion: LIVE_SHOW_PROTOCOL_VERSION,
      type: 'live-state',
      sequence: ++this.sequence,
      sentAt: Date.now(),
      frames,
    };
    const encoded = JSON.stringify(batch);
    if (new TextEncoder().encode(encoded).byteLength <= LIVE_SHOW_BATCH_MAX_BYTES)
      this.source.send(encoded);
  }

  private connectSource(): void {
    if (!this.session || !this.apiUrl || this.session.show.endsAt <= Date.now()) return;
    this.disconnectSource();
    const generation = ++this.sourceGeneration;
    const socket = new WebSocket(
      showSocketUrl(this.apiUrl, this.session.show.id, this.session.sourceToken, 'source'),
    );
    this.source = socket;
    socket.onopen = () => {
      if (generation !== this.sourceGeneration) return;
      this.sourceConnected = true;
      this.heartbeat = setInterval(() => {
        // An empty, safe connected frame is both source liveness and useful
        // viewer state. The Worker does not accept opaque pings from sources.
        this.batcher.push({ address: '/aurora/osc/connected', args: [1] });
      }, LIVE_SHOW_SOURCE_HEARTBEAT_MS);
    };
    socket.onclose = () => {
      if (generation !== this.sourceGeneration) return;
      this.sourceConnected = false;
      if (this.heartbeat !== null) clearInterval(this.heartbeat);
      this.heartbeat = null;
      if (this.session && this.session.show.endsAt > Date.now()) {
        setTimeout(() => this.connectSource(), 1_000);
      }
    };
    socket.onerror = () => {
      if (generation !== this.sourceGeneration) return;
      this.sourceConnected = false;
    };
  }

  private disconnectSource(): void {
    this.sourceGeneration += 1;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const source = this.source;
    this.source = null;
    this.sourceConnected = false;
    try {
      source?.close();
    } catch {
      /* closed */
    }
  }

  private restore(): void {
    if (!existsSync(this.options.persistenceFile)) return;
    try {
      const value = JSON.parse(
        readFileSync(this.options.persistenceFile, 'utf8'),
      ) as PersistedSession;
      if (
        value.show?.id &&
        value.hostToken &&
        value.sourceToken &&
        value.show.endsAt > Date.now()
      ) {
        this.session = value;
        this.proofValue = value.proof ?? '';
        queueMicrotask(() => this.connectSource());
      } else unlinkSync(this.options.persistenceFile);
    } catch {
      try {
        unlinkSync(this.options.persistenceFile);
      } catch {
        /* ignore */
      }
    }
  }

  private persist(): void {
    if (!this.session) return;
    mkdirSync(dirname(this.options.persistenceFile), { recursive: true });
    writeFileSync(this.options.persistenceFile, `${JSON.stringify(this.session)}\n`, {
      mode: 0o600,
    });
  }

  private clear(): void {
    this.disconnectSource();
    this.session = null;
    this.proofValue = '';
    try {
      unlinkSync(this.options.persistenceFile);
    } catch {
      /* absent */
    }
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
    try {
      const response = await this.fetchImpl(url, init);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        return { ok: false, response: Response.json(payload, { status: response.status }) };
      return { ok: true, value: payload as T };
    } catch (error) {
      return {
        ok: false,
        response: Response.json(
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          { status: 502 },
        ),
      };
    }
  }
}
