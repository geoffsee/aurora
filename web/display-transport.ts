import { withAccessToken } from '../shared/access-token.ts';
import {
  type BridgeTransport,
  createBroadcastChannelTransport,
  createWebSocketTransport,
  type OscFrame,
} from '../shared/bridge-transport.ts';
import { loadInstanceTarget } from '../shared/instance-target.ts';
import { isStaticHosting } from '../shared/static-hosting.ts';

/** True when an embedded display can share its parent controls-page origin. */
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

/** Static displays subscribe to the controls fan-out; live displays use `/ws`. */
export function shouldSubscribeBroadcastChannel(
  loc: Pick<Location, 'search' | 'hostname' | 'protocol' | 'origin'> = location,
  win: Pick<Window, 'parent'> = window,
): boolean {
  if (typeof BroadcastChannel === 'undefined') return false;
  return isStaticHosting(loc) || shouldUseBroadcastChannel(loc, win);
}

export function createDisplayTransport(
  loc: Pick<Location, 'protocol' | 'host' | 'search' | 'hostname' | 'origin' | 'href'> = location,
  win: Pick<Window, 'parent'> = window,
): BridgeTransport {
  if (shouldSubscribeBroadcastChannel(loc, win)) {
    return createBroadcastChannelTransport({ role: 'subscribe-only' });
  }
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  const { token } = loadInstanceTarget(loc as Pick<Location, 'search'>);
  return createWebSocketTransport(withAccessToken(`${scheme}://${loc.host}/ws`, token), {
    reconnect: true,
  });
}

export function attachDisplayTransport(
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
