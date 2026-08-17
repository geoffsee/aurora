/** Versioned public contract for Aurora's read-only live-show directory. */

export const LIVE_SHOW_PROTOCOL_VERSION = 1 as const;
export const LIVE_SHOW_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1_000;
export const LIVE_SHOW_MIN_DURATION_MS = 15 * 60 * 1_000;
export const LIVE_SHOW_MAX_DURATION_MS = 24 * 60 * 60 * 1_000;
export const LIVE_SHOW_BATCH_INTERVAL_MS = 50;
export const LIVE_SHOW_BATCH_MAX_FRAMES = 50;
export const LIVE_SHOW_BATCH_MAX_BYTES = 64 * 1_024;
export const LIVE_SHOW_SOURCE_HEARTBEAT_MS = 15_000;
export const LIVE_SHOW_ORIGIN_PROBE_MS = 30_000;
export const LIVE_SHOW_OFFLINE_GRACE_MS = 60_000;
export const LIVE_SHOW_MAX_VIEWERS = 1_000;
export const LIVE_SHOW_MAX_PACKAGE_BYTES = 128 * 1_024 * 1_024;
/** Matches the `.aurora-package` parser's per-archive limit. */
export const LIVE_SHOW_MAX_PACKAGE_ARCHIVE_BYTES = 64 * 1_024 * 1_024;
export const LIVE_SHOW_MAX_PACKAGES = 2;
export const LIVE_SHOW_SHADER_CHUNK_ADDRESS = '/aurora/shader/imported/chunk';
export const LIVE_SHOW_SOURCE_STATUS_ADDRESS = '/aurora/live/source';
const LIVE_SHOW_SHADER_CHUNK_BYTES = 24 * 1_024;

export type ShowAccess = 'open' | 'closed';
export type ShowRuntime = 'docker' | 'native' | 'pages';
export type ShowIngress = 'cloudflare' | 'external';

export function resolveShowIngress(value: unknown, hasCloudflareToken: boolean): ShowIngress {
  if (value === 'cloudflare' || value === 'external') return value;
  return hasCloudflareToken ? 'cloudflare' : 'external';
}

export type PublicShowSummary = {
  protocolVersion: typeof LIVE_SHOW_PROTOCOL_VERSION;
  id: string;
  name: string;
  access: ShowAccess;
  runtime: ShowRuntime;
  startedAt: number;
  endsAt: number;
  sourceOnline: boolean;
  originOnline: boolean;
  viewerCount: number;
};

export type HostShowSession = {
  protocolVersion: typeof LIVE_SHOW_PROTOCOL_VERSION;
  show: PublicShowSummary;
  hostToken: string;
  sourceToken: string;
  /** Returned once for a closed show. The Worker stores only its salted digest. */
  code?: string;
  liveApiUrl: string;
};

export type ViewerGrant = {
  protocolVersion: typeof LIVE_SHOW_PROTOCOL_VERSION;
  show: PublicShowSummary;
  viewerToken: string;
  expiresAt: number;
  socketUrl: string;
  /** Isolated renderer URL; credentials are carried in the fragment only. */
  viewerUrl: string;
};

export type LiveStateFrame = {
  address: string;
  args?: unknown[];
  error?: unknown;
  id?: number;
};

export type LiveStateBatch = {
  protocolVersion: typeof LIVE_SHOW_PROTOCOL_VERSION;
  type: 'live-state';
  sequence: number;
  sentAt: number;
  frames: LiveStateFrame[];
};

export type LiveStateSnapshot = {
  protocolVersion: typeof LIVE_SHOW_PROTOCOL_VERSION;
  type: 'live-snapshot';
  sequence: number;
  sentAt: number;
  frames: LiveStateFrame[];
};

export type ShowListResponse = {
  protocolVersion: typeof LIVE_SHOW_PROTOCOL_VERSION;
  shows: PublicShowSummary[];
  cursor?: string;
};

export type ShowRegistration = {
  registrationId: string;
  challenge: string;
  expiresAt: number;
  wellKnownUrl: string;
};

export const LIVE_SHOW_PATHS = {
  shows: '/api/shows',
  registrations: '/api/show-registrations',
  socket: '/api/socket',
  viewer: '/viewer/',
} as const;

/** Frames the renderer consumes and that contain no control-plane authority. */
const SAFE_EXACT_ADDRESSES = new Set([
  '/aurora/control/state',
  '/aurora/demo/audio',
  '/aurora/audio/features',
  '/aurora/audio/spectrum',
  '/aurora/shader/imported',
  LIVE_SHOW_SHADER_CHUNK_ADDRESS,
  '/aurora/osc/connected',
  '/live/song/get/tempo',
  '/live/song/get/is_playing',
  '/live/song/get/beat',
  '/live/song/get/track_data',
  '/live/song/get/num_tracks',
]);

/** Values where only the newest value in one 50 ms batch affects rendering. */
const REPLACEABLE_ADDRESSES = new Set([
  '/aurora/control/state',
  '/aurora/demo/audio',
  '/aurora/audio/features',
  '/aurora/audio/spectrum',
  '/aurora/osc/connected',
  '/live/song/get/tempo',
  '/live/song/get/is_playing',
  '/live/song/get/beat',
  '/live/song/get/track_data',
  '/live/song/get/num_tracks',
]);

export function isAudienceSafeFrame(frame: unknown): frame is LiveStateFrame {
  if (!frame || typeof frame !== 'object') return false;
  const address = (frame as { address?: unknown }).address;
  return typeof address === 'string' && SAFE_EXACT_ADDRESSES.has(address);
}

export function filterAudienceFrame(frame: unknown): LiveStateFrame | null {
  if (!isAudienceSafeFrame(frame)) return null;
  return {
    address: frame.address,
    ...(Array.isArray(frame.args) ? { args: frame.args } : {}),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Split an oversized imported WGSL frame into bounded, audience-safe frames. */
export function expandAudienceFrame(frame: LiveStateFrame): LiveStateFrame[] {
  if (frame.address !== '/aurora/shader/imported') return [frame];
  if (
    new TextEncoder().encode(JSON.stringify(frame)).byteLength <=
    LIVE_SHOW_BATCH_MAX_BYTES - 256
  ) {
    return [frame];
  }
  const payload = frame.args?.[0];
  if (!payload || typeof payload !== 'object') return [];
  const { wgsl, meta } = payload as { wgsl?: unknown; meta?: unknown };
  if (typeof wgsl !== 'string') return [];
  const bytes = new TextEncoder().encode(wgsl);
  const total = Math.ceil(bytes.byteLength / LIVE_SHOW_SHADER_CHUNK_BYTES);
  if (total < 1 || total > 256) return [];
  const transferId = crypto.randomUUID();
  const chunks: LiveStateFrame[] = [];
  for (let index = 0; index < total; index += 1) {
    const start = index * LIVE_SHOW_SHADER_CHUNK_BYTES;
    chunks.push({
      address: LIVE_SHOW_SHADER_CHUNK_ADDRESS,
      args: [
        {
          transferId,
          index,
          total,
          data: bytesToBase64(bytes.subarray(start, start + LIVE_SHOW_SHADER_CHUNK_BYTES)),
          ...(index === 0 && meta !== undefined ? { meta } : {}),
        },
      ],
    });
  }
  return chunks;
}

/** Reassemble shader chunks while passing normal renderer frames through. */
export function createAudienceFrameAssembler(): (frame: LiveStateFrame) => LiveStateFrame[] {
  const transfers = new Map<
    string,
    { chunks: Array<Uint8Array | undefined>; meta?: unknown; received: number; createdAt: number }
  >();
  return (frame) => {
    if (frame.address !== LIVE_SHOW_SHADER_CHUNK_ADDRESS) return [frame];
    const raw = frame.args?.[0];
    if (!raw || typeof raw !== 'object') return [];
    const value = raw as Record<string, unknown>;
    const transferId = typeof value.transferId === 'string' ? value.transferId : '';
    const index = Number(value.index);
    const total = Number(value.total);
    const data = typeof value.data === 'string' ? value.data : '';
    if (
      !transferId ||
      transferId.length > 80 ||
      !Number.isInteger(index) ||
      !Number.isInteger(total) ||
      index < 0 ||
      total < 1 ||
      total > 256 ||
      index >= total ||
      data.length > 48 * 1_024
    ) {
      return [];
    }
    const bytes = base64ToBytes(data);
    if (!bytes || bytes.byteLength > LIVE_SHOW_SHADER_CHUNK_BYTES) return [];
    const now = Date.now();
    for (const [id, transfer] of transfers) {
      if (now - transfer.createdAt > LIVE_SHOW_OFFLINE_GRACE_MS) transfers.delete(id);
    }
    let transfer = transfers.get(transferId);
    if (!transfer || transfer.chunks.length !== total) {
      transfer = { chunks: new Array(total), received: 0, createdAt: now };
      transfers.set(transferId, transfer);
    }
    if (!transfer.chunks[index]) {
      transfer.chunks[index] = bytes;
      transfer.received += 1;
    }
    if (index === 0 && 'meta' in value) transfer.meta = value.meta;
    if (transfer.received !== total) return [];
    transfers.delete(transferId);
    const byteLength = transfer.chunks.reduce((sum, chunk) => sum + (chunk?.byteLength ?? 0), 0);
    const joined = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of transfer.chunks) {
      if (!chunk) return [];
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return [
      {
        address: '/aurora/shader/imported',
        args: [{ wgsl: new TextDecoder().decode(joined), meta: transfer.meta }],
      },
    ];
  };
}

export function isReplaceableAudienceFrame(frame: LiveStateFrame): boolean {
  return REPLACEABLE_ADDRESSES.has(frame.address);
}

/**
 * Coalesce high-rate state/meters while preserving every ordered cue, flash,
 * reset, and imported-shader event in its original position.
 */
export function coalesceAudienceFrames(frames: readonly LiveStateFrame[]): LiveStateFrame[] {
  const last = new Map<string, number>();
  const orderedControlIndices = new Set<number>();
  let priorControlEvent = '';
  let priorControlIndex = -1;
  frames.forEach((frame, index) => {
    if (frame.address === '/aurora/control/state') {
      const state = frame.args?.[0];
      if (state && typeof state === 'object') {
        const value = state as Record<string, unknown>;
        const event = `${Number(value.cueVersion) || 0}:${Number(value.flashVersion) || 0}:${Number(value.resetVersion) || 0}`;
        // Preserve the final state for every distinct event version. Keeping
        // the new frame here would lose the preceding cue if more state for
        // the new version arrived later in the same batch.
        if (priorControlEvent && event !== priorControlEvent && priorControlIndex >= 0) {
          orderedControlIndices.add(priorControlIndex);
        }
        priorControlEvent = event;
        priorControlIndex = index;
      }
    }
    if (isReplaceableAudienceFrame(frame)) last.set(frame.address, index);
  });
  return frames.filter(
    (frame, index) =>
      orderedControlIndices.has(index) ||
      !isReplaceableAudienceFrame(frame) ||
      last.get(frame.address) === index,
  );
}

export function clampShowDuration(value: unknown): number {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return LIVE_SHOW_DEFAULT_DURATION_MS;
  return Math.max(LIVE_SHOW_MIN_DURATION_MS, Math.min(LIVE_SHOW_MAX_DURATION_MS, duration));
}

export function normalizeShowName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function normalizeShowCode(value: unknown): string {
  return typeof value === 'string'
    ? value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8)
    : '';
}

export function isShowAccess(value: unknown): value is ShowAccess {
  return value === 'open' || value === 'closed';
}

export function isShowRuntime(value: unknown): value is ShowRuntime {
  return value === 'docker' || value === 'native' || value === 'pages';
}

export function showSocketUrl(
  liveApiUrl: string,
  showId: string,
  token: string,
  role: 'source' | 'viewer',
): string {
  const url = new URL('/api/socket', liveApiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('session', showId);
  url.searchParams.set('token', token);
  url.searchParams.set('role', role);
  return url.href;
}

export function bearerToken(headers: Headers): string {
  const value = headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() ?? '';
}
