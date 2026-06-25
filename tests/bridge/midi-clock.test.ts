import { describe, expect, test } from "vitest";
import {
	MIDI_CLOCKS_PER_BEAT,
	deriveBpmFromTimestamps,
} from "../../bridge/midi-clock.ts";

function makeTimestamps(bpm: number, count: number, startMs = 1000): number[] {
	const msPerClock = 60000 / (bpm * MIDI_CLOCKS_PER_BEAT);
	return Array.from({ length: count }, (_, i) => startMs + i * msPerClock);
}

describe("deriveBpmFromTimestamps", () => {
	test("returns null for empty array", () => {
		expect(deriveBpmFromTimestamps([])).toBeNull();
	});

	test("returns null for single timestamp", () => {
		expect(deriveBpmFromTimestamps([1000])).toBeNull();
	});

	test("returns null for two timestamps", () => {
		expect(deriveBpmFromTimestamps([1000, 1020])).toBeNull();
	});

	test("accepts 3 timestamps (minimum valid)", () => {
		const ts = makeTimestamps(100, 3);
		expect(deriveBpmFromTimestamps(ts)).toBeCloseTo(100, 3);
	});

	test("derives 120 BPM from evenly spaced clock ticks", () => {
		const ts = makeTimestamps(120, 25);
		const bpm = deriveBpmFromTimestamps(ts);
		expect(bpm).not.toBeNull();
		expect(bpm!).toBeCloseTo(120, 3);
	});

	test("derives 140 BPM from evenly spaced clock ticks", () => {
		const ts = makeTimestamps(140, 25);
		const bpm = deriveBpmFromTimestamps(ts);
		expect(bpm).not.toBeNull();
		expect(bpm!).toBeCloseTo(140, 3);
	});

	test("derives 80 BPM (low tempo boundary)", () => {
		const ts = makeTimestamps(80, 25);
		const bpm = deriveBpmFromTimestamps(ts);
		expect(bpm).not.toBeNull();
		expect(bpm!).toBeCloseTo(80, 3);
	});

	test("derives 200 BPM (high tempo boundary)", () => {
		const ts = makeTimestamps(200, 25);
		const bpm = deriveBpmFromTimestamps(ts);
		expect(bpm).not.toBeNull();
		expect(bpm!).toBeCloseTo(200, 3);
	});

	test("returns null for BPM below 40 (too slow)", () => {
		const ts = makeTimestamps(20, 3);
		expect(deriveBpmFromTimestamps(ts)).toBeNull();
	});

	test("returns null for BPM above 240 (too fast)", () => {
		const ts = makeTimestamps(300, 3);
		expect(deriveBpmFromTimestamps(ts)).toBeNull();
	});

	test("returns null when timestamps are identical (zero span)", () => {
		expect(deriveBpmFromTimestamps([1000, 1000, 1000])).toBeNull();
	});

	test("averages over all provided ticks, not just last two", () => {
		// 24 ticks at 120 BPM followed by 24 ticks at 60 BPM — average should be
		// between both extremes, not equal to either endpoint alone.
		const ts120 = makeTimestamps(120, 24, 0);
		const lastTs = ts120[ts120.length - 1];
		const ts60 = makeTimestamps(60, 24, lastTs);
		const combined = [...ts120, ...ts60.slice(1)];
		const bpm = deriveBpmFromTimestamps(combined);
		expect(bpm).not.toBeNull();
		expect(bpm!).toBeGreaterThan(60);
		expect(bpm!).toBeLessThan(120);
	});
});
