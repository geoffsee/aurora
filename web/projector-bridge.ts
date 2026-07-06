import {
	createBroadcastChannelTransport,
	createWebSocketTransport,
	type BridgeTransport,
	type OscFrame,
} from "../shared/bridge-transport.ts";

/** True when an embedded preview can share the controls page origin. */
export function shouldUseBroadcastChannel(
	loc: Pick<Location, "search"> = location,
	win: Pick<Window, "parent"> = window,
): boolean {
	if (new URLSearchParams(loc.search).get("embed") !== "1") return false;
	if (typeof BroadcastChannel === "undefined") return false;
	try {
		return win.parent !== win && win.parent.location.origin === location.origin;
	} catch {
		return false;
	}
}

export function createProjectorTransport(
	loc: Pick<Location, "protocol" | "host" | "search"> = location,
): BridgeTransport {
	if (shouldUseBroadcastChannel(loc)) {
		return createBroadcastChannelTransport({ role: "subscribe-only" });
	}
	const scheme = loc.protocol === "https:" ? "wss" : "ws";
	return createWebSocketTransport(`${scheme}://${loc.host}/ws`, {
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
