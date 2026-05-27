export type OscArg = { type: string; value: unknown } | unknown;
export type OscMsg = { address: string; args?: OscArg[] };

// CONTROL_STATE_SCHEMA_VERSION tracks the ControlState wire format.
// To bump: increment this integer, add a migration branch in the WebSocket
// message handler in index.ts that transforms the old payload shape before
// passing it to broadcastControl, and update defaultState() in controls.html
// to emit the new version number.
export const CONTROL_STATE_SCHEMA_VERSION = 1;

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
