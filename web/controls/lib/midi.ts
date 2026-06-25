import {
	migrateMidiBindings,
	MIDI_CC_SCHEMA_VERSION,
	type MidiCcBinding,
} from "../../../shared/midi-cc-schema.ts";
import { MIDI_CC_BINDINGS_KEY } from "./constants.ts";

export { MIDI_CC_SCHEMA_VERSION, type MidiCcBinding };

export function loadMidiBindings(): MidiCcBinding[] {
	try {
		const stored = localStorage.getItem(MIDI_CC_BINDINGS_KEY);
		if (!stored) return [];
		const parsed: unknown = JSON.parse(stored);
		const store = migrateMidiBindings(parsed);
		if (
			typeof parsed !== "object" ||
			Array.isArray(parsed) ||
			(parsed as { schemaVersion?: number })?.schemaVersion !==
				MIDI_CC_SCHEMA_VERSION
		) {
			localStorage.setItem(MIDI_CC_BINDINGS_KEY, JSON.stringify(store));
		}
		return store.bindings;
	} catch {
		return [];
	}
}

export function saveMidiBindings(bindings: MidiCcBinding[]) {
	localStorage.setItem(
		MIDI_CC_BINDINGS_KEY,
		JSON.stringify({ schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings }),
	);
}

export function scaleCcToParam(
	ccValue: number,
	binding: Pick<MidiCcBinding, "ccMin" | "ccMax" | "paramMin" | "paramMax">,
) {
	const { ccMin, ccMax, paramMin, paramMax } = binding;
	const range = ccMax - ccMin;
	if (range === 0) return paramMin;
	const t = Math.max(0, Math.min(1, (ccValue - ccMin) / range));
	return paramMin + t * (paramMax - paramMin);
}
