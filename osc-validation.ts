export type OscArg = { type: string; value: unknown } | unknown;
export type OscMsg = { address: string; args?: OscArg[] };

// CONTROL_STATE_SCHEMA_VERSION tracks the ControlState wire format.
// To bump: increment this integer, add a migration branch in the WebSocket
// message handler in index.ts that transforms the old payload shape before
// passing it to broadcastControl, and update defaultState() in controls.html
// to emit the new version number.
// v2: added activeShader field (0 = vj_palette, 1 = vj_grid)
// v3: added bandCurves field (per-band audio-reactive curve shaping)
export const CONTROL_STATE_SCHEMA_VERSION = 3;

export type AudioCurveShape = "linear" | "exponential" | "logarithmic";
export const AUDIO_CURVE_SHAPES: readonly AudioCurveShape[] = [
	"linear",
	"exponential",
	"logarithmic",
] as const;
export const isAudioCurveShape = (v: unknown): v is AudioCurveShape =>
	v === "linear" || v === "exponential" || v === "logarithmic";

export const validateControlStateVersion = (
	state: unknown,
	origin: string,
): boolean => {
	const version =
		state && typeof state === "object"
			? (state as Record<string, unknown>).schemaVersion
			: undefined;
	if (version !== CONTROL_STATE_SCHEMA_VERSION) {
		console.error(
			JSON.stringify({
				event: "control_state_rejected",
				reason: "schema_version_mismatch",
				expected: CONTROL_STATE_SCHEMA_VERSION,
				received: version ?? null,
				origin,
			}),
		);
		return false;
	}
	return true;
};

export const VST_CONTROL_PREFIX = "/bevyosc/vst/control/";
export const VST_TRIGGER_PREFIX = "/bevyosc/vst/trigger/";
export const VST_CUE_PREFIX = "/bevyosc/vst/cue/";

export const PRESET_SAVE_PREFIX = "/bevyosc/preset/save/";
export const PRESET_RECALL_PREFIX = "/bevyosc/preset/recall/";
export const PRESET_SLOT_MIN = 1;
export const PRESET_SLOT_MAX = 6;

export const VST_CONTROL_NAMES: ReadonlySet<string> = new Set([
	"crossfade",
	"bpm",
	"speed",
	"intensity",
	"feedback",
	"depth",
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
]);

export const VST_TRIGGER_NAMES: ReadonlySet<string> = new Set(["flash", "reset"]);

const isNumericOscArg = (arg: OscArg): boolean => {
	if (arg && typeof arg === "object" && "type" in arg) {
		const t = (arg as { type: string }).type;
		return t === "f" || t === "i" || t === "d" || t === "h";
	}
	return typeof arg === "number";
};

const oscArgType = (arg: OscArg): string => {
	if (arg && typeof arg === "object" && "type" in arg) {
		return (arg as { type: string }).type;
	}
	return typeof arg;
};

export const validateLiveOscMsg = (msg: OscMsg, origin: string): boolean => {
	if (!msg.address.startsWith("/live/")) {
		console.error(
			`[OSC] dropping unrecognised address "${msg.address}" from ${origin}`,
		);
		return false;
	}
	return true;
};

export const validatePresetOscMsg = (msg: OscMsg, origin: string): boolean => {
	const { address } = msg;
	const isSave = address.startsWith(PRESET_SAVE_PREFIX);
	const isRecall = address.startsWith(PRESET_RECALL_PREFIX);
	if (!isSave && !isRecall) return false;

	const suffix = isSave
		? address.slice(PRESET_SAVE_PREFIX.length)
		: address.slice(PRESET_RECALL_PREFIX.length);
	const n = Number(suffix);
	if (!Number.isInteger(n) || n < PRESET_SLOT_MIN || n > PRESET_SLOT_MAX) {
		console.error(
			`[OSC] dropping invalid preset slot "${address}" from ${origin} — slot must be ${PRESET_SLOT_MIN}–${PRESET_SLOT_MAX}`,
		);
		return false;
	}
	return true;
};

export const validateVstOscMsg = (
	msg: OscMsg,
	origin: string,
	cueNames: ReadonlySet<string>,
): boolean => {
	const { address } = msg;
	const args = msg.args ?? [];

	if (address.startsWith(VST_CONTROL_PREFIX)) {
		const name = address.slice(VST_CONTROL_PREFIX.length);
		if (!VST_CONTROL_NAMES.has(name)) {
			console.error(
				`[VST OSC] dropping unrecognised address "${address}" from ${origin}`,
			);
			return false;
		}
		if (args.length !== 1) {
			console.error(
				`[VST OSC] dropping malformed payload for "${address}" — expected 1 arg, got ${args.length} from ${origin}`,
			);
			return false;
		}
		if (!isNumericOscArg(args[0])) {
			console.error(
				`[VST OSC] dropping malformed payload for "${address}" — expected numeric arg, got type "${oscArgType(args[0])}" from ${origin}`,
			);
			return false;
		}
		return true;
	}

	if (address.startsWith(VST_TRIGGER_PREFIX)) {
		const name = address.slice(VST_TRIGGER_PREFIX.length);
		if (!VST_TRIGGER_NAMES.has(name)) {
			console.error(
				`[VST OSC] dropping unrecognised address "${address}" from ${origin}`,
			);
			return false;
		}
		if (args.length !== 1) {
			console.error(
				`[VST OSC] dropping malformed payload for "${address}" — expected 1 arg, got ${args.length} from ${origin}`,
			);
			return false;
		}
		if (!isNumericOscArg(args[0])) {
			console.error(
				`[VST OSC] dropping malformed payload for "${address}" — expected numeric arg, got type "${oscArgType(args[0])}" from ${origin}`,
			);
			return false;
		}
		return true;
	}

	if (address.startsWith(VST_CUE_PREFIX)) {
		const name = address.slice(VST_CUE_PREFIX.length);
		if (!cueNames.has(name)) {
			console.error(
				`[VST OSC] dropping unrecognised address "${address}" from ${origin}`,
			);
			return false;
		}
		if (args.length !== 1) {
			console.error(
				`[VST OSC] dropping malformed payload for "${address}" — expected 1 arg, got ${args.length} from ${origin}`,
			);
			return false;
		}
		// VST always sends a float param value even for valueless triggers; we
		// validate the type for consistency but do not use the value for cues.
		if (!isNumericOscArg(args[0])) {
			console.error(
				`[VST OSC] dropping malformed payload for "${address}" — expected numeric arg, got type "${oscArgType(args[0])}" from ${origin}`,
			);
			return false;
		}
		return true;
	}

	console.error(
		`[VST OSC] dropping unrecognised address "${address}" from ${origin}`,
	);
	return false;
};
