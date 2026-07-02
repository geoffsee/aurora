import type { AudioCurveShape } from "../../../shared/osc-validation.ts";
import type { OutputRoute } from "../../../shared/output-routing.ts";
import type { AudioEmaAlphas } from "../../../bridge/audio-ema.ts";

export type TrackMapping = {
	deckAStart: number;
	deckACount: number;
	deckBStart: number;
	deckBCount: number;
	bassTrack: number;
	midTrack: number;
	highTrack: number;
};

export type BandCurves = {
	energy: AudioCurveShape;
	bass: AudioCurveShape;
	mid: AudioCurveShape;
	high: AudioCurveShape;
};

export type ControlState = {
	schemaVersion: number;
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
};

export type OscMeters = {
	lastFrameAt: number;
	beat: number;
	beatIndex: number;
	energy: number;
	bass: number;
	mid: number;
	high: number;
	deckA: number;
	deckB: number;
	lastBrowserAudioAt: number;
	previousEnergy: number;
	lastEnvelopeAt: number;
};

export type Diagnostics = {
	sockets: number;
	oscReady: boolean;
	oscActive: boolean;
	demoMode: boolean;
	replaying: boolean;
	clockSource: string | null;
};

export type BridgeStatus = "connecting" | "live" | "error";

export type CurveMode = "snap" | "linear" | "ease";

export type CuePreset = Partial<
	Pick<
		ControlState,
		| "crossfade"
		| "intensity"
		| "feedback"
		| "depth"
		| "palette"
		| "deckAMode"
		| "deckBMode"
		| "deckAGpuShader"
		| "deckBGpuShader"
		| "maxBrightness"
		| "strobe"
		| "strobeLockout"
	>
>;

export type RecordingFrame = { t: number; state: ControlState };

export type TriggerBinding =
	| { type: "midi-note"; note: number; channel: number; action: string }
	| {
			type: "midi-cc";
			cc: number;
			channel: number;
			threshold: number;
			action: string;
	  }
	| { type: "osc"; address: string; action: string };
