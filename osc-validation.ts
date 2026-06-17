import contract from "./vst-osc-contract.json" with { type: "json" };

export type OscArg = { type: string; value: unknown } | unknown;
export type OscMsg = { address: string; args?: OscArg[] };

const assertSubset = (
	kind: string,
	emitted: readonly string[],
	accepted: readonly string[],
): void => {
	const acceptSet = new Set(accepted);
	for (const name of emitted) {
		if (!acceptSet.has(name)) {
			throw new Error(
				`VST contract divergence: ${kind} "${name}" is emitted by the VST but not in bridgeAccepts`,
			);
		}
	}
};
assertSubset(
	"control",
	contract.controls.vstEmitted,
	contract.controls.bridgeAccepts,
);
assertSubset(
	"trigger",
	contract.triggers.vstEmitted,
	contract.triggers.bridgeAccepts,
);
assertSubset("cue", contract.cues.vstEmitted, contract.cues.bridgeAccepts);

export const VST_OSC_CONTRACT = contract;

// CONTROL_STATE_SCHEMA_VERSION tracks the ControlState wire format.
// To bump: increment this integer, add a migration branch in
// control-state-schema.ts, and update defaultState() in controls.html
// to emit the new version number.
// v2: added activeShader field (0..3 = palette variants, 4 = grid,
//      5..8 = tunnel/glitch/fluid/truchet — packed into vj_palette.wgsl)
// v3: added bandCurves field (per-band audio-reactive curve shaping)
// v4: added emaAlphas field (per-band EMA decay constants for preset bundling)
export const CONTROL_STATE_SCHEMA_VERSION = 4;

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

export const VST_CONTROL_NAMES: ReadonlySet<string> = new Set(
	contract.controls.bridgeAccepts,
);

export const VST_TRIGGER_NAMES: ReadonlySet<string> = new Set(
	contract.triggers.bridgeAccepts,
);

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
