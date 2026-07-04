import { createRequire } from "node:module";
import { createReadStream, watch } from "node:fs";
import type { ServerWebSocket } from "bun";
import {
	type OscArg,
	type OscMsg,
	type AudioCurveShape,
	CONTROL_STATE_SCHEMA_VERSION,
	isAudioCurveShape,
	PRESET_MORPH_ADDRESS,
	PRESET_LAYER_PREFIX,
	PRESET_LAYER_ADD_ADDRESS,
	PRESET_LAYER_WEIGHT_ADDRESS,
	PRESET_LAYER_REMOVE_ADDRESS,
	PRESET_LAYER_MOVE_ADDRESS,
	PRESET_LAYER_CLEAR_ADDRESS,
	VST_CONTROL_NAMES,
	VST_CONTROL_PREFIX,
	VST_CUE_PREFIX,
	VST_OSC_CONTRACT,
	VST_TRIGGER_PREFIX,
	validateControlStateVersion,
	validateLiveOscMsg,
	validatePresetMorphOscMsg,
	validatePresetLayerOscMsg,
	validatePresetOscMsg,
	validateVstOscMsg,
} from "../shared/osc-validation.ts";
import {
	DEFAULT_PALETTE_RGB,
	hueToRgb,
	resolvePaletteColor,
} from "../shared/palette-color.ts";
import {
	MIDI_CLOCK_TICK,
	MIDI_CLOCK_WINDOW,
	MIDI_CLOCK_TIMEOUT_MS,
	deriveBpmFromTimestamps,
} from "./midi-clock.ts";
import {
	LINK_DEFAULT_QUANTUM,
	LINK_UPDATE_INTERVAL_MS,
	deriveLinkFrame,
	isLinkActive,
} from "./ableton-link.ts";
import { selectTempoSource } from "./clock-arbiter.ts";
import { makeStateLog } from "./state-log.ts";
import {
	DEFAULT_AUDIO_EMA_ALPHA,
	DEFAULT_AUDIO_EMA_ALPHAS,
	DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
	type AudioEmaAlphas,
	type AudioFeatures,
	makeAudioEmaState,
	stepAudioEma,
} from "./audio-ema.ts";
import { migrateControlState } from "../shared/control-state-schema.ts";
import {
	MAX_SHADER_INDEX,
	type OutputRoute,
	normalizeOutputRoutes,
} from "../shared/output-routing.ts";
import {
	type MorphCurve,
	clampMorphPosition,
	isMorphCurve,
	morphPresetStates,
} from "./preset-morph.ts";
import {
	PRESET_LAYER_MAX,
	applyLayerWeightControl,
	createLayerController,
	layerWeightFields,
	pickLayerState,
} from "./preset-layers.ts";
import {
	makeAutomationBridge,
	parseTriggerBindings,
	type AudioTransientConfig,
} from "./automation-bridge.ts";
import { DEFAULT_TRANSIENT_CONFIG } from "./audio-transient-trigger.ts";
import {
	makeAudioControlRouter,
	parseAudioMappings,
} from "./audio-control-router.ts";
import { importShadertoyUrl } from "../shared/shadertoy-import.ts";
import audioMappingsRaw from "./audio-mappings.json" with { type: "json" };

type TrackMapping = {
	deckAStart: number;
	deckACount: number;
	deckBStart: number;
	deckBCount: number;
	bassTrack: number;
	midTrack: number;
	highTrack: number;
};
type BandCurves = {
	energy: AudioCurveShape;
	bass: AudioCurveShape;
	mid: AudioCurveShape;
	high: AudioCurveShape;
};
type ControlState = {
	readonly schemaVersion: number;
	crossfade: number;
	bpm: number;
	speed: number;
	intensity: number;
	feedback: number;
	depth: number;
	palette: number;
	paletteR: number;
	paletteG: number;
	paletteB: number;
	paletteSaturation: number;
	paletteBrightness: number;
	gridDensity: number;
	gridDiamond: number;
	gridLineWidth: number;
	gridShapeMix: number;
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
	cueDeckAGpuShader: number;
	cueDeckBGpuShader: number;
	trackMapping: TrackMapping;
	activeShader: number;
	deckAGpuShader: number;
	deckBGpuShader: number;
	bandCurves: BandCurves;
	emaAlphas: AudioEmaAlphas;
	morph: number;
	audioControlMode: boolean;
	outputs: OutputRoute[];
	audioTransientAutomation: boolean;
	// Per-layer composite weights, one slot per PRESET_LAYER_MAX layer, mirrored
	// from the live layer stack so per-layer opacity is an automation/OSC/MIDI
	// target. Kept as fixed scalar fields (not an array) so each addresses one
	// morph/MIDI/automation param.
	layerWeight0: number;
	layerWeight1: number;
	layerWeight2: number;
	layerWeight3: number;
	layerWeight4: number;
	layerWeight5: number;
	layerWeight6: number;
	layerWeight7: number;
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
const bridgeRoot = import.meta.dir;
const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const webRoot = `${root}/web`;
const controlsDistRoot = `${root}/dist/controls`;
const liveHost = Bun.env.LIVE_HOST ?? "127.0.0.1";
const liveSendPort = Number(Bun.env.LIVE_SEND_PORT ?? 11000);
const liveRecvPort = Number(Bun.env.LIVE_RECV_PORT ?? 11001);
const vstControlRecvPort = Number(Bun.env.VST_CONTROL_RECV_PORT ?? 12000);
const midiClockDevice = Bun.env.MIDI_CLOCK_DEVICE ?? "";
const abletonLinkEnabled = Bun.env.ABLETON_LINK_ENABLED === "1";
const hotReload = Bun.env.HOT_RELOAD === "1";
const sockets = new Set<ServerWebSocket<undefined>>();
let numTracks = 0;
let oscReady = false;
let latestControlState: ControlState | null = null;
// Guards the layer-weight mirror against reentrancy: set while the layer
// controller writes its recomposited state (which carries the weight slots) so
// broadcastControl doesn't treat that write as a fresh external weight edit.
let applyingLayerWeights = false;
let latestOscFrameAt = 0;
let latestVstControlAt = 0;
let midiClockTimestamps: number[] = [];
let lastMidiClockAt = 0;
let lastMidiClockBpmUpdate = 0;
let lastLinkUpdateAt = 0;
let linkNumPeers = 0;
const demoAudioEma = makeAudioEmaState();
const liveAudioEma = makeAudioEmaState();
const browserAudioEma = makeAudioEmaState();

const _raw = Number(Bun.env.STATE_LOG_CAPACITY);
const stateLogCapacity =
	Number.isFinite(_raw) && _raw >= 1 ? Math.floor(_raw) : 500;
const controlStateLog = makeStateLog(stateLogCapacity);

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

const resolveStaticFile = (relativePath: string) => {
	const base =
		relativePath.startsWith("dist/") || relativePath.startsWith("assets/")
			? root
			: webRoot;
	return Bun.file(`${base}/${relativePath}`);
};

const resolveControlsFile = (relativePath: string) =>
	Bun.file(`${controlsDistRoot}/${relativePath}`);

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
const audioEmaAlphas: AudioEmaAlphas = {
	energy: clamp(
		Bun.env.AUDIO_EMA_ALPHA_ENERGY,
		0.01,
		1,
		DEFAULT_AUDIO_EMA_ALPHAS.energy,
	),
	bass: clamp(
		Bun.env.AUDIO_EMA_ALPHA_BASS,
		0.01,
		1,
		DEFAULT_AUDIO_EMA_ALPHAS.bass,
	),
	mid: clamp(
		Bun.env.AUDIO_EMA_ALPHA_MID,
		0.01,
		1,
		DEFAULT_AUDIO_EMA_ALPHAS.mid,
	),
	high: clamp(
		Bun.env.AUDIO_EMA_ALPHA_HIGH,
		0.01,
		1,
		DEFAULT_AUDIO_EMA_ALPHAS.high,
	),
	pulse: clamp(
		Bun.env.AUDIO_EMA_ALPHA_PULSE,
		0.01,
		1,
		DEFAULT_AUDIO_EMA_ALPHAS.pulse,
	),
};
// Legacy AUDIO_EMA_ALPHA env var: if set, overrides all bands that were not individually configured.
{
	const legacyAlpha = clamp(
		Bun.env.AUDIO_EMA_ALPHA,
		0.01,
		1,
		DEFAULT_AUDIO_EMA_ALPHA,
	);
	if (Bun.env.AUDIO_EMA_ALPHA !== undefined) {
		if (Bun.env.AUDIO_EMA_ALPHA_ENERGY === undefined)
			audioEmaAlphas.energy = legacyAlpha;
		if (Bun.env.AUDIO_EMA_ALPHA_BASS === undefined)
			audioEmaAlphas.bass = legacyAlpha;
		if (Bun.env.AUDIO_EMA_ALPHA_MID === undefined)
			audioEmaAlphas.mid = legacyAlpha;
		if (Bun.env.AUDIO_EMA_ALPHA_HIGH === undefined)
			audioEmaAlphas.high = legacyAlpha;
		if (Bun.env.AUDIO_EMA_ALPHA_PULSE === undefined)
			audioEmaAlphas.pulse = legacyAlpha;
	}
}
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
	schemaVersion: CONTROL_STATE_SCHEMA_VERSION,
	crossfade: 0.5,
	bpm: 124,
	speed: 1,
	intensity: 0.82,
	feedback: 0.35,
	depth: 0,
	palette: 0,
	paletteR: DEFAULT_PALETTE_RGB.r,
	paletteG: DEFAULT_PALETTE_RGB.g,
	paletteB: DEFAULT_PALETTE_RGB.b,
	paletteSaturation: 1,
	paletteBrightness: 1,
	gridDensity: 0.5,
	gridDiamond: 0.5,
	gridLineWidth: 0.5,
	gridShapeMix: 0.5,
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
	cueDeckAGpuShader: 0,
	cueDeckBGpuShader: 5,
	trackMapping: defaultTrackMapping(),
	activeShader: 0,
	deckAGpuShader: 0,
	deckBGpuShader: 5,
	bandCurves: {
		energy: "linear",
		bass: "linear",
		mid: "linear",
		high: "linear",
	},
	emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
	morph: 0,
	audioControlMode: false,
	outputs: [],
	audioTransientAutomation: false,
	layerWeight0: 0,
	layerWeight1: 0,
	layerWeight2: 0,
	layerWeight3: 0,
	layerWeight4: 0,
	layerWeight5: 0,
	layerWeight6: 0,
	layerWeight7: 0,
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
const cueNames: ReadonlySet<string> = new Set(Object.keys(cuePresets));
// cuePresets defines what cue addresses the bridge will actually act on. Keep it
// locked to the contract so an OSC msg the contract accepts can't slip through
// without a preset behind it, and vice versa.
{
	const expected = new Set(VST_OSC_CONTRACT.cues.bridgeAccepts);
	for (const name of expected) {
		if (!cueNames.has(name)) {
			throw new Error(
				`cuePresets missing cue "${name}" required by vst-osc-contract.json`,
			);
		}
	}
	for (const name of cueNames) {
		if (!expected.has(name)) {
			throw new Error(
				`cuePresets has cue "${name}" not declared in vst-osc-contract.json`,
			);
		}
	}
}
const coerceControlState = (state: unknown): ControlState => {
	const source =
		state && typeof state === "object" ? (state as Partial<ControlState>) : {};
	const defaults = defaultControlState();
	const mapping =
		source.trackMapping && typeof source.trackMapping === "object"
			? source.trackMapping
			: {};
	const paletteColor = resolvePaletteColor(source, {
		palette: defaults.palette,
		...DEFAULT_PALETTE_RGB,
	});

	return {
		schemaVersion: CONTROL_STATE_SCHEMA_VERSION,
		crossfade: clamp(source.crossfade, 0, 1, defaults.crossfade),
		bpm: clamp(source.bpm, 40, 240, defaults.bpm),
		speed: clamp(source.speed, 0.1, 3, defaults.speed),
		intensity: clamp(source.intensity, 0.05, 1.5, defaults.intensity),
		feedback: clamp(source.feedback, 0, 1, defaults.feedback),
		depth: clamp(source.depth, 0, 1, defaults.depth),
		palette: paletteColor.palette,
		paletteR: paletteColor.r,
		paletteG: paletteColor.g,
		paletteB: paletteColor.b,
		paletteSaturation: clamp(
			source.paletteSaturation,
			0,
			1,
			defaults.paletteSaturation,
		),
		paletteBrightness: clamp(
			source.paletteBrightness,
			0,
			1,
			defaults.paletteBrightness,
		),
		gridDensity: clamp(source.gridDensity, 0, 1, defaults.gridDensity),
		gridDiamond: clamp(source.gridDiamond, 0, 1, defaults.gridDiamond),
		gridLineWidth: clamp(source.gridLineWidth, 0, 1, defaults.gridLineWidth),
		gridShapeMix: clamp(source.gridShapeMix, 0, 1, defaults.gridShapeMix),
		deckAMode: clampInt(source.deckAMode, 0, 23, defaults.deckAMode),
		deckBMode: clampInt(source.deckBMode, 0, 23, defaults.deckBMode),
		rings: source.rings !== false,
		ringOpacity: clamp(source.ringOpacity, 0, 1, defaults.ringOpacity),
		strobe: Boolean(source.strobe),
		strobeLockout: Boolean(source.strobeLockout),
		blackout: Boolean(source.blackout),
		freeze: Boolean(source.freeze),
		maxBrightness: clamp(source.maxBrightness, 0, 1, defaults.maxBrightness),
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
		cueDeckAMode: clampInt(source.cueDeckAMode, 0, 23, defaults.cueDeckAMode),
		cueDeckBMode: clampInt(source.cueDeckBMode, 0, 23, defaults.cueDeckBMode),
		cueDeckAGpuShader: clampInt(
			source.cueDeckAGpuShader,
			0,
			MAX_SHADER_INDEX,
			defaults.cueDeckAGpuShader,
		),
		cueDeckBGpuShader: clampInt(
			source.cueDeckBGpuShader,
			0,
			MAX_SHADER_INDEX,
			defaults.cueDeckBGpuShader,
		),
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
		activeShader: clampInt(
			source.activeShader,
			0,
			MAX_SHADER_INDEX,
			defaults.activeShader,
		),
		deckAGpuShader: clampInt(
			source.deckAGpuShader,
			0,
			MAX_SHADER_INDEX,
			defaults.deckAGpuShader,
		),
		deckBGpuShader: clampInt(
			source.deckBGpuShader,
			0,
			MAX_SHADER_INDEX,
			defaults.deckBGpuShader,
		),
		morph: clamp(source.morph, 0, 1, defaults.morph),
		bandCurves: (() => {
			const bc =
				source.bandCurves && typeof source.bandCurves === "object"
					? (source.bandCurves as Partial<BandCurves>)
					: {};
			return {
				energy: isAudioCurveShape(bc.energy) ? bc.energy : "linear",
				bass: isAudioCurveShape(bc.bass) ? bc.bass : "linear",
				mid: isAudioCurveShape(bc.mid) ? bc.mid : "linear",
				high: isAudioCurveShape(bc.high) ? bc.high : "linear",
			};
		})(),
		emaAlphas: (() => {
			const ea =
				source.emaAlphas && typeof source.emaAlphas === "object"
					? (source.emaAlphas as Partial<AudioEmaAlphas>)
					: {};
			return {
				energy: clamp(ea.energy, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.energy),
				bass: clamp(ea.bass, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.bass),
				mid: clamp(ea.mid, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.mid),
				high: clamp(ea.high, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.high),
				pulse: clamp(ea.pulse, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.pulse),
			};
		})(),
		audioControlMode: Boolean(source.audioControlMode),
		outputs: normalizeOutputRoutes(source.outputs),
		audioTransientAutomation: Boolean(source.audioTransientAutomation),
		// Fall back to the live value (not the default) when a field is absent, so
		// a client that echoes ControlState without the layer-weight slots can't
		// zero the live mix — only an explicit new value moves a weight.
		layerWeight0: clamp(
			source.layerWeight0,
			0,
			1,
			latestControlState?.layerWeight0 ?? 0,
		),
		layerWeight1: clamp(
			source.layerWeight1,
			0,
			1,
			latestControlState?.layerWeight1 ?? 0,
		),
		layerWeight2: clamp(
			source.layerWeight2,
			0,
			1,
			latestControlState?.layerWeight2 ?? 0,
		),
		layerWeight3: clamp(
			source.layerWeight3,
			0,
			1,
			latestControlState?.layerWeight3 ?? 0,
		),
		layerWeight4: clamp(
			source.layerWeight4,
			0,
			1,
			latestControlState?.layerWeight4 ?? 0,
		),
		layerWeight5: clamp(
			source.layerWeight5,
			0,
			1,
			latestControlState?.layerWeight5 ?? 0,
		),
		layerWeight6: clamp(
			source.layerWeight6,
			0,
			1,
			latestControlState?.layerWeight6 ?? 0,
		),
		layerWeight7: clamp(
			source.layerWeight7,
			0,
			1,
			latestControlState?.layerWeight7 ?? 0,
		),
	};
};

const currentControlState = () => latestControlState ?? defaultControlState();

let latestAutomationAudioFeatures: AudioFeatures = {
	energy: 0,
	bass: 0,
	mid: 0,
	high: 0,
	pulse: 0,
};

const maybeFeedAutomationAudio = (
	features: AudioFeatures,
	nowMs: number,
): void => {
	latestAutomationAudioFeatures = features;
	if (!currentControlState().audioTransientAutomation) return;
	automationBridge.onAudioFeatures(features, nowMs);
};
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

const mergePaletteHue = (value: number) => {
	const palette = clamp(value, 0, 1, currentControlState().palette);
	const rgb = hueToRgb(palette);
	mergeControlState({
		palette,
		paletteR: rgb.r,
		paletteG: rgb.g,
		paletteB: rgb.b,
	});
};

// Parse initial transient config from env vars; undefined fields fall back
// to DEFAULT_TRANSIENT_CONFIG values inside makeAudioTransientDetector.
const initialTransientConfig: Partial<AudioTransientConfig> = (() => {
	const cfg: Partial<AudioTransientConfig> = {};
	const _mode = Bun.env.AUDIO_TRANSIENT_MODE;
	if (_mode === "onset" || _mode === "beat" || _mode === "band-energy")
		cfg.mode = _mode;
	if (Bun.env.AUDIO_TRANSIENT_THRESHOLD !== undefined) {
		cfg.threshold = clamp(
			Bun.env.AUDIO_TRANSIENT_THRESHOLD,
			0,
			1,
			DEFAULT_TRANSIENT_CONFIG.threshold,
		);
	}
	if (Bun.env.AUDIO_TRANSIENT_DEBOUNCE_MS !== undefined) {
		cfg.debounceMs = clamp(
			Bun.env.AUDIO_TRANSIENT_DEBOUNCE_MS,
			0,
			60000,
			DEFAULT_TRANSIENT_CONFIG.debounceMs,
		);
	}
	const _band = Bun.env.AUDIO_TRANSIENT_BAND;
	if (
		_band === "energy" ||
		_band === "bass" ||
		_band === "mid" ||
		_band === "high" ||
		_band === "pulse"
	)
		cfg.band = _band;
	const _action = Bun.env.AUDIO_TRANSIENT_ACTION;
	if (
		_action === "play" ||
		_action === "play-loop" ||
		_action === "stop" ||
		_action === "toggle" ||
		_action === "toggle-loop"
	)
		cfg.action = _action;
	return cfg;
})();

const automationBridge = makeAutomationBridge(
	(diff) => mergeControlState(diff as Partial<ControlState>),
	Bun.env.AUTOMATION_TRIGGER_BINDINGS
		? parseTriggerBindings(Bun.env.AUTOMATION_TRIGGER_BINDINGS)
		: [],
	() => controlStateLog.toArray(),
	initialTransientConfig,
);

// Audio-control router: maps live audio features onto ControlState mutations.
// Inert until ControlState.audioControlMode is enabled (synced in
// broadcastControl) and at least one mapping is loaded. coerceControlState
// remains the clamp on whatever diffs the router emits.
//
// Audio→automation transient detector: inert until ControlState.audioTransientAutomation
// is enabled (see maybeFeedAutomationAudio).
const audioControlRouter = makeAudioControlRouter(
	(diff) => mergeControlState(diff as Partial<ControlState>),
	() => currentControlState() as unknown as Record<string, unknown>,
);
audioControlRouter.setMappings(parseAudioMappings(audioMappingsRaw));

// The router has a single shared edge/continuous state, so only one audio
// source may drive it at a time. A browser source (Phase 2) sending
// /aurora/audio/features is authoritative while live; the synthetic demo-loop
// feed is suppressed for this window so the two streams never interleave (which
// would thrash rising-edge detection and no-op suppression). The demo feed
// resumes once the browser source goes quiet.
const BROWSER_AUDIO_FEATURE_TTL_MS = 1000;
let lastBrowserAudioFeaturesMs = Number.NEGATIVE_INFINITY;
const OSC_ACTIVE_TTL_MS = 3000;

// MIDI byte parser state for note-on and CC messages.
// Real-time bytes (0xF8–0xFF) are single-byte and do not affect running status.
const MIDI_NOTE_ON_STATUS = 0x90;
const MIDI_CC_STATUS = 0xb0;
let midiParseStatus = 0;
let midiParseData1 = -1;

function parseMidiByte(byte: number): void {
	if (byte >= 0xf8) {
		if (byte === MIDI_CLOCK_TICK) onMidiClock();
		return;
	}
	if (byte & 0x80) {
		midiParseStatus = byte;
		midiParseData1 = -1;
		return;
	}
	const msgType = midiParseStatus & 0xf0;
	if (msgType !== MIDI_NOTE_ON_STATUS && msgType !== MIDI_CC_STATUS) return;
	if (midiParseData1 === -1) {
		midiParseData1 = byte;
		return;
	}
	const channel = (midiParseStatus & 0x0f) + 1;
	if (msgType === MIDI_NOTE_ON_STATUS && byte > 0) {
		automationBridge.onMidiNote(midiParseData1, channel);
	} else if (msgType === MIDI_CC_STATUS) {
		automationBridge.onMidiCc(midiParseData1, channel, byte);
	}
	midiParseData1 = -1;
}

const sendOsc = (address: string, args: OscArg[] = []) => {
	if (!oscReady) return;
	udp.send({ address, args });
};

// Coerce an untrusted /aurora/audio/features payload into AudioFeatures.
// Each band clamps to 0..1; missing/non-finite bands fall back to 0.
const coerceAudioFeatures = (raw: unknown): AudioFeatures => {
	const f =
		raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	return {
		energy: clamp(f.energy, 0, 1, 0),
		bass: clamp(f.bass, 0, 1, 0),
		mid: clamp(f.mid, 0, 1, 0),
		high: clamp(f.high, 0, 1, 0),
		pulse: clamp(f.pulse, 0, 1, 0),
	};
};

function broadcastBrowserAudioFeatures(
	features: AudioFeatures,
	nowMs: number,
): void {
	// Live AbletonOSC remains authoritative. Browser mic frames fill the same
	// renderer-facing audio lane only while OSC has gone quiet.
	if (nowMs - latestOscFrameAt < OSC_ACTIVE_TTL_MS) return;
	const data = JSON.stringify({
		address: "/aurora/audio/features",
		args: [features],
	});
	sockets.forEach((ws) => ws.send(data));
}

// Derive AudioFeatures from a raw AbletonOSC track_data response and feed the
// transient detector. The response carries meter floats, optionally preceded by
// a "track.output_meter_level" string field marker.
function processLiveTrackData(args: unknown[]): void {
	const markerIdx = args.findIndex(
		(a) => typeof a === "string" && (a as string).startsWith("track."),
	);
	const meterStart = markerIdx >= 0 ? markerIdx + 1 : 0;
	const meters = args
		.slice(meterStart)
		.map(Number)
		.filter(Number.isFinite)
		.map((v) => Math.max(0, Math.min(1, v)));

	if (meters.length === 0) return;

	const mapping = latestControlState?.trackMapping ?? defaultTrackMapping();
	const avg = meters.reduce((a, b) => a + b, 0) / meters.length;
	const peak = meters.reduce((a, b) => Math.max(a, b), 0);
	const energyTarget = peak * 0.72 + avg * 0.28;

	const rawFeatures: AudioFeatures = {
		energy: energyTarget,
		bass: meters[mapping.bassTrack] ?? avg,
		mid: meters[mapping.midTrack] ?? avg,
		high: meters[mapping.highTrack] ?? avg,
		// pulse is not available from track meters; approximate from overall energy
		pulse: energyTarget,
	};

	const smoothed = stepAudioEma(
		liveAudioEma,
		rawFeatures,
		latestControlState?.emaAlphas ?? audioEmaAlphas,
		DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
	);
	maybeFeedAutomationAudio(smoothed, Date.now());
}

// Apply a single transient-config OSC message. firstArg is the raw payload value.
function applyTransientConfigMsg(address: string, firstArg: unknown): void {
	const key = address.slice("/aurora/automation/transient/".length);
	switch (key) {
		case "threshold":
			automationBridge.updateTransientConfig({
				threshold: clamp(firstArg, 0, 1, DEFAULT_TRANSIENT_CONFIG.threshold),
			});
			break;
		case "debounce":
			automationBridge.updateTransientConfig({
				debounceMs: clamp(
					firstArg,
					0,
					60000,
					DEFAULT_TRANSIENT_CONFIG.debounceMs,
				),
			});
			break;
		case "mode": {
			const m = String(firstArg);
			if (m === "onset" || m === "beat" || m === "band-energy") {
				automationBridge.updateTransientConfig({ mode: m });
			}
			break;
		}
		case "band": {
			const b = String(firstArg);
			if (
				b === "energy" ||
				b === "bass" ||
				b === "mid" ||
				b === "high" ||
				b === "pulse"
			) {
				automationBridge.updateTransientConfig({
					band: b as keyof AudioFeatures,
				});
			}
			break;
		}
		case "action": {
			const a = String(firstArg);
			if (
				a === "play" ||
				a === "play-loop" ||
				a === "stop" ||
				a === "toggle" ||
				a === "toggle-loop"
			) {
				automationBridge.updateTransientConfig({
					action: a as "play" | "play-loop" | "stop" | "toggle" | "toggle-loop",
				});
			}
			break;
		}
	}
}

const broadcast = (msg: OscMsg) => {
	if (msg.address === OSC_ADDRESSES.ERROR) return;
	latestOscFrameAt = Date.now();

	if (msg.address === OSC_ADDRESSES.NUM_TRACKS) {
		const n = valueOf(msg.args?.[0]);
		if (typeof n === "number") numTracks = n;
	}

	if (msg.address === OSC_ADDRESSES.TRACK_DATA) {
		processLiveTrackData((msg.args ?? []).map(valueOf));
	}

	const data = JSON.stringify({
		address: msg.address,
		args: (msg.args ?? []).map(valueOf),
	});

	sockets.forEach((ws) => ws.send(data));
};

const broadcastControl = (state: unknown) => {
	const prev = latestControlState;
	latestControlState = coerceControlState(state);
	if (
		prev &&
		prev.audioTransientAutomation !==
			latestControlState.audioTransientAutomation
	) {
		automationBridge.resetTransientDetector(
			latestControlState.audioTransientAutomation
				? latestAutomationAudioFeatures
				: undefined,
		);
	}
	audioControlRouter.setEnabled(latestControlState.audioControlMode);
	controlStateLog.record(
		prev as Record<string, unknown> | null,
		latestControlState as unknown as Record<string, unknown>,
	);
	// An external weight edit (automation replay, OSC, or MIDI) lands on a
	// layerWeight slot; forward it into the stack *before* the fan-out so the
	// recomposite (and its corrected frame from the guarded merge) precedes this
	// broadcast — clients then receive a single already-consistent frame rather
	// than a stale-composite frame followed by the correction. Skip
	// controller-driven writes (guarded) and the very first state (no prev).
	if (!applyingLayerWeights && prev) {
		applyLayerWeightControl(
			layerController,
			prev as unknown as Record<string, unknown>,
			latestControlState as unknown as Record<string, unknown>,
		);
	}
	const data = JSON.stringify({
		address: "/aurora/control/state",
		args: [latestControlState],
	});
	sockets.forEach((ws) => ws.send(data));
};
const broadcastError = (description: string) => {
	const data = JSON.stringify({
		address: "/aurora/error",
		error: description,
		args: [],
	});
	sockets.forEach((ws) => ws.send(data));
};
const broadcastPresetCommand = (address: string) => {
	const data = JSON.stringify({ address, args: [] });
	sockets.forEach((ws) => ws.send(data));
};
const broadcastImportedShader = (wgsl: string, meta: unknown) => {
	const data = JSON.stringify({
		address: "/aurora/shader/imported",
		args: [{ wgsl, meta }],
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

	const current = currentControlState();
	const arg = msg.args?.[0];

	if (msg.address.startsWith(VST_CONTROL_PREFIX)) {
		const name = msg.address.slice(VST_CONTROL_PREFIX.length);
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
			case "hue":
			case "palette":
				mergePaletteHue(value);
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
			case "active_shader":
				mergeControlState({
					activeShader: Math.max(0, Math.min(MAX_SHADER_INDEX, Math.floor(value))),
				});
				break;
			case "deck_a_gpu_shader":
				mergeControlState({
					deckAGpuShader: Math.max(0, Math.min(MAX_SHADER_INDEX, Math.floor(value))),
				});
				break;
			case "deck_b_gpu_shader":
				mergeControlState({
					deckBGpuShader: Math.max(0, Math.min(MAX_SHADER_INDEX, Math.floor(value))),
				});
				break;
			case "palette_saturation":
				mergeControlState({ paletteSaturation: value });
				break;
			case "palette_brightness":
				mergeControlState({ paletteBrightness: value });
				break;
			case "grid_density":
				mergeControlState({ gridDensity: value });
				break;
			case "grid_diamond":
				mergeControlState({ gridDiamond: value });
				break;
			case "grid_line_width":
				mergeControlState({ gridLineWidth: value });
				break;
			case "grid_shape_mix":
				mergeControlState({ gridShapeMix: value });
				break;
			case "ema_alpha_bass":
				mergeControlState({
					emaAlphas: {
						...current.emaAlphas,
						bass: clamp(value, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.bass),
					},
				});
				break;
			case "ema_alpha_energy":
				mergeControlState({
					emaAlphas: {
						...current.emaAlphas,
						energy: clamp(value, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.energy),
					},
				});
				break;
			case "ema_alpha_mid":
				mergeControlState({
					emaAlphas: {
						...current.emaAlphas,
						mid: clamp(value, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.mid),
					},
				});
				break;
			case "ema_alpha_high":
				mergeControlState({
					emaAlphas: {
						...current.emaAlphas,
						high: clamp(value, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.high),
					},
				});
				break;
			case "ema_alpha_pulse":
				mergeControlState({
					emaAlphas: {
						...current.emaAlphas,
						pulse: clamp(value, 0.01, 1, DEFAULT_AUDIO_EMA_ALPHAS.pulse),
					},
				});
				break;
		}

		return;
	}

	if (msg.address.startsWith(VST_TRIGGER_PREFIX)) {
		const name = msg.address.slice(VST_TRIGGER_PREFIX.length);
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

	if (msg.address.startsWith(VST_CUE_PREFIX)) {
		const name = msg.address.slice(VST_CUE_PREFIX.length);
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
			cueDeckAGpuShader: finiteNumber(
				cue.deckAGpuShader,
				current.deckAGpuShader,
			),
			cueDeckBGpuShader: finiteNumber(
				cue.deckBGpuShader,
				current.deckBGpuShader,
			),
			flashVersion:
				name === "panic" ? current.flashVersion : current.flashVersion + 1,
		});
	}
};

// Drive a continuous morph between two named cue presets. Validation has
// already confirmed from/to are real cues and position is numeric. The two
// endpoints are seeded from the current live state so morph keys that neither
// cue defines (e.g. speed/ringOpacity/maxBrightness — only panic sets the
// latter) stay put rather than snapping to defaults; this keeps position 0 a
// no-op on the "from" end and matches normal partial-cue-apply semantics. The
// result — plus the clamped fader position itself — is routed through
// mergeControlState, so coerceControlState clamps every field before broadcast.
const applyPresetMorph = (msg: OscMsg) => {
	const args = msg.args ?? [];
	const fromName = String(valueOf(args[0]));
	const toName = String(valueOf(args[1]));
	const position = clampMorphPosition(valueOf(args[2]));
	const curveArg = args.length > 3 ? valueOf(args[3]) : undefined;
	const curve: MorphCurve = isMorphCurve(curveArg) ? curveArg : "linear";

	const base = currentControlState();
	const from = { ...base, ...cuePresets[fromName] };
	const to = { ...base, ...cuePresets[toName] };
	const morphed = morphPresetStates(from, to, position, curve);
	mergeControlState({ ...morphed, morph: position });
};

// Composite preset layers. The bridge holds the layer stack and a snapshot of
// the underlying state (`layerBase`) captured the moment the stack becomes
// non-empty. Every mutation recomposites the stack over that fixed base and
// merges the result, so the underlying values are never destroyed: dropping a
// weight to 0, removing, or clearing recomputes the composition as if the layer
// were never there. When the last layer goes, the base is merged back and
// forgotten so future edits re-capture a fresh floor.
const layerController = createLayerController({
	captureFloor: () => pickLayerState(currentControlState()),
	// Merge the recomposited state together with the current stack weights, so the
	// weight slots in ControlState always mirror the live stack. The flag marks
	// this as a controller-driven write so broadcastControl doesn't loop it back
	// through applyLayerWeightControl.
	merge: (state) => {
		applyingLayerWeights = true;
		try {
			mergeControlState({
				...state,
				...(layerWeightFields(layerController.stack) as Partial<ControlState>),
			});
		} finally {
			applyingLayerWeights = false;
		}
	},
	onFull: () =>
		console.error(
			`[OSC] dropping preset layer add — stack already at max ${PRESET_LAYER_MAX}`,
		),
});

const applyPresetLayer = (msg: OscMsg) => {
	const args = msg.args ?? [];
	const intArg = (i: number) => Math.trunc(Number(valueOf(args[i])));

	switch (msg.address) {
		case PRESET_LAYER_ADD_ADDRESS: {
			const name = String(valueOf(args[0]));
			const weight = args.length > 1 ? Number(valueOf(args[1])) : 1;
			layerController.add({
				name,
				state: pickLayerState(cuePresets[name] as Record<string, unknown>),
				weight,
			});
			break;
		}
		case PRESET_LAYER_WEIGHT_ADDRESS:
			layerController.setWeight(intArg(0), Number(valueOf(args[1])));
			break;
		case PRESET_LAYER_REMOVE_ADDRESS:
			layerController.remove(intArg(0));
			break;
		case PRESET_LAYER_MOVE_ADDRESS:
			layerController.move(intArg(0), intArg(1));
			break;
		case PRESET_LAYER_CLEAR_ADDRESS:
			layerController.clear();
			break;
		default:
			return;
	}
};

const isMidiClockActive = (): boolean =>
	lastMidiClockAt > 0 && Date.now() - lastMidiClockAt < MIDI_CLOCK_TIMEOUT_MS;

const MIDI_BPM_UPDATE_INTERVAL_MS = 50;

function onMidiClock(): void {
	const now = Date.now();

	// Clear stale window when clock restarts after a gap
	const lastTs = midiClockTimestamps[midiClockTimestamps.length - 1];
	if (lastTs !== undefined && now - lastTs > MIDI_CLOCK_TIMEOUT_MS) {
		midiClockTimestamps = [];
	}

	lastMidiClockAt = now;
	midiClockTimestamps.push(now);
	if (midiClockTimestamps.length > MIDI_CLOCK_WINDOW + 1) {
		midiClockTimestamps.shift();
	}

	if (now - lastMidiClockBpmUpdate < MIDI_BPM_UPDATE_INTERVAL_MS) return;

	const rawBpm = deriveBpmFromTimestamps(midiClockTimestamps);
	if (rawBpm === null) return;

	lastMidiClockBpmUpdate = now;

	const bpm = Math.round(rawBpm * 10) / 10;
	// Drop sub-0.05 jitter so the BPM slider and beat phase stay steady while
	// a MIDI clock source is active.
	const currentBpm = latestControlState?.bpm ?? 0;
	if (Math.abs(bpm - currentBpm) < 0.05) return;
	// MIDI clock is lower priority than Ableton Link. Keep recording timestamps
	// above so MIDI takes over instantly if Link drops, but stay silent on the
	// tempo mirror while Link is the authoritative source — otherwise the mirror
	// flaps between two disagreeing sources.
	if (
		selectTempoSource({
			linkActive: isAbletonLinkActive(),
			midiActive: true,
		}) !== "midi"
	)
		return;
	mergeControlState({ bpm });
	// Also deliver tempo on the AbletonOSC path so the renderer picks it up
	// regardless of whether the control page is connected.
	const tempoData = JSON.stringify({
		address: OSC_ADDRESSES.TEMPO,
		args: [bpm],
	});
	sockets.forEach((ws) => ws.send(tempoData));
}

function openMidiClockDevice(devicePath: string): void {
	const stream = createReadStream(devicePath);
	stream.on("data", (chunk: Buffer | string) => {
		const buf =
			typeof chunk === "string" ? Buffer.from(chunk, "binary") : chunk;
		for (const byte of buf) {
			parseMidiByte(byte);
		}
	});
	stream.on("error", (err: Error) => {
		console.error(`MIDI clock error on ${devicePath}:`, err.message);
	});
	stream.once("open", () => {
		console.log(`MIDI clock: listening on ${devicePath}`);
	});
}

const isAbletonLinkActive = (): boolean =>
	isLinkActive(lastLinkUpdateAt, Date.now());

// Minimal surface of the optional native `abletonlink` module we depend on.
type AbletonLinkSession = {
	enable?: () => void;
	quantum?: number;
	numPeers?: number;
	startUpdate: (
		intervalMs: number,
		cb: (beat: number, phase: number, bpm: number) => void,
	) => void;
};

let lastLinkTempoSent = 0;
let lastLinkTempoValue = 0;

function broadcastLinkTempo(tempo: number): void {
	const rounded = Math.round(tempo * 10) / 10;
	// Suppress tiny jitter from Link while still keeping beat phase updates live.
	if (
		Math.abs(rounded - lastLinkTempoValue) < 0.05 &&
		Date.now() - lastLinkTempoSent < 200
	) {
		return;
	}
	lastLinkTempoValue = rounded;
	lastLinkTempoSent = Date.now();
	const tempoData = JSON.stringify({
		address: OSC_ADDRESSES.TEMPO,
		args: [rounded],
	});
	sockets.forEach((ws) => {
		ws.send(tempoData);
	});
}

function broadcastLinkBeat(beat: number): void {
	const beatData = JSON.stringify({
		address: OSC_ADDRESSES.BEAT,
		args: [beat],
	});
	sockets.forEach((ws) => {
		ws.send(beatData);
	});
}

// Join an Ableton Link session and stream its shared tempo/beat-phase onto the
// AbletonOSC mirror addresses. Opt-in via ABLETON_LINK_ENABLED=1; the native
// `abletonlink` module is loaded lazily so the default build needs no native
// deps and idle memory stays untouched when the feature is off.
function startAbletonLink(): void {
	let LinkCtor: new (...args: unknown[]) => AbletonLinkSession;
	try {
		LinkCtor = require("abletonlink");
	} catch (error) {
		console.warn(
			`Ableton Link: native 'abletonlink' module unavailable (${error instanceof Error ? error.message : error}); install it to enable Link sync. Skipping.`,
		);
		return;
	}

	let link: AbletonLinkSession;
	try {
		link = new LinkCtor();
		link.enable?.();
	} catch (error) {
		console.warn(
			`Ableton Link: failed to start session (${error instanceof Error ? error.message : error}). Skipping.`,
		);
		return;
	}

	const quantum =
		typeof link.quantum === "number" && link.quantum > 0
			? link.quantum
			: LINK_DEFAULT_QUANTUM;

	link.startUpdate(LINK_UPDATE_INTERVAL_MS, (beat, phase, bpm) => {
		lastLinkUpdateAt = Date.now();
		linkNumPeers = typeof link.numPeers === "number" ? link.numPeers : 0;
		const frame = deriveLinkFrame(
			{ beat, phase, bpm, numPeers: linkNumPeers },
			quantum,
		);
		if (!frame) return;
		// Link owns beat phase whenever it is active, even alongside MIDI clock.
		broadcastLinkBeat(frame.beat);
		// Link is the highest-priority tempo source, so it always drives the
		// mirror while active — even when MIDI clock is also running.
		broadcastLinkTempo(frame.tempo);
	});

	console.log(`Ableton Link: session active (quantum ${quantum})`);
}

const _switchCaseNames: ReadonlySet<string> = new Set([
	"crossfade",
	"bpm",
	"speed",
	"intensity",
	"feedback",
	"depth",
	"hue",
	"palette",
	"deck_a_mode",
	"deck_b_mode",
	"rings",
	"ring_opacity",
	"strobe",
	"strobe_lockout",
	"blackout",
	"freeze",
	"show_gpu_palette",
	"max_brightness",
	"beat_sync",
	"bar_sync",
	"demo_mode",
	"active_shader",
	"deck_a_gpu_shader",
	"deck_b_gpu_shader",
	"palette_saturation",
	"palette_brightness",
	"grid_density",
	"grid_diamond",
	"grid_line_width",
	"grid_shape_mix",
	"ema_alpha_bass",
	"ema_alpha_energy",
	"ema_alpha_mid",
	"ema_alpha_high",
	"ema_alpha_pulse",
]);
if (
	![...VST_CONTROL_NAMES].every((n) => _switchCaseNames.has(n)) ||
	![..._switchCaseNames].every((n) => VST_CONTROL_NAMES.has(n))
) {
	throw new Error(
		"VST_CONTROL_NAMES out of sync with applyVstControlMessage switch",
	);
}

const visualServer = Bun.serve({
	port,
	async fetch(request, server) {
		const url = new URL(request.url);
		const pathname = decodeURIComponent(url.pathname);

		if (pathname === "/ws") {
			if (server.upgrade(request)) return undefined;
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		if (pathname === "/debug/state-log") {
			return new Response(JSON.stringify(controlStateLog.toArray()), {
				headers: { "content-type": "application/json; charset=utf-8" },
			});
		}

		const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);

		if (relativePath.includes("..")) {
			return new Response("Not found", { status: 404 });
		}

		const file = resolveStaticFile(relativePath);
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
					address: "/aurora/osc/connected",
					args: [oscReady ? 1 : 0],
				}),
			);
			if (latestControlState) {
				ws.send(
					JSON.stringify({
						address: "/aurora/control/state",
						args: [latestControlState],
					}),
				);
			}
		},
		close(ws) {
			sockets.delete(ws);
		},
		message(ws, raw) {
			try {
				const parsed = JSON.parse(raw.toString()) as Partial<OscMsg> &
					Record<string, unknown>;
				if (typeof parsed.address === "string") {
					if (parsed.address === "/aurora/control/state") {
						const rawState = migrateControlState(
							Array.isArray(parsed.args) ? parsed.args[0] : null,
						);
						if (!validateControlStateVersion(rawState, "WebSocket client")) {
							ws.send(
								JSON.stringify({
									address: "/aurora/error",
									error: `control_state_rejected: schema version mismatch (got ${(rawState as Record<string, unknown>)?.schemaVersion ?? null}, expected ${CONTROL_STATE_SCHEMA_VERSION})`,
								}),
							);
							return;
						}
						broadcastControl(rawState);
					} else if (
						parsed.address === "/aurora/error" &&
						typeof parsed.error === "string"
					) {
						broadcastError(parsed.error);
					} else if (parsed.address === PRESET_MORPH_ADDRESS) {
						const morphMsg = {
							address: parsed.address,
							args: Array.isArray(parsed.args) ? parsed.args : [],
						};
						if (validatePresetMorphOscMsg(morphMsg, "WS client", cueNames)) {
							applyPresetMorph(morphMsg);
						}
					} else if (parsed.address.startsWith(PRESET_LAYER_PREFIX)) {
						const layerMsg = {
							address: parsed.address,
							args: Array.isArray(parsed.args) ? parsed.args : [],
						};
						if (validatePresetLayerOscMsg(layerMsg, "WS client", cueNames)) {
							applyPresetLayer(layerMsg);
						}
					} else if (parsed.address.startsWith("/aurora/preset/")) {
						if (
							validatePresetOscMsg({ address: parsed.address }, "WS client")
						) {
							broadcastPresetCommand(parsed.address);
						}
					} else if (parsed.address === "/aurora/ping") {
						ws.send(
							JSON.stringify({
								address: "/aurora/pong",
								id: typeof parsed.id === "number" ? parsed.id : 0,
							}),
						);
					} else if (parsed.address === "/aurora/audio/features") {
						// Browser audio features fed back to the bridge. The router ignores
						// these unless ControlState.audioControlMode is enabled. While this
						// feed is live it is the authoritative router source and suppresses
						// the demo loop (see the demo-loop guard).
						const nowMs = Date.now();
						lastBrowserAudioFeaturesMs = nowMs;
						const rawBrowserFeatures = coerceAudioFeatures(
							Array.isArray(parsed.args) ? parsed.args[0] : undefined,
						);
						// Smooth raw browser features through the same EMA the demo and
						// live-Ableton feeds use, so all three router sources share one
						// response curve (the browser sends per-frame, ~20 Hz).
						const smoothedBrowser = stepAudioEma(
							browserAudioEma,
							rawBrowserFeatures,
							latestControlState?.emaAlphas ?? audioEmaAlphas,
							DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
						);
						audioControlRouter.onFeatures(smoothedBrowser, nowMs);
						maybeFeedAutomationAudio(smoothedBrowser, nowMs);
						broadcastBrowserAudioFeatures(smoothedBrowser, nowMs);
					} else if (
						parsed.address.startsWith("/aurora/automation/transient/")
					) {
						applyTransientConfigMsg(
							parsed.address,
							Array.isArray(parsed.args) ? parsed.args[0] : undefined,
						);
					} else if (parsed.address.startsWith("/aurora/automation/")) {
						automationBridge.onOscAddress(parsed.address);
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

// Shadertoy API key supplied at runtime via the controls UI. Held only in
// memory on the bridge process: never persisted, never sent back to the
// client, and never logged. Falls back to the SHADERTOY_API_KEY env var if
// the runtime slot is empty so existing setups keep working.
let runtimeShadertoyKey: string | null = null;
const SHADERTOY_KEY_RE = /^[A-Za-z0-9]{8,128}$/;
const getShadertoyKey = (): string =>
	runtimeShadertoyKey ?? Bun.env.SHADERTOY_API_KEY ?? "";
const getShadertoyKeyStatus = () => ({
	configured: getShadertoyKey().length > 0,
	source: runtimeShadertoyKey
		? ("runtime" as const)
		: Bun.env.SHADERTOY_API_KEY
			? ("env" as const)
			: null,
});

const controlsServer = Bun.serve({
	port: controlsPort,
	hostname: "127.0.0.1",
	async fetch(request) {
		const url = new URL(request.url);
		const pathname = decodeURIComponent(url.pathname);

		if (pathname === "/api/shadertoy/key") {
			if (request.method === "GET") {
				return Response.json(getShadertoyKeyStatus());
			}
			if (request.method === "DELETE") {
				runtimeShadertoyKey = null;
				return Response.json({ ok: true, ...getShadertoyKeyStatus() });
			}
			if (request.method === "POST") {
				let payload: { key?: unknown };
				try {
					payload = (await request.json()) as { key?: unknown };
				} catch {
					return Response.json(
						{ ok: false, error: "Body must be JSON { key: string }" },
						{ status: 400 },
					);
				}
				const key = typeof payload.key === "string" ? payload.key.trim() : "";
				if (!key) {
					return Response.json(
						{ ok: false, error: "Missing `key` field" },
						{ status: 400 },
					);
				}
				if (!SHADERTOY_KEY_RE.test(key)) {
					return Response.json(
						{
							ok: false,
							error:
								"Key must be 8–128 alphanumeric characters (Shadertoy API key format)",
						},
						{ status: 400 },
					);
				}
				runtimeShadertoyKey = key;
				return Response.json({ ok: true, ...getShadertoyKeyStatus() });
			}
			return new Response("Method not allowed", { status: 405 });
		}

		if (request.method === "POST" && pathname === "/api/shadertoy/import") {
			const apiKey = getShadertoyKey();
			if (!apiKey) {
				return Response.json(
					{
						ok: false,
						error:
							"Shadertoy API key not configured. Enter one in the controls UI or set SHADERTOY_API_KEY.",
					},
					{ status: 500 },
				);
			}
			let payload: { url?: string; id?: string };
			try {
				payload = (await request.json()) as { url?: string; id?: string };
			} catch {
				return Response.json(
					{
						ok: false,
						error: "Body must be JSON { url: string } or { id: string }",
					},
					{ status: 400 },
				);
			}
			const target = payload.url ?? payload.id ?? "";
			if (typeof target !== "string" || target.length === 0) {
				return Response.json(
					{ ok: false, error: "Missing `url` or `id` field" },
					{ status: 400 },
				);
			}
			const result = await importShadertoyUrl(target, apiKey);
			if (!result.ok) {
				return Response.json(result, { status: 400 });
			}
			broadcastImportedShader(result.wgsl, result.meta);
			return Response.json({
				ok: true,
				meta: result.meta,
				usedIChannel: result.usedIChannel,
				wgslLength: result.wgsl.length,
			});
		}

		const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);

		if (relativePath.includes("..")) {
			return new Response("Not found", { status: 404 });
		}

		const file = resolveControlsFile(relativePath);
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

	const data = JSON.stringify({ address: "/aurora/osc/connected", args: [1] });
	sockets.forEach((ws) => ws.send(data));
});

udp.on("message", (msg: OscMsg) => {
	if (!validateLiveOscMsg(msg, `AbletonOSC :${liveRecvPort}`)) return;
	// AbletonOSC tempo is the "internal" source — the lowest priority. Any active
	// external clock (Link or MIDI) overrides it, and Link additionally owns beat
	// phase while active.
	if (
		msg.address === OSC_ADDRESSES.TEMPO &&
		selectTempoSource({
			linkActive: isAbletonLinkActive(),
			midiActive: isMidiClockActive(),
		}) !== "internal"
	)
		return;
	if (msg.address === OSC_ADDRESSES.BEAT && isAbletonLinkActive()) return;
	broadcast(msg);
});
udp.on("error", (error: Error) => {
	console.error("OSC error:", error.message);
	broadcastError(`OSC UDP error: ${error.message}`);
});
udp.open();

vstControlUdp.on("ready", () => {
	console.log(`VST control OSC ready: listening :${vstControlRecvPort}`);
});
vstControlUdp.on("message", (msg: OscMsg) => {
	if (msg.address === PRESET_MORPH_ADDRESS) {
		if (
			validatePresetMorphOscMsg(msg, `VST :${vstControlRecvPort}`, cueNames)
		) {
			applyPresetMorph(msg);
		}
		return;
	}
	if (msg.address.startsWith(PRESET_LAYER_PREFIX)) {
		if (
			validatePresetLayerOscMsg(msg, `VST :${vstControlRecvPort}`, cueNames)
		) {
			applyPresetLayer(msg);
		}
		return;
	}
	if (msg.address.startsWith("/aurora/preset/")) {
		if (validatePresetOscMsg(msg, `VST :${vstControlRecvPort}`)) {
			broadcastPresetCommand(msg.address);
		}
		return;
	}
	if (msg.address.startsWith("/aurora/automation/transient/")) {
		applyTransientConfigMsg(msg.address, valueOf(msg.args?.[0]));
		return;
	}
	if (msg.address.startsWith("/aurora/automation/")) {
		automationBridge.onOscAddress(msg.address);
		return;
	}
	if (!validateVstOscMsg(msg, `VST :${vstControlRecvPort}`, cueNames)) return;
	applyVstControlMessage(msg);
});
vstControlUdp.on("error", (error: Error) => {
	console.error("VST control OSC error:", error.message);
	broadcastError(`VST control UDP error: ${error.message}`);
});
vstControlUdp.open();

setInterval(() => {
	const now = Date.now();
	const linkActive = isAbletonLinkActive();
	const midiActive = isMidiClockActive();
	const diagnostics = {
		sockets: sockets.size,
		oscReady,
		oscActive: now - latestOscFrameAt < OSC_ACTIVE_TTL_MS,
		liveHost,
		liveSendPort,
		liveRecvPort,
		vstControlRecvPort,
		midiClockDevice: midiClockDevice || null,
		midiClockActive: midiActive,
		abletonLinkEnabled,
		abletonLinkActive: linkActive,
		abletonLinkPeers: linkNumPeers,
		clockSource: selectTempoSource({ linkActive, midiActive }),
		visualPort: port,
		controlsPort,
		numTracks,
		vstControlActive: now - latestVstControlAt < 3000,
		demoMode: Boolean(latestControlState?.demoMode),
		replaying: Boolean(latestControlState?.replaying),
		mappedTracks: latestControlState?.trackMapping ?? defaultTrackMapping(),
	};
	const data = JSON.stringify({
		address: "/aurora/server/diagnostics",
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
	const rawFeatures: AudioFeatures = {
		energy: clamp(energy, 0, 1, 0.5),
		bass: clamp(0.56 + Math.sin(now * 2.4) * 0.36, 0, 1, 0.5),
		mid: clamp(0.45 + Math.sin(now * 3.1 + 1.4) * 0.3, 0, 1, 0.5),
		high: clamp(Math.max(0, Math.sin(now * 12.0)) * 0.9, 0, 1, 0.2),
		pulse: beat < 0.18 ? 1 : Math.max(0, 1 - beat / 0.42),
	};
	const smoothed = stepAudioEma(
		demoAudioEma,
		rawFeatures,
		latestControlState?.emaAlphas ?? audioEmaAlphas,
		DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
	);
	maybeFeedAutomationAudio(smoothed, Date.now());
	// Drive the router from the demo feed only when no browser source is active;
	// otherwise both streams would share the router's edge state and thrash.
	const routerNowMs = Date.now();
	if (
		routerNowMs - lastBrowserAudioFeaturesMs >=
		BROWSER_AUDIO_FEATURE_TTL_MS
	) {
		audioControlRouter.onFeatures(smoothed, routerNowMs);
	}
	const demo = {
		tempo: state.bpm,
		beat,
		deckA: clamp(0.48 + Math.sin(now * 1.7) * 0.42, 0, 1, 0.5),
		deckB: clamp(0.48 + Math.cos(now * 1.35) * 0.42, 0, 1, 0.5),
		energy: smoothed.energy,
		bass: smoothed.bass,
		mid: smoothed.mid,
		high: smoothed.high,
		pulse: smoothed.pulse,
	};
	const data = JSON.stringify({ address: "/aurora/demo/audio", args: [demo] });
	sockets.forEach((ws) => ws.send(data));
}, 50);

console.log(`aurora VJ output listening on ${visualServer.url}`);
console.log(`aurora controls listening on ${controlsServer.url}`);

if (midiClockDevice) {
	openMidiClockDevice(midiClockDevice);
}

if (abletonLinkEnabled) {
	startAbletonLink();
}

if (hotReload) {
	const pkgDir = `${root}/dist/pkg`;
	let reloadTimer: ReturnType<typeof setTimeout> | null = null;
	try {
		watch(pkgDir, () => {
			if (reloadTimer) clearTimeout(reloadTimer);
			reloadTimer = setTimeout(() => {
				reloadTimer = null;
				const data = JSON.stringify({
					address: "/aurora/dev/reload",
					args: [],
				});
				sockets.forEach((ws) => ws.send(data));
				console.log("[hot-reload] dist/pkg changed — reload signal sent");
			}, 300);
		});
		console.log("[hot-reload] watching dist/pkg/");
	} catch (error) {
		console.warn(
			"[hot-reload] watcher failed to start:",
			error instanceof Error ? error.message : error,
		);
	}

	const shadersDir = `${root}/assets/shaders`;
	let shaderReloadTimer: ReturnType<typeof setTimeout> | null = null;
	try {
		watch(shadersDir, (_event, filename) => {
			if (!filename?.endsWith(".wgsl")) return;
			if (shaderReloadTimer) clearTimeout(shaderReloadTimer);
			shaderReloadTimer = setTimeout(() => {
				shaderReloadTimer = null;
				const data = JSON.stringify({
					address: "/aurora/dev/reload",
					args: [],
				});
				sockets.forEach((ws) => ws.send(data));
				console.log(
					`[hot-reload] shader changed (${filename ?? "unknown"}) — reload signal sent`,
				);
			}, 150); // shorter than pkgDir watcher — shader files are small and don't trigger cascading rebuilds
		});
		console.log("[hot-reload] watching assets/shaders/");
	} catch (error) {
		console.warn(
			"[hot-reload] shader watcher failed to start:",
			error instanceof Error ? error.message : error,
		);
	}
}
