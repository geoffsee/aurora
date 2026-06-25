import { expect, test } from "vitest";
import {
	MIDI_CC_SCHEMA_VERSION,
	migrateMidiBindings,
	type MidiCcBinding,
} from "../../shared/midi-cc-schema.ts";

const sample: MidiCcBinding = {
	cc: 74,
	channel: 0,
	param: "intensity",
	ccMin: 0,
	ccMax: 127,
	paramMin: 0,
	paramMax: 1,
};

test("MIDI_CC_SCHEMA_VERSION is 1", () => {
	expect(MIDI_CC_SCHEMA_VERSION).toBe(1);
});

test("null returns empty bindings at current version", () => {
	const result = migrateMidiBindings(null);
	expect(result.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
	expect(result.bindings).toEqual([]);
});

test("undefined returns empty bindings at current version", () => {
	const result = migrateMidiBindings(undefined);
	expect(result.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
	expect(result.bindings).toEqual([]);
});

test("empty legacy array wraps with current version", () => {
	const result = migrateMidiBindings([]);
	expect(result.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
	expect(result.bindings).toEqual([]);
});

test("legacy array preserves all binding fields without data loss", () => {
	const result = migrateMidiBindings([sample]);
	expect(result.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
	expect(result.bindings).toHaveLength(1);
	expect(result.bindings[0]).toEqual(sample);
});

test("legacy array with multiple bindings preserves all", () => {
	const second: MidiCcBinding = {
		cc: 1,
		channel: 1,
		param: "crossfade",
		ccMin: 0,
		ccMax: 127,
		paramMin: 0,
		paramMax: 1,
	};
	const result = migrateMidiBindings([sample, second]);
	expect(result.bindings).toHaveLength(2);
	expect(result.bindings[0]).toEqual(sample);
	expect(result.bindings[1]).toEqual(second);
});

test("current versioned store round-trips unchanged", () => {
	const store = { schemaVersion: MIDI_CC_SCHEMA_VERSION, bindings: [sample] };
	const result = migrateMidiBindings(store);
	expect(result.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
	expect(result.bindings).toEqual([sample]);
});

test("versioned object with missing bindings field returns empty bindings", () => {
	const result = migrateMidiBindings({ schemaVersion: 1 });
	expect(result.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
	expect(result.bindings).toEqual([]);
});

test("versioned object with non-array bindings returns empty bindings", () => {
	const result = migrateMidiBindings({ schemaVersion: 1, bindings: "oops" });
	expect(result.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
	expect(result.bindings).toEqual([]);
});

test("primitive value returns empty bindings", () => {
	for (const bad of [42, "string", true]) {
		const result = migrateMidiBindings(bad);
		expect(result.schemaVersion).toBe(MIDI_CC_SCHEMA_VERSION);
		expect(result.bindings).toEqual([]);
	}
});
