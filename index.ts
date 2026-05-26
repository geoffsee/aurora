import { createRequire } from "node:module";
import type { ServerWebSocket } from "bun";

type OscArg = { type: string; value: unknown } | unknown;
type OscMsg = { address: string; args?: OscArg[] };
type TrackMapping = {
	deckAStart: number;
	deckACount: number;
	deckBStart: number;
	deckBCount: number;
	bassTrack: number;
	midTrack: number;
	highTrack: number;
};
type ControlState = {
	crossfade: number;
	bpm: number;
	speed: number;
	intensity: number;
	feedback: number;
	depth: number;
	palette: number;
	deckAMode: number;
	deckBMode: number;
	rings: boolean;
	ringOpacity: number;
	strobe: boolean;
	strobeLockout: boolean;
	blackout: boolean;
	freeze: boolean;
	maxBrightness: number;
	showGpuPalette: boolean;
	beatSync: boolean;
	barSync: boolean;
	demoMode: boolean;
	replaying: boolean;
	flashVersion: number;
	resetVersion: number;
	cueVersion: number;
	cueIntensity: number;
	cuePalette: number;
	cueCrossfade: number;
	cueDeckAMode: number;
	cueDeckBMode: number;
	trackMapping: TrackMapping;
};

const require = createRequire(import.meta.url);
const osc = require("osc") as {
	UDPPort: new (
		opts: Record<string, unknown>,
	) => {
		send: (msg: OscMsg) => void;
		open: () => void;
		on: (
			event: "ready" | "message" | "error",
			cb: (...args: any[]) => void,
		) => void;
	};
};

const OSC_ADDRESSES = {
	TEMPO: "/live/song/get/tempo",
	IS_PLAYING: "/live/song/get/is_playing",
	BEAT: "/live/song/get/beat",
	TRACK_DATA: "/live/song/get/track_data",
	NUM_TRACKS: "/live/song/get/num_tracks",
	START_LISTEN_BEAT: "/live/song/start_listen/beat",
	START_LISTEN_TEMPO: "/live/song/start_listen/tempo",
	START_LISTEN_IS_PLAYING: "/live/song/start_listen/is_playing",
	ERROR: "/live/error",
} as const;

const port = Number(Bun.env.PORT ?? 3000);
const controlsPort = Number(Bun.env.CONTROLS_PORT ?? 3001);
const root = import.meta.dir;
const liveHost = Bun.env.LIVE_HOST ?? "127.0.0.1";
const liveSendPort = Number(Bun.env.LIVE_SEND_PORT ?? 11000);
const liveRecvPort = Number(Bun.env.LIVE_RECV_PORT ?? 11001);
const vstControlRecvPort = Number(Bun.env.VST_CONTROL_RECV_PORT ?? 12000);
const sockets = new Set<ServerWebSocket<undefined>>();
let numTracks = 0;
let oscReady = false;
let latestControlState: ControlState | null = null;
let latestOscFrameAt = 0;
let latestVstControlAt = 0;

const mimeTypes: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".wasm": "application/wasm",
	".wgsl": "text/plain; charset=utf-8",
};

function contentType(pathname: string) {
	const dot = pathname.lastIndexOf(".");
	return dot === -1
		? "application/octet-stream"
		: (mimeTypes[pathname.slice(dot)] ?? "application/octet-stream");
}

const udp = new osc.UDPPort({
	localAddress: "127.0.0.1",
	localPort: liveRecvPort,
	remoteAddress: liveHost,
	remotePort: liveSendPort,
	metadata: true,
});

const vstControlUdp = new osc.UDPPort({
	localAddress: "127.0.0.1",
	localPort: vstControlRecvPort,
	metadata: true,
});

const valueOf = (arg: OscArg) =>
	arg && typeof arg === "object" && "value" in arg
		? (arg as { value: unknown }).value
		: arg;
const finiteNumber = (value: unknown, fallback: number) => {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
};
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
	Math.max(min, Math.min(max, finiteNumber(value, fallback)));
const clampInt = (value: unknown, min: number, max: number, fallback: number) =>
	Math.max(min, Math.min(max, Math.floor(finiteNumber(value, fallback))));
const defaultTrackMapping = (): TrackMapping => ({
	deckAStart: 0,
	deckACount: 8,
	deckBStart: 8,
	deckBCount: 8,
	bassTrack: 0,
	midTrack: 1,
	highTrack: 2,
});
const defaultControlState = (): ControlState => ({
	crossfade: 0.5,
	bpm: 124,
	speed: 1,
	intensity: 0.82,
	feedback: 0.35,
	depth: 0,
	palette: 0,
	deckAMode: 0,
	deckBMode: 1,
	rings: true,
	ringOpacity: 1,
	strobe: false,
	strobeLockout: false,
	blackout: false,
	freeze: false,
	maxBrightness: 0.9,
	showGpuPalette: false,
	beatSync: true,
	barSync: false,
	demoMode: false,
	replaying: false,
	flashVersion: 0,
	resetVersion: 0,
	cueVersion: 0,
	cueIntensity: 0,
	cuePalette: 0,
	cueCrossfade: 0.5,
	cueDeckAMode: 0,
	cueDeckBMode: 1,
	trackMapping: defaultTrackMapping(),
});
const cuePresets: Record<string, Partial<ControlState>> = {
	warmup: {
		crossfade: 0.5,
		intensity: 0.62,
		feedback: 0.22,
		depth: 0.15,
		palette: 0.58,
		deckAMode: 4,
		deckBMode: 4,
	},
	drop: {
		crossfade: 1,
		intensity: 1.25,
		feedback: 0.42,
		depth: 0.58,
		palette: 0.9,
		deckAMode: 2,
		deckBMode: 2,
	},
	tunnel: {
		crossfade: 0.25,
		intensity: 1,
		feedback: 0.5,
		depth: 0.85,
		palette: 0.66,
		deckAMode: 1,
		deckBMode: 3,
	},
	burst: {
		crossfade: 0.75,
		intensity: 1.35,
		feedback: 0.32,
		depth: 0.35,
		palette: 0.04,
		deckAMode: 2,
		deckBMode: 2,
	},
	wash: {
		crossfade: 0.5,
		intensity: 0.48,
		feedback: 0.68,
		depth: 0.25,
		palette: 0.33,
		deckAMode: 4,
		deckBMode: 4,
	},
	panic: {
		crossfade: 0.5,
		intensity: 0.22,
		feedback: 0.08,
		depth: 0,
		palette: 0.62,
		deckAMode: 4,
		deckBMode: 4,
		maxBrightness: 0.35,
		strobe: false,
		strobeLockout: true,
	},
};
const coerceControlState = (state: unknown): ControlState => {
	const source =
		state && typeof state === "object" ? (state as Partial<ControlState>) : {};
	const defaults = defaultControlState();
	const mapping =
		source.trackMapping && typeof source.trackMapping === "object"
			? source.trackMapping
			: {};

	return {
		crossfade: clamp(source.crossfade, 0, 1, defaults.crossfade),
		bpm: clamp(source.bpm, 40, 240, defaults.bpm),
		speed: clamp(source.speed, 0.1, 3, defaults.speed),
		intensity: clamp(source.intensity, 0.05, 1.5, defaults.intensity),
		feedback: clamp(source.feedback, 0, 1, defaults.feedback),
		depth: clamp(source.depth, 0, 1, defaults.depth),
		palette: clamp(source.palette, 0, 1, defaults.palette),
		deckAMode: clampInt(source.deckAMode, 0, 4, defaults.deckAMode),
		deckBMode: clampInt(source.deckBMode, 0, 4, defaults.deckBMode),
		rings: source.rings !== false,
		ringOpacity: clamp(source.ringOpacity, 0, 1, defaults.ringOpacity),
		strobe: Boolean(source.strobe),
		strobeLockout: Boolean(source.strobeLockout),
		blackout: Boolean(source.blackout),
		freeze: Boolean(source.freeze),
		maxBrightness: clamp(source.maxBrightness, 0.1, 1, defaults.maxBrightness),
		showGpuPalette: source.showGpuPalette === true,
		beatSync: source.beatSync !== false,
		barSync: Boolean(source.barSync),
		demoMode: Boolean(source.demoMode),
		replaying: Boolean(source.replaying),
		flashVersion: clampInt(
			source.flashVersion,
			0,
			Number.MAX_SAFE_INTEGER,
			defaults.flashVersion,
		),
		resetVersion: clampInt(
			source.resetVersion,
			0,
			Number.MAX_SAFE_INTEGER,
			defaults.resetVersion,
		),
		cueVersion: clampInt(
			source.cueVersion,
			0,
			Number.MAX_SAFE_INTEGER,
			defaults.cueVersion,
		),
		cueIntensity: clamp(source.cueIntensity, 0, 1, defaults.cueIntensity),
		cuePalette: clamp(source.cuePalette, 0, 1, defaults.cuePalette),
		cueCrossfade: clamp(source.cueCrossfade, 0, 1, defaults.cueCrossfade),
		cueDeckAMode: clampInt(source.cueDeckAMode, 0, 4, defaults.cueDeckAMode),
		cueDeckBMode: clampInt(source.cueDeckBMode, 0, 4, defaults.cueDeckBMode),
		trackMapping: {
			deckAStart: clampInt(
				(mapping as Partial<TrackMapping>).deckAStart,
				0,
				31,
				defaults.trackMapping.deckAStart,
			),
			deckACount: clampInt(
				(mapping as Partial<TrackMapping>).deckACount,
				1,
				32,
				defaults.trackMapping.deckACount,
			),
			deckBStart: clampInt(
				(mapping as Partial<TrackMapping>).deckBStart,
				0,
				31,
				defaults.trackMapping.deckBStart,
			),
			deckBCount: clampInt(
				(mapping as Partial<TrackMapping>).deckBCount,
				1,
				32,
				defaults.trackMapping.deckBCount,
			),
			bassTrack: clampInt(
				(mapping as Partial<TrackMapping>).bassTrack,
				0,
				31,
				defaults.trackMapping.bassTrack,
			),
			midTrack: clampInt(
				(mapping as Partial<TrackMapping>).midTrack,
				0,
				31,
				defaults.trackMapping.midTrack,
			),
			highTrack: clampInt(
				(mapping as Partial<TrackMapping>).highTrack,
				0,
				31,
				defaults.trackMapping.highTrack,
			),
		},
	};
};
const currentControlState = () => latestControlState ?? defaultControlState();
const mergeControlState = (partial: Partial<ControlState>) => {
	const current = currentControlState();
	broadcastControl({
		...current,
		...partial,
		trackMapping: {
			...current.trackMapping,
			...(partial.trackMapping ?? {}),
		},
	});
};

const sendOsc = (address: string, args: OscArg[] = []) => {
	if (!oscReady) return;
	udp.send({ address, args });
};

const broadcast = (msg: OscMsg) => {
	if (msg.address === OSC_ADDRESSES.ERROR) return;
	latestOscFrameAt = Date.now();

	if (msg.address === OSC_ADDRESSES.NUM_TRACKS) {
		const n = valueOf(msg.args?.[0]);
		if (typeof n === "number") numTracks = n;
	}

	const data = JSON.stringify({
		address: msg.address,
		args: (msg.args ?? []).map(valueOf),
	});

	sockets.forEach((ws) => ws.send(data));
};

const broadcastControl = (state: unknown) => {
	latestControlState = coerceControlState(state);
	const data = JSON.stringify({
		address: "/bevyosc/control/state",
		args: [latestControlState],
	});
	sockets.forEach((ws) => ws.send(data));
};
const booleanArg = (arg: OscArg | undefined) => {
	const value = valueOf(arg);
	return Boolean(typeof value === "number" ? value >= 0.5 : value);
};
const numericArg = (arg: OscArg | undefined, fallback: number) =>
	finiteNumber(valueOf(arg), fallback);
const applyVstControlMessage = (msg: OscMsg) => {
	latestVstControlAt = Date.now();

	const controlPrefix = "/bevyosc/vst/control/";
	const triggerPrefix = "/bevyosc/vst/trigger/";
	const cuePrefix = "/bevyosc/vst/cue/";
	const current = currentControlState();
	const arg = msg.args?.[0];

	if (msg.address.startsWith(controlPrefix)) {
		const name = msg.address.slice(controlPrefix.length);
		const value = numericArg(arg, 0);

		switch (name) {
			case "crossfade":
				mergeControlState({ crossfade: value });
				break;
			case "bpm":
				mergeControlState({ bpm: value });
				break;
			case "speed":
				mergeControlState({ speed: value });
				break;
			case "intensity":
				mergeControlState({ intensity: value });
				break;
			case "feedback":
				mergeControlState({ feedback: value });
				break;
			case "depth":
				mergeControlState({ depth: value });
				break;
			case "palette":
				mergeControlState({ palette: value });
				break;
			case "deck_a_mode":
				mergeControlState({ deckAMode: value });
				break;
			case "deck_b_mode":
				mergeControlState({ deckBMode: value });
				break;
			case "rings":
				mergeControlState({ rings: booleanArg(arg) });
				break;
			case "ring_opacity":
				mergeControlState({ ringOpacity: value });
				break;
			case "strobe":
				mergeControlState({ strobe: booleanArg(arg) });
				break;
			case "strobe_lockout":
				mergeControlState({ strobeLockout: booleanArg(arg) });
				break;
			case "blackout":
				mergeControlState({ blackout: booleanArg(arg) });
				break;
			case "freeze":
				mergeControlState({ freeze: booleanArg(arg) });
				break;
			case "show_gpu_palette":
				mergeControlState({ showGpuPalette: booleanArg(arg) });
				break;
			case "max_brightness":
				mergeControlState({ maxBrightness: value });
				break;
			case "beat_sync":
				mergeControlState({ beatSync: booleanArg(arg) });
				break;
			case "bar_sync":
				mergeControlState({
					barSync: booleanArg(arg),
					beatSync: current.beatSync || booleanArg(arg),
				});
				break;
			case "demo_mode":
				mergeControlState({ demoMode: booleanArg(arg) });
				break;
		}

		return;
	}

	if (msg.address.startsWith(triggerPrefix)) {
		const name = msg.address.slice(triggerPrefix.length);
		if (name === "flash") {
			mergeControlState({ flashVersion: current.flashVersion + 1 });
		} else if (name === "reset") {
			const reset = defaultControlState();
			mergeControlState({
				...reset,
				flashVersion: current.flashVersion,
				resetVersion: current.resetVersion + 1,
			});
		}

		return;
	}

	if (msg.address.startsWith(cuePrefix)) {
		const name = msg.address.slice(cuePrefix.length);
		const cue = cuePresets[name];
		if (!cue) return;

		mergeControlState({
			...cue,
			cueVersion: current.cueVersion + 1,
			cueIntensity: finiteNumber(cue.intensity, current.intensity),
			cuePalette: finiteNumber(cue.palette, current.palette),
			cueCrossfade: finiteNumber(cue.crossfade, current.crossfade),
			cueDeckAMode: finiteNumber(cue.deckAMode, current.deckAMode),
			cueDeckBMode: finiteNumber(cue.deckBMode, current.deckBMode),
			flashVersion:
				name === "panic" ? current.flashVersion : current.flashVersion + 1,
		});
	}
};

const visualServer = Bun.serve({
	port,
	async fetch(request, server) {
		const url = new URL(request.url);
		const pathname = decodeURIComponent(url.pathname);

		if (pathname === "/ws") {
			if (server.upgrade(request)) return undefined;
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);

		if (relativePath.includes("..")) {
			return new Response("Not found", { status: 404 });
		}

		const file = Bun.file(`${root}/${relativePath}`);
		if (!(await file.exists())) {
			return new Response("Not found", { status: 404 });
		}

		return new Response(file, {
			headers: {
				"content-type": contentType(relativePath),
				"cache-control": relativePath.startsWith("dist/pkg/")
					? "no-store"
					: "public, max-age=30",
				"cross-origin-opener-policy": "same-origin",
				"cross-origin-embedder-policy": "require-corp",
			},
		});
	},
	websocket: {
		open(ws) {
			sockets.add(ws);
			ws.send(
				JSON.stringify({
					address: "/bevyosc/osc/connected",
					args: [oscReady ? 1 : 0],
				}),
			);
			if (latestControlState) {
				ws.send(
					JSON.stringify({
						address: "/bevyosc/control/state",
						args: [latestControlState],
					}),
				);
			}
		},
		close(ws) {
			sockets.delete(ws);
		},
		message(_ws, raw) {
			try {
				const parsed = JSON.parse(raw.toString()) as Partial<OscMsg>;
				if (typeof parsed.address === "string") {
					if (parsed.address === "/bevyosc/control/state") {
						broadcastControl(
							Array.isArray(parsed.args) ? parsed.args[0] : null,
						);
					} else {
						sendOsc(
							parsed.address,
							Array.isArray(parsed.args) ? parsed.args : [],
						);
					}
				}
			} catch (error) {
				console.error(
					"bad websocket OSC message",
					error instanceof Error ? error.message : error,
				);
			}
		},
	},
});

const controlsServer = Bun.serve({
	port: controlsPort,
	async fetch(request) {
		const url = new URL(request.url);
		const pathname = decodeURIComponent(url.pathname);
		const relativePath = pathname === "/" ? "controls.html" : pathname.slice(1);

		if (relativePath.includes("..")) {
			return new Response("Not found", { status: 404 });
		}

		const file = Bun.file(`${root}/${relativePath}`);
		if (!(await file.exists())) {
			return new Response("Not found", { status: 404 });
		}

		return new Response(file, {
			headers: {
				"content-type": contentType(relativePath),
				"cache-control": "no-store",
			},
		});
	},
});

udp.on("ready", () => {
	oscReady = true;
	console.log(
		`OSC ready: listening :${liveRecvPort}, sending to ${liveHost}:${liveSendPort}`,
	);

	[
		OSC_ADDRESSES.START_LISTEN_BEAT,
		OSC_ADDRESSES.START_LISTEN_TEMPO,
		OSC_ADDRESSES.START_LISTEN_IS_PLAYING,
		OSC_ADDRESSES.NUM_TRACKS,
	].forEach((address) => sendOsc(address));

	setInterval(() => {
		sendOsc(OSC_ADDRESSES.NUM_TRACKS);

		if (numTracks > 0) {
			sendOsc(OSC_ADDRESSES.TRACK_DATA, [
				{ type: "i", value: 0 },
				{ type: "i", value: numTracks },
				{ type: "s", value: "track.output_meter_level" },
			]);
		}
	}, 50);

	const data = JSON.stringify({ address: "/bevyosc/osc/connected", args: [1] });
	sockets.forEach((ws) => ws.send(data));
});

udp.on("message", broadcast);
udp.on("error", (error: Error) => console.error("OSC error:", error.message));
udp.open();

vstControlUdp.on("ready", () => {
	console.log(`VST control OSC ready: listening :${vstControlRecvPort}`);
});
vstControlUdp.on("message", applyVstControlMessage);
vstControlUdp.on("error", (error: Error) =>
	console.error("VST control OSC error:", error.message),
);
vstControlUdp.open();

setInterval(() => {
	const now = Date.now();
	const diagnostics = {
		sockets: sockets.size,
		oscReady,
		oscActive: now - latestOscFrameAt < 3000,
		liveHost,
		liveSendPort,
		liveRecvPort,
		vstControlRecvPort,
		visualPort: port,
		controlsPort,
		numTracks,
		vstControlActive: now - latestVstControlAt < 3000,
		demoMode: Boolean(latestControlState?.demoMode),
		replaying: Boolean(latestControlState?.replaying),
		mappedTracks: latestControlState?.trackMapping ?? defaultTrackMapping(),
	};
	const data = JSON.stringify({
		address: "/bevyosc/server/diagnostics",
		args: [diagnostics],
	});
	sockets.forEach((ws) => ws.send(data));
}, 500);

setInterval(() => {
	const state = latestControlState;
	if (!state?.demoMode) return;

	const now = Date.now() / 1000;
	const beat = ((now * state.bpm) / 60) % 4;
	const energy =
		0.45 + Math.sin(now * 2.1) * 0.2 + Math.max(0, Math.sin(now * 8.0)) * 0.25;
	const demo = {
		tempo: state.bpm,
		beat,
		energy: clamp(energy, 0, 1, 0.5),
		deckA: clamp(0.48 + Math.sin(now * 1.7) * 0.42, 0, 1, 0.5),
		deckB: clamp(0.48 + Math.cos(now * 1.35) * 0.42, 0, 1, 0.5),
		bass: clamp(0.56 + Math.sin(now * 2.4) * 0.36, 0, 1, 0.5),
		mid: clamp(0.45 + Math.sin(now * 3.1 + 1.4) * 0.3, 0, 1, 0.5),
		high: clamp(Math.max(0, Math.sin(now * 12.0)) * 0.9, 0, 1, 0.2),
		pulse: beat < 0.18 ? 1 : Math.max(0, 1 - beat / 0.42),
	};
	const data = JSON.stringify({ address: "/bevyosc/demo/audio", args: [demo] });
	sockets.forEach((ws) => ws.send(data));
}, 50);

console.log(`bevyosc VJ output listening on ${visualServer.url}`);
console.log(`bevyosc controls listening on ${controlsServer.url}`);
