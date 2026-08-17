/** Pages projector → read-only live-show source relay. */

import {
  type AuroraPackageBundle,
  buildAuroraPackageArchive,
  buildManifest,
} from '../shared/aurora-package.ts';
import {
  coalesceAudienceFrames,
  expandAudienceFrame,
  filterAudienceFrame,
  LIVE_SHOW_BATCH_MAX_BYTES,
  LIVE_SHOW_BATCH_MAX_FRAMES,
  type LiveStateBatch,
  type LiveStateFrame,
  showSocketUrl,
} from '../shared/live-show.ts';
import { loadHostShowSession } from '../shared/live-show-client.ts';
import { getAuthoredPackage } from '../shared/package-channel.ts';
import { getThreePackageBundle } from '../shared/three-package-store.ts';

export type PagesLiveSource = { publish: (frame: unknown) => void; close: () => void };

export function mountPagesLiveShowSource(fetchImpl: typeof fetch = fetch): PagesLiveSource {
  let socket: WebSocket | null = null;
  let showId = '';
  let sequence = 0;
  const pending: LiveStateFrame[] = [];
  let timer = 0;
  let heartbeat = 0;
  let connecting = false;
  const uploaded = new Map<string, string>();

  const flush = () => {
    window.clearTimeout(timer);
    timer = 0;
    if (pending.length === 0 || socket?.readyState !== WebSocket.OPEN) return;
    const coalesced = coalesceAudienceFrames(pending.splice(0));
    let frames: LiveStateFrame[] = [];
    const send = () => {
      if (frames.length === 0) return;
      const batch: LiveStateBatch = {
        protocolVersion: 1,
        type: 'live-state',
        sequence: ++sequence,
        sentAt: Date.now(),
        frames,
      };
      socket?.send(JSON.stringify(batch));
      frames = [];
    };
    for (const frame of coalesced) {
      const candidate = [...frames, frame];
      if (
        frames.length >= LIVE_SHOW_BATCH_MAX_FRAMES ||
        new TextEncoder().encode(JSON.stringify(candidate)).byteLength >
          LIVE_SHOW_BATCH_MAX_BYTES - 256
      ) {
        send();
      }
      frames.push(frame);
    }
    send();
    if (pending.length > 0) timer = window.setTimeout(flush, 0);
  };

  const enqueue = (frame: LiveStateFrame) => {
    pending.push(frame);
    if (pending.length >= 50) flush();
    else if (!timer) timer = window.setTimeout(flush, 50);
  };

  const uploadPackage = async (slug: string): Promise<boolean> => {
    const session = loadHostShowSession();
    const metadata = getAuthoredPackage(slug);
    if (!session || !metadata) return false;
    if (uploaded.get(slug) === metadata.updatedAt) return true;
    let bundle: AuroraPackageBundle;
    if (metadata.target === 'threejs') {
      const three = await getThreePackageBundle(slug).catch(() => null);
      if (!three) return false;
      bundle = three;
    } else {
      bundle = {
        manifest: buildManifest({
          slug: metadata.slug,
          label: metadata.label,
          character: metadata.character,
          uiGroup: metadata.uiGroup,
          wgslForm: 'show',
        }),
        wgsl: metadata.wgsl ?? '',
        defaults: metadata.defaults,
      };
    }
    const bytes = buildAuroraPackageArchive(bundle);
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const response = await fetchImpl(
      `${session.liveApiUrl}/api/shows/${encodeURIComponent(session.show.id)}/packages/${encodeURIComponent(slug)}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${session.hostToken}`,
          'content-type': 'application/zip',
        },
        body,
      },
    );
    if (response.ok) uploaded.set(slug, metadata.updatedAt);
    return response.ok;
  };

  const publish = (raw: unknown) => {
    const frame = filterAudienceFrame(raw);
    if (!frame) return;
    if (frame.address !== '/aurora/control/state') {
      for (const expanded of expandAudienceFrame(frame)) enqueue(expanded);
      return;
    }
    const state = frame.args?.[0] as
      | { deckAPresetSlug?: unknown; deckBPresetSlug?: unknown }
      | undefined;
    const slugs = [state?.deckAPresetSlug, state?.deckBPresetSlug].filter(
      (slug): slug is string => typeof slug === 'string' && Boolean(getAuthoredPackage(slug)),
    );
    // Package archives become visible to viewers before the selecting state.
    void Promise.all(slugs.map(uploadPackage)).then((results) => {
      if (results.every(Boolean)) enqueue(frame);
    });
  };

  const connect = () => {
    const session = loadHostShowSession();
    if (!session || session.show.endsAt <= Date.now()) return;
    if (session.show.id === showId && (socket || connecting)) return;
    connecting = true;
    showId = session.show.id;
    uploaded.clear();
    try {
      socket?.close();
    } catch {
      /* closing */
    }
    socket = new WebSocket(
      showSocketUrl(session.liveApiUrl, session.show.id, session.sourceToken, 'source'),
    );
    socket.onopen = () => {
      connecting = false;
      window.clearInterval(heartbeat);
      heartbeat = window.setInterval(
        () => enqueue({ address: '/aurora/osc/connected', args: [1] }),
        15_000,
      );
      flush();
    };
    socket.onclose = () => {
      socket = null;
      connecting = false;
      window.clearInterval(heartbeat);
    };
    socket.onerror = () => {
      connecting = false;
    };
  };

  const poll = window.setInterval(connect, 1_000);
  connect();
  return {
    publish,
    close() {
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        /* closed */
      }
      socket = null;
    },
  };
}
