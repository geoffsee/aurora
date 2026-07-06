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
import {
	geoffseePagesControlsUrl,
	isGeoffseeGithubPages,
	isStaticHosting,
} from "../shared/static-hosting.ts";

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

/** True when the projector should listen on the shared BroadcastChannel. */
export function shouldSubscribeBroadcastChannel(
	loc: Pick<Location, "search" | "hostname" | "protocol" | "origin"> = location,
	win: Pick<Window, "parent"> = window,
): boolean {
	if (typeof BroadcastChannel === "undefined") return false;
	return isStaticHosting(loc) || shouldUseBroadcastChannel(loc, win);
}

/** Standalone projector on static hosting with no bridge from controls. */
export function shouldRunStandaloneStaticDemo(
	loc: Pick<Location, "search" | "hostname" | "protocol" | "origin"> = location,
	win: Pick<Window, "parent"> = window,
): boolean {
	return isStaticHosting(loc) && !shouldSubscribeBroadcastChannel(loc, win);
}

export const STATIC_BRIDGE_FALLBACK_MS = 2500;

const runDemoLoop = (
	getBpm: () => number,
	onFrame: (demo: DemoAudioFrame) => void,
): (() => void) => {
	const tick = () => {
		onFrame(generateDemoAudioFrame(getBpm(), Date.now() / 1000));
	};
	const timer = setInterval(tick, DEMO_AUDIO_INTERVAL_MS);
	tick();
	return () => clearInterval(timer);
};

export type StaticProjectorDemoHandle = {
	/** Call when a bridge frame arrives so the projector-only demo stays off. */
	notifyBridgeActivity(): void;
	dispose(): void;
};

/** Demo loop for static hosting; waits for controls over BroadcastChannel first. */
export function startStaticProjectorDemo(
	getBpm: () => number,
	onFrame: (demo: DemoAudioFrame) => void,
	options: {
		onFallbackDemo?: () => void;
		fallbackMs?: number;
		loc?: Pick<Location, "search" | "hostname" | "protocol" | "origin">;
		win?: Pick<Window, "parent">;
	} = {},
): StaticProjectorDemoHandle {
	const loc = options.loc ?? location;
	const win = options.win ?? window;
	let stopDemo = () => {};
	let bridgeSeen = false;

	const startDemo = () => {
		options.onFallbackDemo?.();
		stopDemo();
		stopDemo = runDemoLoop(getBpm, onFrame);
	};

	const fallbackTimer =
		isStaticHosting(loc) && shouldSubscribeBroadcastChannel(loc, win)
			? setTimeout(() => {
					if (!bridgeSeen) startDemo();
				}, options.fallbackMs ?? STATIC_BRIDGE_FALLBACK_MS)
			: null;

	if (shouldRunStandaloneStaticDemo(loc, win)) {
		startDemo();
	}

	return {
		notifyBridgeActivity() {
			if (bridgeSeen) return;
			bridgeSeen = true;
			if (fallbackTimer !== null) clearTimeout(fallbackTimer);
			stopDemo();
		},
		dispose() {
			if (fallbackTimer !== null) clearTimeout(fallbackTimer);
			stopDemo();
		},
	};
}

export function createProjectorTransport(
	loc: Pick<Location, "protocol" | "host" | "search" | "hostname" | "origin"> = location,
	win: Pick<Window, "parent"> = window,
): BridgeTransport {
	if (shouldSubscribeBroadcastChannel(loc, win)) {
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

const CONTROLS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>`;

const FULLSCREEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;

const EXIT_FULLSCREEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`;

/** Bottom-left glass nav for the published Geoff See GitHub Pages projector. */
export function mountGeoffseePagesNav(
	doc: Document = document,
	loc: Pick<Location, "href" | "search"> = location,
): () => void {
	if (!isGeoffseeGithubPages(loc)) return () => {};
	if (new URLSearchParams(loc.search).get("embed") === "1") return () => {};

	const nav = doc.createElement("nav");
	nav.className = "geoffsee-pages-nav";
	nav.setAttribute("aria-label", "Site navigation");

	const controls = doc.createElement("a");
	controls.className = "geoffsee-pages-nav__btn";
	controls.href = geoffseePagesControlsUrl(loc);
	controls.title = "Open control panel (static preview)";
	controls.setAttribute("aria-label", "Open control panel");
	controls.innerHTML = CONTROLS_ICON;

	const fullscreen = doc.createElement("button");
	fullscreen.type = "button";
	fullscreen.className = "geoffsee-pages-nav__btn";
	fullscreen.title = "Fullscreen";
	fullscreen.setAttribute("aria-label", "Fullscreen");
	fullscreen.innerHTML = FULLSCREEN_ICON;

	const stage = doc.querySelector("#stage") ?? doc.documentElement;
	const syncFullscreenIcon = () => {
		const active = doc.fullscreenElement === stage;
		fullscreen.innerHTML = active ? EXIT_FULLSCREEN_ICON : FULLSCREEN_ICON;
		fullscreen.title = active ? "Exit fullscreen" : "Fullscreen";
		fullscreen.setAttribute(
			"aria-label",
			active ? "Exit fullscreen" : "Fullscreen",
		);
	};

	fullscreen.addEventListener("click", async () => {
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
	doc.addEventListener("fullscreenchange", syncFullscreenIcon);

	nav.append(controls, fullscreen);
	doc.body.append(nav);

	return () => {
		doc.removeEventListener("fullscreenchange", syncFullscreenIcon);
		nav.remove();
	};
}
