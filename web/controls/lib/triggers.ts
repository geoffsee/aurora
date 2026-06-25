import { AUTOMATION_TRIGGERS_KEY } from "./constants.ts";
import type { TriggerBinding } from "./types.ts";

export function loadTriggerBindings(): TriggerBinding[] {
	try {
		return JSON.parse(
			localStorage.getItem(AUTOMATION_TRIGGERS_KEY) || "[]",
		) as TriggerBinding[];
	} catch {
		return [];
	}
}

export function saveTriggerBindings(bindings: TriggerBinding[]) {
	localStorage.setItem(AUTOMATION_TRIGGERS_KEY, JSON.stringify(bindings));
}

export function resolveTriggerAction(
	action: string,
	replaying: boolean,
): "stop" | "play" | "play-loop" | null {
	if (action === "toggle") return replaying ? "stop" : "play";
	if (action === "toggle-loop") return replaying ? "stop" : "play-loop";
	if (
		action === "play" ||
		action === "play-loop" ||
		action === "stop"
	) {
		return action;
	}
	return null;
}

export function findMidiNoteTrigger(
	bindings: TriggerBinding[],
	note: number,
	channel: number,
) {
	return bindings.find(
		(b) =>
			b.type === "midi-note" &&
			b.note === note &&
			(b.channel === 0 || b.channel === channel),
	);
}

export function findMidiCcTrigger(
	bindings: TriggerBinding[],
	cc: number,
	channel: number,
	value: number,
) {
	return bindings.find(
		(b) =>
			b.type === "midi-cc" &&
			b.cc === cc &&
			(b.channel === 0 || b.channel === channel) &&
			value >= b.threshold,
	);
}

export function findOscTrigger(bindings: TriggerBinding[], address: string) {
	return bindings.find((b) => b.type === "osc" && b.address === address);
}
