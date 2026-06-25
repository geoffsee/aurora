export type TriggerAction = "play" | "play-loop" | "stop" | "toggle" | "toggle-loop";

export type AutomationTriggerBinding =
	| { type: "midi-note"; note: number; channel: number; action: TriggerAction }
	| { type: "midi-cc"; cc: number; channel: number; threshold: number; action: TriggerAction }
	| { type: "osc"; address: string; action: TriggerAction };

/**
 * Return the action for the first binding that matches a MIDI note-on event,
 * or null if none match.
 * channel == 0 on a binding means "any channel" (omni).
 */
export function matchMidiNote(
	note: number,
	channel: number,
	bindings: readonly AutomationTriggerBinding[],
): TriggerAction | null {
	for (const binding of bindings) {
		if (binding.type !== "midi-note") continue;
		if (binding.note !== note) continue;
		if (binding.channel !== 0 && binding.channel !== channel) continue;
		return binding.action;
	}
	return null;
}

/**
 * Return the action for the first binding that matches a MIDI CC event where
 * the CC value meets or exceeds the binding's threshold, or null if none match.
 * channel == 0 on a binding means "any channel" (omni).
 */
export function matchMidiCc(
	cc: number,
	channel: number,
	value: number,
	bindings: readonly AutomationTriggerBinding[],
): TriggerAction | null {
	for (const binding of bindings) {
		if (binding.type !== "midi-cc") continue;
		if (binding.cc !== cc) continue;
		if (binding.channel !== 0 && binding.channel !== channel) continue;
		if (value < binding.threshold) continue;
		return binding.action;
	}
	return null;
}

/**
 * Return the action for the first binding that matches the given OSC address
 * exactly, or null if none match.
 */
export function matchOscAddress(
	address: string,
	bindings: readonly AutomationTriggerBinding[],
): TriggerAction | null {
	for (const binding of bindings) {
		if (binding.type !== "osc") continue;
		if (binding.address !== address) continue;
		return binding.action;
	}
	return null;
}

/**
 * Resolve a (possibly toggle) TriggerAction to a concrete "play", "play-loop",
 * or "stop" command given the current playback state.
 */
export function resolveAction(
	action: TriggerAction,
	isPlaying: boolean,
): "play" | "play-loop" | "stop" {
	if (action === "toggle") return isPlaying ? "stop" : "play";
	if (action === "toggle-loop") return isPlaying ? "stop" : "play-loop";
	return action;
}
