import { expect, test } from "vitest";
import { diffObjects, makeStateLog } from "../../bridge/state-log.ts";

// --- diffObjects ---

test("diffObjects returns null when nothing changed", () => {
	const state = { crossfade: 0.5, bpm: 124, rings: true };
	expect(diffObjects(state, { ...state })).toBeNull();
});

test("diffObjects returns only changed primitive fields", () => {
	const prev = { crossfade: 0.5, bpm: 124, intensity: 0.8 };
	const next = { crossfade: 0.33, bpm: 124, intensity: 0.8 };
	expect(diffObjects(prev, next)).toEqual({ crossfade: 0.33 });
});

test("diffObjects detects nested object changes via shallow comparison", () => {
	const prev = { trackMapping: { deckAStart: 0, deckACount: 8 } };
	const next = { trackMapping: { deckAStart: 2, deckACount: 8 } };
	const diff = diffObjects(
		prev as Record<string, unknown>,
		next as Record<string, unknown>,
	);
	expect(diff).toEqual({ trackMapping: { deckAStart: 2, deckACount: 8 } });
});

test("diffObjects returns null when nested object is unchanged", () => {
	const mapping = { deckAStart: 0, deckACount: 8 };
	const prev = { trackMapping: mapping };
	const next = { trackMapping: { ...mapping } };
	expect(
		diffObjects(
			prev as Record<string, unknown>,
			next as Record<string, unknown>,
		),
	).toBeNull();
});

// --- makeStateLog ---

test("makeStateLog starts empty", () => {
	const log = makeStateLog(5);
	expect(log.size).toBe(0);
	expect(log.toArray()).toEqual([]);
});

test("record with null prev stores full state as first diff", () => {
	const log = makeStateLog(5);
	log.record(null, { crossfade: 0.5, bpm: 124 });
	expect(log.size).toBe(1);
	const entries = log.toArray();
	expect(entries[0]?.diff).toEqual({ crossfade: 0.5, bpm: 124 });
});

test("record only appends when state actually changed", () => {
	const log = makeStateLog(5);
	const state = { crossfade: 0.5, bpm: 124 };
	log.record(null, state);
	log.record(state, { ...state }); // identical — no diff
	expect(log.size).toBe(1);
});

test("ring buffer evicts oldest entry when capacity is exceeded", () => {
	const log = makeStateLog(3);
	log.record(null, { crossfade: 0.1 });
	log.record({ crossfade: 0.1 }, { crossfade: 0.2 });
	log.record({ crossfade: 0.2 }, { crossfade: 0.3 });
	// capacity reached — next push evicts first entry
	log.record({ crossfade: 0.3 }, { crossfade: 0.4 });
	expect(log.size).toBe(3);
	const entries = log.toArray();
	expect(entries[0]?.diff).toEqual({ crossfade: 0.2 });
	expect(entries[2]?.diff).toEqual({ crossfade: 0.4 });
});

test("toArray returns a defensive copy", () => {
	const log = makeStateLog(5);
	log.record(null, { crossfade: 0.5 });
	const a = log.toArray();
	const b = log.toArray();
	expect(a).not.toBe(b);
	expect(a).toEqual(b);
});

test("each entry has a numeric ts timestamp", () => {
	const before = Date.now();
	const log = makeStateLog(5);
	log.record(null, { crossfade: 0.5 });
	const after = Date.now();
	const ts = log.toArray()[0]?.ts ?? 0;
	expect(ts).toBeGreaterThanOrEqual(before);
	expect(ts).toBeLessThanOrEqual(after);
});
