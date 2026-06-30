import { describe, expect, test } from "vitest";
import type { AudioFeatures } from "../../bridge/audio-ema.ts";
import {
	type AudioMapping,
	makeAudioControlRouter,
	parseAudioMappings,
} from "../../bridge/audio-control-router.ts";

const features = (patch: Partial<AudioFeatures>): AudioFeatures => ({
	energy: 0,
	bass: 0,
	mid: 0,
	high: 0,
	pulse: 0,
	...patch,
});

// Build a router with a captured-diff merge and a mutable backing state for
// increment targets.
const makeHarness = (initial: Record<string, unknown> = {}) => {
	const state: Record<string, unknown> = { flashVersion: 0, ...initial };
	const diffs: Record<string, unknown>[] = [];
	const router = makeAudioControlRouter(
		(diff) => {
			diffs.push(diff);
			Object.assign(state, diff);
		},
		() => state,
	);
	return { router, diffs, state };
};

const continuousMapping = (over: Partial<AudioMapping> = {}): AudioMapping => ({
	source: "energy",
	target: "intensity",
	mode: "continuous",
	targetMin: 0,
	targetMax: 1,
	level: 0.5,
	offDelayMs: 200,
	increment: false,
	...over,
});

const thresholdMapping = (over: Partial<AudioMapping> = {}): AudioMapping => ({
	source: "pulse",
	target: "flashVersion",
	mode: "threshold",
	targetMin: 0,
	targetMax: 1,
	level: 0.75,
	offDelayMs: 200,
	increment: true,
	...over,
});

describe("parseAudioMappings", () => {
	test("drops entries with unknown source or missing target, fills defaults", () => {
		const parsed = parseAudioMappings([
			{
				source: "energy",
				target: "intensity",
				mode: "continuous",
				targetMax: 1.3,
			},
			{ source: "nope", target: "intensity", mode: "continuous" },
			{ source: "pulse", mode: "threshold" },
			{
				source: "bass",
				target: "depth",
				mode: "threshold",
				level: 0.4,
				increment: true,
			},
		]);
		expect(parsed).toHaveLength(2);
		expect(parsed[0]).toMatchObject({
			source: "energy",
			target: "intensity",
			mode: "continuous",
			targetMin: 0,
			targetMax: 1.3,
		});
		expect(parsed[1]).toMatchObject({
			source: "bass",
			target: "depth",
			mode: "threshold",
			level: 0.4,
			offDelayMs: 200,
			increment: true,
		});
	});

	test("drops forbidden arm-switch targets", () => {
		const parsed = parseAudioMappings([
			{
				source: "energy",
				target: "audioTransientAutomation",
				mode: "continuous",
			},
			{
				source: "pulse",
				target: "audioControlMode",
				mode: "threshold",
				level: 0.5,
			},
			{
				source: "energy",
				target: "intensity",
				mode: "continuous",
			},
		]);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.target).toBe("intensity");
	});

	test("non-array input yields empty mappings", () => {
		expect(parseAudioMappings(null)).toEqual([]);
		expect(parseAudioMappings({})).toEqual([]);
		expect(parseAudioMappings("[]")).toEqual([]);
	});
});

describe("disabled / empty passthrough", () => {
	test("emits nothing while disabled even with mappings", () => {
		const { router, diffs } = makeHarness();
		router.setMappings([continuousMapping()]);
		expect(router.isActive()).toBe(false);
		expect(router.onFeatures(features({ energy: 1 }), 0)).toBe(false);
		expect(diffs).toHaveLength(0);
	});

	test("enabled with no mappings is inert", () => {
		const { router, diffs } = makeHarness();
		router.setEnabled(true);
		router.setMappings([]);
		expect(router.isActive()).toBe(false);
		expect(router.onFeatures(features({ energy: 1 }), 0)).toBe(false);
		expect(diffs).toHaveLength(0);
	});
});

describe("continuous mode", () => {
	test("lerps source across [targetMin,targetMax] and clamps to range", () => {
		const { router, diffs } = makeHarness();
		router.setMappings([continuousMapping({ targetMin: 0.4, targetMax: 1.2 })]);
		router.setEnabled(true);

		router.onFeatures(features({ energy: 0.5 }), 0);
		expect(diffs.at(-1)).toEqual({ intensity: 0.4 + 0.8 * 0.5 });

		// source above 1 clamps to targetMax
		router.onFeatures(features({ energy: 5 }), 10);
		expect(diffs.at(-1)).toEqual({ intensity: 1.2 });
	});

	test("suppresses no-op broadcasts when output barely moves", () => {
		const { router, diffs } = makeHarness();
		router.setMappings([continuousMapping()]);
		router.setEnabled(true);

		router.onFeatures(features({ energy: 0.5 }), 0);
		expect(diffs).toHaveLength(1);
		// identical input → no new diff
		router.onFeatures(features({ energy: 0.5 }), 10);
		expect(diffs).toHaveLength(1);
		// sub-epsilon change → still no new diff
		router.onFeatures(features({ energy: 0.5000001 }), 20);
		expect(diffs).toHaveLength(1);
		// meaningful change → new diff
		router.onFeatures(features({ energy: 0.7 }), 30);
		expect(diffs).toHaveLength(2);
	});
});

describe("threshold mode", () => {
	test("fires once per rising edge, not while held above level", () => {
		const { router, diffs, state } = makeHarness();
		router.setMappings([thresholdMapping()]);
		router.setEnabled(true);

		// below level → no fire
		expect(router.onFeatures(features({ pulse: 0.5 }), 0)).toBe(false);
		// rising edge → fire (flashVersion 0 → 1)
		expect(router.onFeatures(features({ pulse: 0.9 }), 50)).toBe(true);
		expect(state.flashVersion).toBe(1);
		// held above level → no re-fire
		expect(router.onFeatures(features({ pulse: 0.95 }), 400)).toBe(false);
		expect(state.flashVersion).toBe(1);
		// drop below, then rise again past debounce → fire
		router.onFeatures(features({ pulse: 0 }), 500);
		expect(router.onFeatures(features({ pulse: 0.9 }), 800)).toBe(true);
		expect(state.flashVersion).toBe(2);
		expect(diffs).toEqual([{ flashVersion: 1 }, { flashVersion: 2 }]);
	});

	test("debounce suppresses a re-trigger inside offDelayMs", () => {
		const { router, state } = makeHarness();
		router.setMappings([thresholdMapping({ offDelayMs: 200 })]);
		router.setEnabled(true);

		expect(router.onFeatures(features({ pulse: 0.9 }), 0)).toBe(true);
		expect(state.flashVersion).toBe(1);
		// fall and rise again within the debounce window → suppressed
		router.onFeatures(features({ pulse: 0 }), 50);
		expect(router.onFeatures(features({ pulse: 0.9 }), 150)).toBe(false);
		expect(state.flashVersion).toBe(1);
	});

	test("non-increment threshold sets target to targetMax on rise", () => {
		const { router, state } = makeHarness();
		router.setMappings([
			thresholdMapping({ target: "strobe", increment: false, targetMax: 1 }),
		]);
		router.setEnabled(true);
		router.onFeatures(features({ pulse: 0.9 }), 0);
		expect(state.strobe).toBe(1);
	});
});

test("setMappings resets edge state", () => {
	const { router, state } = makeHarness();
	router.setMappings([thresholdMapping()]);
	router.setEnabled(true);
	router.onFeatures(features({ pulse: 0.9 }), 0); // flashVersion → 1
	expect(state.flashVersion).toBe(1);

	// Re-set mappings: a held-high reading should now read as a fresh rising edge.
	router.setMappings([thresholdMapping()]);
	expect(router.onFeatures(features({ pulse: 0.9 }), 10)).toBe(true);
	expect(state.flashVersion).toBe(2);
});
