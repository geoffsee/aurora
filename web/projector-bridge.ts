import {
	createBroadcastChannelTransport,
	createWebSocketTransport,
	type BridgeTransport,
	type OscFrame,
} from "../shared/bridge-transport.ts";
import {
	DEMO_AUDIO_INTERVAL_MS,
	generateDemoAudioFrame,
	type DemoAudioFrame,
} from "../shared/demo-audio.ts";
import { isStaticHosting } from "../shared/static-hosting.ts";

/** True when an embedded preview can share the controls page origin. */
export function shouldUseBroadcastChannel(
	loc: Pick<Location, "search" | "origin"> = location,
	win: Pick<Window, "parent"> = window,
): boolean {
	if (new URLSearchParams(loc.search).get("embed") !== "1") return false;
	if (typeof BroadcastChannel === "undefined") return false;
	try {
		return win.parent !== win && win.parent.location.origin === loc.origin;
	} catch {
		return false;
	}
}

/** Standalone projector on static hosting with no embedded controls parent. */
export function shouldRunStandaloneStaticDemo(
	loc: Pick<Location, "search" | "hostname" | "protocol" | "origin"> = location,
	win: Pick<Window, "parent"> = window,
): boolean {
	return isStaticHosting(loc) && !shouldUseBroadcastChannel(loc, win);
}

export function startStandaloneStaticDemo(
	getBpm: () => number,
	onFrame: (demo: DemoAudioFrame) => void,
	loc: Pick<Location, "search" | "hostname" | "protocol" | "origin"> = location,
	win: Pick<Window, "parent"> = window,
): () => void {
	if (!shouldRunStandaloneStaticDemo(loc, win)) return () => {};
	const tick = () => {
		onFrame(generateDemoAudioFrame(getBpm(), Date.now() / 1000));
	};
	const timer = setInterval(tick, DEMO_AUDIO_INTERVAL_MS);
	tick();
	return () => clearInterval(timer);
}

export function createProjectorTransport(
	loc: Pick<Location, "protocol" | "host" | "search" | "origin"> = location,
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
