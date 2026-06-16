import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { AudioFeatures } from "../audio-ema.ts";
import {
	type AudioMapping,
	type ControlDiff,
	type ControlSnapshot,
	makeAudioControlRouter,
	parseAudioMappings,
} from "../audio-control-router.ts";

const features = (partial: Partial<AudioFeatures>): AudioFeatures => ({
	energy: 0,
	bass: 0,
	mid: 0,
	high: 0,
	pulse: 0,
	...partial,
});

// A test harness: a router whose merge() pushes diffs into an array, with a
// controllable clock and a mutable control-state snapshot.
const makeHarness = (state: ControlSnapshot = {}) => {
	const diffs: ControlDiff[] = [];
	let clock = 0;
	const snapshot = { ...state };
	const router = makeAudioControlRouter({
		getControlState: () => snapshot,
		merge: (diff) => {
			diffs.push(diff);
			Object.assign(snapshot, diff);
		},
		now: () => clock,
	});
	return {
		router,
		diffs,
		snapshot,
		advance: (ms: number) => {
			clock += ms;
		},
	};
};

describe("makeAudioControlRouter", () => {
	test("ignores features when inactive (disabled-mode passthrough)", () => {
		const h = makeHarness();
		h.router.setMappings([
			{
				source: "energy",
				target: "intensity",
				mode: "continuous",
				targetMin: 0,
				targetMax: 1,
			},
		]);
		h.router.onFeatures(features({ energy: 1 }));
		expect(h.diffs).toHaveLength(0);
	});

	test("empty mappings produce no diffs even when active", () => {
		const h = makeHarness();
		h.router.setActive(true);
		h.router.setMappings([]);
		h.router.onFeatures(features({ energy: 1 }));
		expect(h.diffs).toHaveLength(0);
	});

	test("continuous mapping lerps source into [targetMin, targetMax]", () => {
		const h = makeHarness();
		h.router.setActive(true);
		h.router.setMappings([
			{
				source: "energy",
				target: "intensity",
				mode: "continuous",
				targetMin: 0.4,
				targetMax: 1.2,
			},
		]);
		h.router.onFeatures(features({ energy: 0.5 }));
		expect(h.diffs).toHaveLength(1);
		expect(h.diffs[0]!.intensity).toBeCloseTo(0.4 + 0.8 * 0.5);
	});

	test("continuous mapping clamps source outside [0,1]", () => {
		const h = makeHarness();
		h.router.setActive(true);
		h.router.setMappings([
			{
				source: "energy",
				target: "intensity",
				mode: "continuous",
				targetMin: 0,
				targetMax: 1,
			},
		]);
		h.router.onFeatures(features({ energy: 5 }));
		expect(h.diffs[0]!.intensity).toBeCloseTo(1);
	});

	test("continuous mapping suppresses no-op output below epsilon", () => {
		const h = makeHarness();
		h.router.setActive(true);
		h.router.setMappings([
			{
				source: "energy",
				target: "intensity",
				mode: "continuous",
				targetMin: 0,
				targetMax: 1,
			},
		]);
		h.router.onFeatures(features({ energy: 0.5 }));
		h.router.onFeatures(features({ energy: 0.5 }));
		h.router.onFeatures(features({ energy: 0.5000001 }));
		expect(h.diffs).toHaveLength(1);
		h.router.onFeatures(features({ energy: 0.8 }));
		expect(h.diffs).toHaveLength(2);
	});

	test("threshold mode fires once on a rising edge", () => {
		const h = makeHarness({ flashVersion: 0 });
		h.router.setActive(true);
		h.router.setMappings([
			{
				source: "pulse",
				target: "flashVersion",
				mode: "threshold",
				level: 0.75,
				offDelay: 0,
				increment: true,
			},
		]);
		h.router.onFeatures(features({ pulse: 0.2 })); // below
		expect(h.diffs).toHaveLength(0);
		h.router.onFeatures(features({ pulse: 0.9 })); // rising edge
		expect(h.diffs).toHaveLength(1);
		expect(h.diffs[0]!.flashVersion).toBe(1);
		h.router.onFeatures(features({ pulse: 0.95 })); // still above — no re-fire
		expect(h.diffs).toHaveLength(1);
	});

	test("threshold re-arms only after dropping below level", () => {
		const h = makeHarness({ flashVersion: 0 });
		h.router.setActive(true);
		h.router.setMappings([
			{
				source: "pulse",
				target: "flashVersion",
				mode: "threshold",
				level: 0.5,
				offDelay: 0,
				increment: true,
			},
		]);
		h.router.onFeatures(features({ pulse: 0.9 })); // fire 1
		h.router.onFeatures(features({ pulse: 0.1 })); // drop below
		h.router.onFeatures(features({ pulse: 0.9 })); // fire 2
		expect(h.diffs).toHaveLength(2);
		expect(h.diffs[1]!.flashVersion).toBe(2);
	});

	test("threshold debounces rising edges inside offDelay window", () => {
		const h = makeHarness({ flashVersion: 0 });
		h.router.setActive(true);
		h.router.setMappings([
			{
				source: "pulse",
				target: "flashVersion",
				mode: "threshold",
				level: 0.5,
				offDelay: 200,
				increment: true,
			},
		]);
		h.router.onFeatures(features({ pulse: 0.9 })); // fire at t=0
		h.router.onFeatures(features({ pulse: 0.1 }));
		h.advance(100); // still within debounce
		h.router.onFeatures(features({ pulse: 0.9 })); // suppressed
		expect(h.diffs).toHaveLength(1);
		h.advance(150); // total 250 > 200
		h.router.onFeatures(features({ pulse: 0.1 }));
		h.router.onFeatures(features({ pulse: 0.9 })); // now fires
		expect(h.diffs).toHaveLength(2);
	});

	test("threshold riseValue sets a static value rather than incrementing", () => {
		const h = makeHarness({ crossfade: 0.5 });
		h.router.setActive(true);
		h.router.setMappings([
			{
				source: "bass",
				target: "crossfade",
				mode: "threshold",
				level: 0.6,
				offDelay: 0,
				riseValue: 1,
			},
		]);
		h.router.onFeatures(features({ bass: 0.9 }));
		expect(h.diffs[0]!.crossfade).toBe(1);
	});

	test("setMappings resets edge state", () => {
		const h = makeHarness({ flashVersion: 0 });
		h.router.setActive(true);
		const mapping: AudioMapping = {
			source: "pulse",
			target: "flashVersion",
			mode: "threshold",
			level: 0.5,
			offDelay: 0,
			increment: true,
		};
		h.router.onFeatures(features({ pulse: 0.9 }));
		expect(h.diffs).toHaveLength(0); // no mappings yet
		h.router.setMappings([mapping]);
		h.router.onFeatures(features({ pulse: 0.9 })); // first observation -> rising edge
		expect(h.diffs).toHaveLength(1);
	});

	test("isActive reflects setActive", () => {
		const h = makeHarness();
		expect(h.router.isActive()).toBe(false);
		h.router.setActive(true);
		expect(h.router.isActive()).toBe(true);
	});
});

describe("parseAudioMappings", () => {
	test("returns [] for non-array input", () => {
		expect(parseAudioMappings(null)).toEqual([]);
		expect(parseAudioMappings({})).toEqual([]);
		expect(parseAudioMappings("nope")).toEqual([]);
	});

	test("drops entries with invalid source/target/mode", () => {
		const parsed = parseAudioMappings([
			{ source: "nope", target: "intensity", mode: "continuous" },
			{ source: "energy", target: "", mode: "continuous" },
			{ source: "energy", target: "intensity", mode: "weird" },
		]);
		expect(parsed).toEqual([]);
	});

	test("normalises a continuous mapping with default bounds", () => {
		const parsed = parseAudioMappings([
			{ source: "energy", target: "intensity", mode: "continuous" },
		]);
		expect(parsed).toEqual([
			{
				source: "energy",
				target: "intensity",
				mode: "continuous",
				targetMin: 0,
				targetMax: 1,
			},
		]);
	});

	test("drops a threshold mapping with neither increment nor riseValue", () => {
		const parsed = parseAudioMappings([
			{
				source: "pulse",
				target: "flashVersion",
				mode: "threshold",
				level: 0.5,
			},
		]);
		expect(parsed).toEqual([]);
	});

	test("keeps a valid threshold increment mapping and clamps level", () => {
		const parsed = parseAudioMappings([
			{
				source: "pulse",
				target: "flashVersion",
				mode: "threshold",
				level: 5,
				offDelay: -10,
				increment: true,
			},
		]);
		expect(parsed).toEqual([
			{
				source: "pulse",
				target: "flashVersion",
				mode: "threshold",
				level: 1,
				offDelay: 0,
				increment: true,
			},
		]);
	});

	test("the shipped audio-mappings.json parses to valid mappings", () => {
		const raw = JSON.parse(
			readFileSync(`${process.cwd()}/audio-mappings.json`, "utf8"),
		) as unknown[];
		const parsed = parseAudioMappings(raw);
		expect(parsed.length).toBeGreaterThan(0);
		expect(parsed.length).toBe(raw.length);
	});
});
