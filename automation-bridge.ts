import { makeAutomationPlayer, buildRecording } from "./automation-player.ts";
import {
	matchMidiNote,
	matchMidiCc,
	matchOscAddress,
	resolveAction,
	type AutomationTriggerBinding,
	type TriggerAction,
} from "./automation-trigger.ts";
import type { StateLogEntry } from "./state-log.ts";
import { CONTROL_STATE_SCHEMA_VERSION } from "./osc-validation.ts";
import type { AudioFeatures } from "./audio-ema.ts";
import {
	makeAudioTransientDetector,
	type AudioTransientConfig,
} from "./audio-transient-trigger.ts";

export type { AutomationTriggerBinding };
export type { AudioTransientConfig };

// Default OSC addresses wired unconditionally. Hardware/software controllers
// can send to these without any per-deployment configuration.
export const DEFAULT_OSC_BINDINGS: readonly AutomationTriggerBinding[] = [
	{ type: "osc", address: "/bevyosc/automation/play", action: "play" },
	{ type: "osc", address: "/bevyosc/automation/play-loop", action: "play-loop" },
	{ type: "osc", address: "/bevyosc/automation/stop", action: "stop" },
	{ type: "osc", address: "/bevyosc/automation/toggle", action: "toggle" },
	{ type: "osc", address: "/bevyosc/automation/toggle-loop", action: "toggle-loop" },
];

const VALID_ACTIONS: ReadonlySet<string> = new Set([
	"play",
	"play-loop",
	"stop",
	"toggle",
	"toggle-loop",
]);

function isValidBinding(b: unknown): b is AutomationTriggerBinding {
	if (!b || typeof b !== "object") return false;
	const obj = b as Record<string, unknown>;
	if (!VALID_ACTIONS.has(String(obj["action"]))) return false;
	if (obj["type"] === "midi-note") {
		return typeof obj["note"] === "number" && typeof obj["channel"] === "number";
	}
	if (obj["type"] === "midi-cc") {
		return (
			typeof obj["cc"] === "number" &&
			typeof obj["channel"] === "number" &&
			typeof obj["threshold"] === "number"
		);
	}
	if (obj["type"] === "osc") {
		return typeof obj["address"] === "string";
	}
	return false;
}

/**
 * Parse a JSON string into AutomationTriggerBinding[]. Returns [] on any
 * parse or validation error so the bridge degrades gracefully on bad config.
 */
export function parseTriggerBindings(json: string): AutomationTriggerBinding[] {
	try {
		const parsed: unknown = JSON.parse(json);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isValidBinding);
	} catch {
		console.warn("[automation] failed to parse AUTOMATION_TRIGGER_BINDINGS");
		return [];
	}
}

/**
 * Wire an automation player to trigger bindings and an optional audio transient
 * detector. Exposes entry points for MIDI note, MIDI CC, OSC address, and
 * smoothed AudioFeatures — any of which can fire the player independently.
 *
 * When a play/play-loop action is dispatched, a new recording is built
 * on demand from `getEntries()` and loaded into the player before starting.
 * DEFAULT_OSC_BINDINGS are prepended so they are always active.
 *
 * Pass `transientConfig` to enable audio-driven triggering. Call
 * `onAudioFeatures(features, nowMs)` each frame with smoothed audio data.
 * Call `updateTransientConfig(patch)` to reconfigure the detector at runtime.
 */
export function makeAutomationBridge(
	mergeControlState: (diff: Record<string, unknown>) => void,
	extraBindings: readonly AutomationTriggerBinding[],
	getEntries: () => StateLogEntry[],
	transientConfig?: Partial<AudioTransientConfig>,
): {
	player: ReturnType<typeof makeAutomationPlayer>;
	onMidiNote(note: number, channel: number): boolean;
	onMidiCc(cc: number, channel: number, value: number): boolean;
	onOscAddress(address: string): boolean;
	onAudioFeatures(features: Readonly<AudioFeatures>, nowMs: number): boolean;
	updateTransientConfig(patch: Partial<AudioTransientConfig>): void;
	getTransientConfig(): Readonly<AudioTransientConfig>;
} {
	const player = makeAutomationPlayer(mergeControlState);
	const bindings: readonly AutomationTriggerBinding[] = [
		...DEFAULT_OSC_BINDINGS,
		...extraBindings,
	];
	const detector = makeAudioTransientDetector(transientConfig ?? {});

	function dispatch(action: TriggerAction): void {
		const resolved = resolveAction(action, player.isActive());
		if (resolved === "stop") {
			player.stop();
			return;
		}
		const recording = buildRecording(getEntries(), CONTROL_STATE_SCHEMA_VERSION);
		player.load(recording);
		player.play({ loop: resolved === "play-loop" });
	}

	return {
		player,
		onMidiNote(note, channel) {
			const action = matchMidiNote(note, channel, bindings);
			if (action === null) return false;
			dispatch(action);
			return true;
		},
		onMidiCc(cc, channel, value) {
			const action = matchMidiCc(cc, channel, value, bindings);
			if (action === null) return false;
			dispatch(action);
			return true;
		},
		onOscAddress(address) {
			const action = matchOscAddress(address, bindings);
			if (action === null) return false;
			dispatch(action);
			return true;
		},
		onAudioFeatures(features, nowMs) {
			if (!detector.step(features, nowMs)) return false;
			dispatch(detector.getConfig().action);
			return true;
		},
		updateTransientConfig(patch) {
			detector.updateConfig(patch);
		},
		getTransientConfig() {
			return detector.getConfig();
		},
	};
}
