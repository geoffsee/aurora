import { beforeEach, expect, test, vi } from "vitest";

// Mirrors the inline controls.html MIDI CC load/save logic for unit testing.
const MIDI_CC_BINDINGS_KEY = "aurora.midi-cc-bindings";
const MIDI_CC_SCHEMA_VERSION = 1;

type MidiCcBinding = {
	cc: number;
	channel: number;
	param: string;
	ccMin: number;
	ccMax: number;
	paramMin: number;
	paramMax: number;
};
type MidiCcStore = { schemaVersion: number; bindings: MidiCcBinding[] };

function migrateMidiBindings(raw: unknown): MidiCcStore {
	if (Array.isArray(raw)) {
		return {
			schemaVersion: MIDI_CC_SCHEMA_VERSION,
			bindings: raw as MidiCcBinding[],
		};
	}
	if (raw !== null && typeof raw === "object") {
		const r = raw as Partial<MidiCcStore>;
		const bindings = Array.isArray(r.bindings)
			? (r.bindings as MidiCcBinding[])
			: [];
		return { schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings };
	}
	return { schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings: [] };
}

let _cachedBindings: MidiCcBinding[] | null = null;

function createLocalStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear() {
			values.clear();
		},
		getItem(key: string) {
			return values.get(key) ?? null;
		},
		key(index: number) {
			return Array.from(values.keys())[index] ?? null;
		},
		removeItem(key: string) {
			values.delete(key);
		},
		setItem(key: string, value: string) {
			values.set(key, String(value));
		},
	} as Storage;
}

function loadMidiBindings(): MidiCcBinding[] {
	if (_cachedBindings) return _cachedBindings;
	try {
		const stored = localStorage.getItem(MIDI_CC_BINDINGS_KEY);
		if (!stored) {
			_cachedBindings = [];
			return _cachedBindings;
		}
		const parsed = JSON.parse(stored);
		const store = migrateMidiBindings(parsed);
		_cachedBindings = store.bindings;
		if (
			typeof parsed !== "object" ||
			Array.isArray(parsed) ||
			(parsed as Record<string, unknown>)?.schemaVersion !==
				MIDI_CC_SCHEMA_VERSION
		) {
			localStorage.setItem(MIDI_CC_BINDINGS_KEY, JSON.stringify(store));
		}
	} catch {
		_cachedBindings = [];
	}
	return _cachedBindings;
}

function saveMidiBindings(bindings: MidiCcBinding[]): void {
	_cachedBindings = bindings;
	localStorage.setItem(
		MIDI_CC_BINDINGS_KEY,
		JSON.stringify({ schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings }),
	);
}

const sample: MidiCcBinding = {
	cc: 74,
	channel: 0,
	param: "intensity",
	ccMin: 0,
	ccMax: 127,
	paramMin: 0,
	paramMax: 1,
};

beforeEach(() => {
	_cachedBindings = null;
	vi.stubGlobal("localStorage", createLocalStorage());
});

test("missing key returns empty bindings", () => {
	expect(loadMidiBindings()).toEqual([]);
});

test("legacy array format migrates bindings and writes back versioned format", () => {
	localStorage.setItem(MIDI_CC_BINDINGS_KEY, JSON.stringify([sample]));
	const result = loadMidiBindings();
	expect(result).toEqual([sample]);
	const written = JSON.parse(localStorage.getItem(MIDI_CC_BINDINGS_KEY)!);
	expect(written.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
	expect(written.bindings).toEqual([sample]);
});

test("current versioned format loads correctly without modifying localStorage", () => {
	const store = { schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings: [sample] };
	localStorage.setItem(MIDI_CC_BINDINGS_KEY, JSON.stringify(store));
	const before = localStorage.getItem(MIDI_CC_BINDINGS_KEY);
	expect(loadMidiBindings()).toEqual([sample]);
	expect(localStorage.getItem(MIDI_CC_BINDINGS_KEY)).toBe(before);
});

test("save round-trips through load with correct schema version", () => {
	saveMidiBindings([sample]);
	_cachedBindings = null;
	expect(loadMidiBindings()).toEqual([sample]);
	const written = JSON.parse(localStorage.getItem(MIDI_CC_BINDINGS_KEY)!);
	expect(written.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
});

test("invalid JSON falls back to empty bindings", () => {
	localStorage.setItem(MIDI_CC_BINDINGS_KEY, "not-json{");
	expect(loadMidiBindings()).toEqual([]);
});

test("versioned object with missing bindings field loads as empty", () => {
	localStorage.setItem(
		MIDI_CC_BINDINGS_KEY,
		JSON.stringify({ schemaVersion: MIDI_CC_SCHEMA_VERSION }),
	);
	expect(loadMidiBindings()).toEqual([]);
});
