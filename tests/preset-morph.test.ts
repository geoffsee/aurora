import { describe, expect, test } from "vitest";
import {
	MORPH_INTERPOLATED_KEYS,
	clampMorphWeight,
	morphPresets,
} from "../preset-morph.ts";

const presetA: Record<string, number> = {
	crossfade: 0,
	speed: 1,
	intensity: 0.2,
	feedback: 0,
	depth: 0,
	palette: 0,
	ringOpacity: 1,
	maxBrightness: 0.5,
};
const presetB: Record<string, number> = {
	crossfade: 1,
	speed: 3,
	intensity: 1.2,
	feedback: 1,
	depth: 1,
	palette: 1,
	ringOpacity: 0,
	maxBrightness: 1,
};

describe("clampMorphWeight", () => {
	test("clamps below 0 to 0", () => {
		expect(clampMorphWeight(-0.5)).toBe(0);
	});
	test("clamps above 1 to 1", () => {
		expect(clampMorphWeight(2)).toBe(1);
	});
	test("passes through in-range values", () => {
		expect(clampMorphWeight(0.37)).toBeCloseTo(0.37, 6);
	});
	test("falls back for non-finite input", () => {
		expect(clampMorphWeight("nope", 0.25)).toBeCloseTo(0.25, 6);
		expect(clampMorphWeight(undefined)).toBe(0);
		expect(clampMorphWeight(Number.NaN, 0.4)).toBeCloseTo(0.4, 6);
	});
});

describe("morphPresets", () => {
	test("weight 0 yields preset A values", () => {
		const out = morphPresets(presetA, presetB, 0);
		for (const key of MORPH_INTERPOLATED_KEYS) {
			expect(out[key]).toBeCloseTo(presetA[key] ?? Number.NaN, 6);
		}
	});

	test("weight 1 yields preset B values", () => {
		const out = morphPresets(presetA, presetB, 1);
		for (const key of MORPH_INTERPOLATED_KEYS) {
			expect(out[key]).toBeCloseTo(presetB[key] ?? Number.NaN, 6);
		}
	});

	test("weight 0.5 yields the midpoint of each key", () => {
		const out = morphPresets(presetA, presetB, 0.5);
		for (const key of MORPH_INTERPOLATED_KEYS) {
			expect(out[key]).toBeCloseTo(
				((presetA[key] ?? 0) + (presetB[key] ?? 0)) / 2,
				6,
			);
		}
	});

	test("clamps out-of-range weight before interpolating", () => {
		expect(morphPresets(presetA, presetB, 5).crossfade).toBeCloseTo(1, 6);
		expect(morphPresets(presetA, presetB, -3).crossfade).toBeCloseTo(0, 6);
	});

	test("only emits the interpolated keys, ignoring extras", () => {
		const out = morphPresets(
			{ ...presetA, deckAMode: 2, rings: true },
			{ ...presetB, deckAMode: 4, rings: false },
			0.5,
		);
		expect(Object.keys(out).sort()).toEqual(
			[...MORPH_INTERPOLATED_KEYS].sort(),
		);
	});

	test("missing numeric value on one side falls back to the other side", () => {
		const partialA = { crossfade: 0.2 };
		const out = morphPresets(partialA, presetB, 0.5);
		// crossfade interpolates 0.2 -> 1 at 0.5
		expect(out.crossfade).toBeCloseTo(0.6, 6);
		// intensity present only on B: both sides resolve to B's value
		expect(out.intensity).toBeCloseTo(presetB.intensity ?? Number.NaN, 6);
	});

	test("skips keys absent on both sides", () => {
		const out = morphPresets({ crossfade: 0 }, { crossfade: 1 }, 0.5);
		expect(out.crossfade).toBeCloseTo(0.5, 6);
		expect("intensity" in out).toBe(false);
	});
});
