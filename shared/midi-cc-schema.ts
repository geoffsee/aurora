// MIDI_CC_SCHEMA_VERSION tracks the MIDI CC binding persistence format stored
// in localStorage under the "bevyosc.midi-cc-bindings" key.
// To bump: increment this integer, add a migration branch in migrateMidiBindings()
// below for the previous version, and update MIDI_CC_SCHEMA_VERSION in web/controls if persisted format changes.
export const MIDI_CC_SCHEMA_VERSION = 1;

export type MidiCcBinding = {
	cc: number;
	channel: number;
	param: string;
	ccMin: number;
	ccMax: number;
	paramMin: number;
	paramMax: number;
};

export type MidiCcStore = {
	schemaVersion: number;
	bindings: MidiCcBinding[];
};

export function migrateMidiBindings(raw: unknown): MidiCcStore {
	// Legacy (v0): plain array stored directly, no schemaVersion field.
	if (Array.isArray(raw)) {
		return { schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings: raw as MidiCcBinding[] };
	}

	if (raw !== null && typeof raw === "object") {
		const store = raw as Partial<MidiCcStore>;
		const bindings = Array.isArray(store.bindings)
			? (store.bindings as MidiCcBinding[])
			: [];
		// Add future migration branches here, e.g.:
		// if (store.schemaVersion === 1) { ...transform bindings for v2... }
		return { schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings };
	}

	return { schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings: [] };
}
