import {
  getAudienceCompiledWire,
  loadAudienceCompiledWire,
} from '../shared/audience-package-store.ts';
import { isControlBridgeConnected, isOscBridgeConnected } from '../shared/bridge-connection.ts';
import { createWebSocketTransport, type OscFrame } from '../shared/bridge-transport.ts';
import {
  consumeViewerFragment,
  isAudienceViewer,
  isAudienceViewerSurface,
} from '../shared/live-show-client.ts';
import {
  compiledWireFromAuthoredPackage,
  getAuthoredPackage,
  subscribeAuthoredPackages,
} from '../shared/package-channel.ts';
import { formatPairingCode } from '../shared/pairing-code.ts';
import {
  ensureHostSession,
  type HostSession,
  markGuestPaired,
  resolveRelayBaseUrl,
  rotateHostCode,
  socketUrlForSession,
} from '../shared/relay-session.ts';
import { webgpuSecureContextError } from '../shared/secure-context.ts';
import {
  geoffseePagesControlsUrl,
  isGeoffseeGithubPages,
  isStaticHosting,
  staticModesApiBase,
  staticSitePathPrefix,
} from '../shared/static-hosting.ts';
import { getThreePackageBundle } from '../shared/three-package-store.ts';
import {
  attachDisplayTransport,
  createDisplayTransport,
  shouldSubscribeBroadcastChannel,
  shouldUseBroadcastChannel,
} from './display-transport.ts';

export { mountPagesLiveShowSource } from './pages-live-source.ts';
export { AdaptiveDprGovernor, AuroraThreeDeckHost } from './three-runtime.ts';

export {
  compiledWireFromAuthoredPackage,
  consumeViewerFragment,
  getAuthoredPackage,
  isAudienceViewer,
  isAudienceViewerSurface,
  isControlBridgeConnected,
  isOscBridgeConnected,
  isStaticHosting,
  shouldSubscribeBroadcastChannel,
  shouldUseBroadcastChannel,
  staticModesApiBase,
  staticSitePathPrefix,
  subscribeAuthoredPackages,
  webgpuSecureContextError,
};

/**
 * Resolve a CompiledModeWire for a slug: Studio-authored packages first
 * (localStorage / BroadcastChannel), else null so the caller can HTTP-fetch.
 */
export function resolveAuthoredCompiledWire(
  deck: 'deck-a' | 'deck-b',
  slug: string,
  epoch = 0,
): unknown | null {
  if (isAudienceViewerSurface() || isAudienceViewer()) {
    return getAudienceCompiledWire(deck, slug, epoch);
  }
  const pkg = getAuthoredPackage(slug);
  if (!pkg) return null;
  return compiledWireFromAuthoredPackage(deck, pkg, epoch);
}

/** Async authored resolution adds IndexedDB-backed Three.js executable/assets. */
export async function resolveAuthoredCompiledWireAsync(
  deck: 'deck-a' | 'deck-b',
  slug: string,
  epoch = 0,
): Promise<unknown | null> {
  if (isAudienceViewerSurface() || isAudienceViewer()) {
    return loadAudienceCompiledWire(deck, slug, epoch);
  }
  const metadata = getAuthoredPackage(slug);
  if (!metadata) return null;
  if (metadata.target !== 'threejs') return compiledWireFromAuthoredPackage(deck, metadata, epoch);
  const bundle = await getThreePackageBundle(slug);
  if (!bundle) return null;
  const wire = compiledWireFromAuthoredPackage(deck, metadata, epoch);
  const layer = wire.layers.find((candidate) => candidate.kind === 'threejs');
  if (!layer) return null;
  layer.moduleSource = bundle.javascript;
  layer.sourceMap = bundle.sourceMap;
  layer.assetUrls = Object.fromEntries(
    bundle.manifest.assets.map((asset) => {
      const bytes = bundle.assets[asset.path];
      const copy = bytes ? new Uint8Array(bytes) : new Uint8Array();
      return [asset.path, URL.createObjectURL(new Blob([copy], { type: asset.mediaType }))];
    }),
  );
  return wire;
}

/**
 * URL for a deck's CompiledModeWire.
 * Static Pages: `{siteBase}/api/modes/compiled/{deck}/{slug}.json`
 * Bridge: `/api/modes/compiled?deck=&slug=`
 */
export function projectorCompiledModeUrl(
  deck: 'deck-a' | 'deck-b',
  slug: string,
  loc: Pick<Location, 'protocol' | 'hostname' | 'port' | 'pathname' | 'search'> = location,
): string {
  const clean = typeof slug === 'string' ? slug.trim() : '';
  if (isAudienceViewerSurface(loc)) {
    return `${loc.protocol}//${loc.hostname}${loc.port ? `:${loc.port}` : ''}/viewer/api/modes/compiled/${deck}/${encodeURIComponent(clean)}.json`;
  }
  if (isStaticHosting(loc)) {
    return `${staticModesApiBase(loc)}/api/modes/compiled/${deck}/${encodeURIComponent(clean)}.json`;
  }
  const params = new URLSearchParams({ deck, slug: clean });
  return `/api/modes/compiled?${params.toString()}`;
}

/** Backward-compatible projector names for the generic display transport. */
export const createProjectorTransport = createDisplayTransport;
export const attachProjectorTransport = attachDisplayTransport;

const CONTROLS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>`;

const FULLSCREEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;

const EXIT_FULLSCREEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`;

/**
 * Escape hatch for the projector-only Pages setup: `?pairOverlay=1` puts the
 * code back on the canvas for an operator who never opens Console.
 */
export function pairingOverlayEnabled(loc: Pick<Location, 'search'> = location): boolean {
  try {
    return new URLSearchParams(loc.search ?? '').get('pairOverlay') === '1';
  } catch {
    return false;
  }
}

/**
 * Relay host: register a session, accept guest frames.
 *
 * Only meaningful on the static build — a bridged stack already has a
 * WebSocket bus and does not need a broker. The relay socket is attached
 * *alongside* the existing transport rather than merged into it, so an operator
 * can drive from the same-device controls page and a paired phone at once.
 *
 * The pairing code is Console's to display (#286): it is an ops action, and
 * burning it into the projection put it in every capture and IMAG feed. The
 * projector keeps ownership of the *socket* — it owns the render — and only
 * publishes "a guest is live" through storage for Console to pick up. The
 * overlay survives behind `?pairOverlay=1` for projector-only setups.
 *
 * Returns a disposer.
 */
export async function mountRelayHost(
  handlers: { onMessage: (frame: OscFrame) => void },
  doc: Document = document,
  loc: Pick<Location, 'search'> = location,
): Promise<() => void> {
  if (isAudienceViewer() || isAudienceViewerSurface()) return () => {};
  const result = await ensureHostSession(resolveRelayBaseUrl(loc));
  if (!result.ok) {
    console.warn(`[relay] could not register a session: ${result.error}`);
    return () => {};
  }
  let session = result.value;

  const panel = pairingOverlayEnabled(loc)
    ? renderPairingPanel(doc, session, async () => {
        const rotated = await rotateHostCode(session);
        if (rotated.ok) {
          session = rotated.value;
          panel?.setCode(rotated.value.code);
        } else {
          panel?.setError(rotated.error);
        }
      })
    : null;

  const transport = createWebSocketTransport(() => socketUrlForSession(session, 'host'), {
    reconnect: true,
  });
  let paired = false;
  transport.onMessage((frame) => {
    // A guest frame is the only evidence the relay ever gives that someone
    // paired — it keeps no roster. Record it so Console can retire the code
    // instead of leaving it up for anyone in the room to read.
    if (!paired) {
      paired = true;
      markGuestPaired(session.sessionId, Date.now());
      panel?.remove();
    }
    handlers.onMessage(frame);
  });
  transport.connect();

  return () => {
    transport.close();
    panel?.remove();
  };
}

type PairingPanel = {
  setCode: (code: string) => void;
  setError: (message: string) => void;
  remove: () => void;
};

/** Pairing code overlay — large enough to read from across a room. */
function renderPairingPanel(
  doc: Document,
  session: HostSession,
  onRotate: () => void,
): PairingPanel {
  const wrap = doc.createElement('div');
  wrap.className = 'aurora-pairing';
  wrap.setAttribute('role', 'status');

  const label = doc.createElement('div');
  label.className = 'aurora-pairing__label';
  label.textContent = 'Pair a phone';

  const code = doc.createElement('div');
  code.className = 'aurora-pairing__code';
  code.textContent = formatPairingCode(session.code);

  const hint = doc.createElement('div');
  hint.className = 'aurora-pairing__hint';
  hint.textContent = 'Enter this code in the mobile show client';

  const rotate = doc.createElement('button');
  rotate.type = 'button';
  rotate.className = 'aurora-pairing__rotate';
  rotate.textContent = 'New code';
  rotate.addEventListener('click', onRotate);

  wrap.append(label, code, hint, rotate);
  doc.body.append(wrap);

  // The code is only useful until someone pairs; hide it on the first inbound
  // frame so it is not left burning into a projector all night.
  return {
    setCode(next: string) {
      code.textContent = formatPairingCode(next);
      hint.textContent = 'Enter this code in the mobile show client';
      wrap.classList.remove('aurora-pairing--error');
    },
    setError(message: string) {
      hint.textContent = message;
      wrap.classList.add('aurora-pairing--error');
    },
    remove() {
      wrap.remove();
    },
  };
}

/** Bottom-left glass nav for the published Geoff See GitHub Pages projector. */
export function mountGeoffseePagesNav(
  doc: Document = document,
  loc: Pick<Location, 'href' | 'search'> = location,
): () => void {
  if (!isGeoffseeGithubPages(loc)) return () => {};
  if (new URLSearchParams(loc.search).get('embed') === '1') return () => {};

  const nav = doc.createElement('nav');
  nav.className = 'geoffsee-pages-nav';
  nav.setAttribute('aria-label', 'Site navigation');

  const controls = doc.createElement('a');
  controls.className = 'geoffsee-pages-nav__btn';
  controls.href = geoffseePagesControlsUrl(loc);
  controls.title = 'Open control panel (static preview)';
  controls.setAttribute('aria-label', 'Open control panel');
  controls.innerHTML = CONTROLS_ICON;

  const fullscreen = doc.createElement('button');
  fullscreen.type = 'button';
  fullscreen.className = 'geoffsee-pages-nav__btn';
  fullscreen.title = 'Fullscreen';
  fullscreen.setAttribute('aria-label', 'Fullscreen');
  fullscreen.innerHTML = FULLSCREEN_ICON;

  const stage = doc.querySelector('#stage') ?? doc.documentElement;
  const syncFullscreenIcon = () => {
    const active = doc.fullscreenElement === stage;
    fullscreen.innerHTML = active ? EXIT_FULLSCREEN_ICON : FULLSCREEN_ICON;
    fullscreen.title = active ? 'Exit fullscreen' : 'Fullscreen';
    fullscreen.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Fullscreen');
  };

  fullscreen.addEventListener('click', async () => {
    try {
      if (doc.fullscreenElement === stage) {
        await doc.exitFullscreen();
      } else {
        await stage.requestFullscreen();
      }
    } catch {
      // Ignore if the browser blocks fullscreen.
    }
  });
  doc.addEventListener('fullscreenchange', syncFullscreenIcon);

  nav.append(controls, fullscreen);
  doc.body.append(nav);

  return () => {
    doc.removeEventListener('fullscreenchange', syncFullscreenIcon);
    nav.remove();
  };
}
