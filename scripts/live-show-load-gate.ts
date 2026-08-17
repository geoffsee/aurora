#!/usr/bin/env bun
/** Manual release gate for the public live-show Durable Object fan-out. */

import { showSocketUrl } from '../shared/live-show.ts';

const apiUrl = process.env.AURORA_LIVE_API_URL?.trim() ?? '';
const showId = process.env.AURORA_LOAD_SHOW_ID?.trim() ?? '';
const sourceToken = process.env.AURORA_LOAD_SOURCE_TOKEN?.trim() ?? '';
const viewerToken = process.env.AURORA_LOAD_VIEWER_TOKEN?.trim() ?? '';
const viewerCount = Math.max(2, Number(process.env.AURORA_LOAD_VIEWERS) || 1_000);
const durationMs = Math.max(5_000, Number(process.env.AURORA_LOAD_DURATION_MS) || 15 * 60_000);

if (!apiUrl || !showId || !sourceToken || !viewerToken) {
  console.error(
    'Set AURORA_LIVE_API_URL, AURORA_LOAD_SHOW_ID, AURORA_LOAD_SOURCE_TOKEN, and AURORA_LOAD_VIEWER_TOKEN for a dedicated test show.',
  );
  process.exit(2);
}

type ViewerStats = {
  socket: WebSocket;
  snapshot: boolean;
  live: number;
  orderErrors: number;
  lastSequence: number;
};

function openSocket(url: string, onMessage?: (event: MessageEvent) => void): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    if (onMessage) socket.addEventListener('message', onMessage);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('WebSocket connection timed out'));
    }, 20_000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve(socket);
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket connection failed'));
      },
      { once: true },
    );
  });
}

function liveBatch(sequence: number) {
  return JSON.stringify({
    protocolVersion: 1,
    type: 'live-state',
    sequence,
    sentAt: Date.now(),
    frames: [
      { address: '/live/song/get/tempo', args: [128] },
      { address: '/live/song/get/beat', args: [sequence / 20] },
      { address: '/live/song/get/track_data', args: [0, 0.3, 0.6, 0.2, 0.8] },
      { address: '/aurora/control/state', args: [{ crossfade: (sequence % 20) / 20 }] },
    ],
  });
}

console.log(
  `[live-show-load] opening ${viewerCount} viewers for ${Math.round(durationMs / 1_000)} seconds`,
);
const source = await openSocket(showSocketUrl(apiUrl, showId, sourceToken, 'source'));
source.send(liveBatch(1));
await Bun.sleep(250);

const viewers: ViewerStats[] = [];
const viewerUrl = showSocketUrl(apiUrl, showId, viewerToken, 'viewer');
await Promise.all(
  Array.from({ length: viewerCount }, async (_, index) => {
    const stats: ViewerStats = {
      socket: null as unknown as WebSocket,
      snapshot: false,
      live: 0,
      orderErrors: 0,
      lastSequence: 0,
    };
    // Leave one socket without a message consumer to ensure it cannot block fan-out.
    const socket = await openSocket(
      viewerUrl,
      index === viewerCount - 1
        ? undefined
        : (event) => {
            let envelope: { type?: string; sequence?: number };
            try {
              envelope = JSON.parse(String(event.data)) as { type?: string; sequence?: number };
            } catch {
              return;
            }
            const sequence = Number(envelope.sequence) || 0;
            if (envelope.type === 'live-snapshot') {
              stats.snapshot = true;
              stats.lastSequence = sequence;
            } else if (envelope.type === 'live-state') {
              if (stats.lastSequence > 0 && sequence !== stats.lastSequence + 1)
                stats.orderErrors += 1;
              stats.lastSequence = sequence;
              stats.live += 1;
            }
          },
    );
    stats.socket = socket;
    viewers[index] = stats;
  }),
);

let sent = 0;
let sequence = 1;
const startedAt = Date.now();
const publish = setInterval(() => {
  if (source.readyState !== WebSocket.OPEN) return;
  source.send(liveBatch(++sequence));
  sent += 1;
}, 50);
const progress = setInterval(() => {
  const open = viewers.filter((viewer) => viewer.socket.readyState === WebSocket.OPEN).length;
  console.log(
    `[live-show-load] ${Math.round((Date.now() - startedAt) / 1_000)}s · ${open}/${viewerCount} viewers · ${sent} batches`,
  );
}, 60_000);

await Bun.sleep(durationMs);
clearInterval(publish);
clearInterval(progress);
await Bun.sleep(1_000);

const monitored = viewers.slice(0, -1);
const remaining = viewers.filter((viewer) => viewer.socket.readyState === WebSocket.OPEN).length;
const delivered = monitored.reduce((sum, viewer) => sum + viewer.live, 0);
const orderErrors = monitored.reduce((sum, viewer) => sum + viewer.orderErrors, 0);
const expected = sent * monitored.length;
const remainingRate = remaining / viewerCount;
const orderedDeliveryRate = expected > 0 ? (delivered - orderErrors) / expected : 0;
const snapshots = monitored.filter((viewer) => viewer.snapshot).length;
const passed =
  remainingRate >= 0.99 &&
  orderedDeliveryRate >= 0.999 &&
  snapshots === monitored.length &&
  source.readyState === WebSocket.OPEN;

console.log(
  `[live-show-load] ${passed ? 'PASS' : 'FAIL'} · connected ${(remainingRate * 100).toFixed(2)}% · ordered delivery ${(orderedDeliveryRate * 100).toFixed(3)}% · snapshots ${snapshots}/${monitored.length}`,
);
for (const viewer of viewers) viewer.socket.close(1000, 'load gate complete');
source.close(1000, 'load gate complete');
if (!passed) process.exitCode = 1;
