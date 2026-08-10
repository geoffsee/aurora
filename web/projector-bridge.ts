import { withAccessToken } from '../shared/access-token.ts';
import { isControlBridgeConnected, isOscBridgeConnected } from '../shared/bridge-connection.ts';
import {
  type BridgeTransport,
  createBroadcastChannelTransport,
  createWebSocketTransport,
  type OscFrame,
} from '../shared/bridge-transport.ts';
import { loadInstanceTarget } from '../shared/instance-target.ts';
import {
  compiledWireFromAuthoredPackage,
  getAuthoredPackage,
  subscribeAuthoredPackages,
} from '../shared/package-channel.ts';
import { formatPairingCode } from '../shared/pairing-code.ts';
import {
  type HostSession,
  loadHostSession,
  registerHostSession,
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

export { AdaptiveDprGovernor, AuroraThreeDeckHost } from './three-runtime.ts';

export {
  compiledWireFromAuthoredPackage,
  getAuthoredPackage,
  isControlBridgeConnected,
  isOscBridgeConnected,
  isStaticHosting,
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
  if (isStaticHosting(loc)) {
    return `${staticModesApiBase(loc)}/api/modes/compiled/${deck}/${encodeURIComponent(clean)}.json`;
  }
  const params = new URLSearchParams({ deck, slug: clean });
  return `/api/modes/compiled?${params.toString()}`;
}

/** True when an embedded preview can share the controls page origin. */
export function shouldUseBroadcastChannel(
  loc: Pick<Location, 'search' | 'origin'> = location,
  win: Pick<Window, 'parent'> = window,
): boolean {
  if (new URLSearchParams(loc.search).get('embed') !== '1') return false;
  if (typeof BroadcastChannel === 'undefined') return false;
  try {
    return win.parent !== win && win.parent.location.origin === loc.origin;
  } catch {
    return false;
  }
}

/** True when the projector should listen on the shared BroadcastChannel. */
export function shouldSubscribeBroadcastChannel(
  loc: Pick<Location, 'search' | 'hostname' | 'protocol' | 'origin'> = location,
  win: Pick<Window, 'parent'> = window,
): boolean {
  if (typeof BroadcastChannel === 'undefined') return false;
  return isStaticHosting(loc) || shouldUseBroadcastChannel(loc, win);
}

export function createProjectorTransport(
  loc: Pick<Location, 'protocol' | 'host' | 'search' | 'hostname' | 'origin' | 'href'> = location,
  win: Pick<Window, 'parent'> = window,
): BridgeTransport {
  const useBroadcast = shouldSubscribeBroadcastChannel(loc, win);
  if (useBroadcast) {
    return createBroadcastChannelTransport({ role: 'subscribe-only' });
  }
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  // The projector always renders on the machine that served it — only the
  // token is adopted from the instance target, never a remote origin.
  const { token } = loadInstanceTarget(loc as Pick<Location, 'search'>);
  return createWebSocketTransport(withAccessToken(`${scheme}://${loc.host}/ws`, token), {
    reconnect: true,
  });
}

export function attachProjectorTransport(
  transport: BridgeTransport,
  handlers: {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: () => void;
    onMessage: (frame: OscFrame) => void;
  },
): () => void {
  if (handlers.onOpen) transport.onOpen(handlers.onOpen);
  if (handlers.onClose) transport.onClose(handlers.onClose);
  if (handlers.onError) transport.onError(handlers.onError);
  transport.onMessage(handlers.onMessage);
  transport.connect();
  return () => transport.close();
}

const CONTROLS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>`;

const FULLSCREEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;

const EXIT_FULLSCREEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`;

/**
 * Relay host: register a session, show the pairing code, accept guest frames.
 *
 * Only meaningful on the static build — a bridged stack already has a
 * WebSocket bus and does not need a broker. The relay socket is attached
 * *alongside* the existing transport rather than merged into it, so an operator
 * can drive from the same-device controls page and a paired phone at once.
 *
 * Returns a disposer.
 */
export async function mountRelayHost(
  handlers: { onMessage: (frame: OscFrame) => void },
  doc: Document = document,
  loc: Pick<Location, 'search'> = location,
): Promise<() => void> {
  const existing = loadHostSession();
  let session = existing;
  if (!session) {
    const result = await registerHostSession(resolveRelayBaseUrl(loc));
    if (!result.ok) {
      console.warn(`[relay] could not register a session: ${result.error}`);
      return () => {};
    }
    session = result.value;
  }

  const panel = renderPairingPanel(doc, session, async () => {
    const rotated = await rotateHostCode(session as HostSession);
    if (rotated.ok) {
      session = rotated.value;
      panel.setCode(rotated.value.code);
    } else {
      panel.setError(rotated.error);
    }
  });

  const transport = createWebSocketTransport(
    () => socketUrlForSession(session as HostSession, 'host'),
    { reconnect: true },
  );
  let paired = false;
  transport.onMessage((frame) => {
    // A guest frame means someone paired: retire the code rather than leave it
    // burning into the projector all night. The socket stays up.
    if (!paired) {
      paired = true;
      panel.remove();
    }
    handlers.onMessage(frame);
  });
  transport.connect();

  return () => {
    transport.close();
    panel.remove();
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
