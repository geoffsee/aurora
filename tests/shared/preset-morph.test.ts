import { describe, expect, test } from "vitest";
import {
	MORPH_KEYS,
	applyMorphCurve,
	clampMorphPosition,
	isMorphCurve,
	morphPresetStates,
} from "../../bridge/preset-morph.ts";

describe("clampMorphPosition edge behavior", () => {
	test("clamps below 0 to 0", () => {
		expect(clampMorphPosition(-0.5)).toBe(0);
		expect(clampMorphPosition(-1000)).toBe(0);
	});
	test("clamps above 1 to 1", () => {
		expect(clampMorphPosition(1.5)).toBe(1);
		expect(clampMorphPosition(1000)).toBe(1);
	});
	test("passes through in-range values", () => {
		expect(clampMorphPosition(0)).toBe(0);
		expect(clampMorphPosition(0.5)).toBe(0.5);
		expect(clampMorphPosition(1)).toBe(1);
	});
	test("non-finite input collapses to 0 (holds the 'from' end)", () => {
		expect(clampMorphPosition(Number.NaN)).toBe(0);
		expect(clampMorphPosition(Number.POSITIVE_INFINITY)).toBe(0);
		expect(clampMorphPosition(Number.NEGATIVE_INFINITY)).toBe(0);
		expect(clampMorphPosition(undefined)).toBe(0);
		expect(clampMorphPosition("not a number")).toBe(0);
	});
	test("numeric strings coerce", () => {
		expect(clampMorphPosition("0.25")).toBe(0.25);
	});
});

describe("applyMorphCurve", () => {
	test("linear is the identity over the clamped range", () => {
		expect(applyMorphCurve(0, "linear")).toBe(0);
		expect(applyMorphCurve(0.25, "linear")).toBe(0.25);
		expect(applyMorphCurve(1, "linear")).toBe(1);
	});
	test("ease is smoothstep with symmetric midpoint", () => {
		expect(applyMorphCurve(0, "ease")).toBe(0);
		expect(applyMorphCurve(1, "ease")).toBe(1);
		expect(applyMorphCurve(0.5, "ease")).toBeCloseTo(0.5);
		expect(applyMorphCurve(0.1, "ease")).toBeLessThan(0.1);
		expect(applyMorphCurve(0.9, "ease")).toBeGreaterThan(0.9);
	});
	test("snap jumps straight to the target regardless of position", () => {
		expect(applyMorphCurve(0, "snap")).toBe(1);
		expect(applyMorphCurve(0.3, "snap")).toBe(1);
		expect(applyMorphCurve(1, "snap")).toBe(1);
	});
	test("position is clamped before the curve is applied", () => {
		expect(applyMorphCurve(-1, "linear")).toBe(0);
		expect(applyMorphCurve(2, "linear")).toBe(1);
		expect(applyMorphCurve(-1, "ease")).toBe(0);
		expect(applyMorphCurve(2, "ease")).toBe(1);
	});
});

describe("isMorphCurve", () => {
	test("accepts the three known curves", () => {
		expect(isMorphCurve("snap")).toBe(true);
		expect(isMorphCurve("linear")).toBe(true);
		expect(isMorphCurve("ease")).toBe(true);
	});
	test("rejects anything else", () => {
		expect(isMorphCurve("bogus")).toBe(false);
		expect(isMorphCurve(1)).toBe(false);
		expect(isMorphCurve(undefined)).toBe(false);
		expect(isMorphCurve(null)).toBe(false);
	});
});

describe("morphPresetStates edge behavior", () => {
	const from = { crossfade: 0, intensity: 0.2, palette: 0 };
	const to = { crossfade: 1, intensity: 1.2, palette: 0.9 };

	test("position 0 yields the 'from' end (linear)", () => {
		const out = morphPresetStates(from, to, 0, "linear");
		expect(out.crossfade).toBe(0);
		expect(out.intensity).toBeCloseTo(0.2);
		expect(out.palette).toBe(0);
	});
	test("position 1 yields the 'to' end (linear)", () => {
		const out = morphPresetStates(from, to, 1, "linear");
		expect(out.crossfade).toBe(1);
		expect(out.intensity).toBeCloseTo(1.2);
		expect(out.palette).toBeCloseTo(0.9);
	});
	test("midpoint linear blends halfway", () => {
		const out = morphPresetStates(from, to, 0.5, "linear");
		expect(out.crossfade).toBeCloseTo(0.5);
		expect(out.intensity).toBeCloseTo(0.7);
		expect(out.palette).toBeCloseTo(0.45);
	});
	test("out-of-range positions clamp to the endpoints", () => {
		expect(morphPresetStates(from, to, -3, "linear").crossfade).toBe(0);
		expect(morphPresetStates(from, to, 7, "linear").crossfade).toBe(1);
	});
	test("snap forces the target even at position 0", () => {
		const out = morphPresetStates(from, to, 0, "snap");
		expect(out.crossfade).toBe(1);
		expect(out.intensity).toBeCloseTo(1.2);
	});
	test("every morph key is present in the output", () => {
		const out = morphPresetStates(from, to, 0.5, "linear");
		for (const key of MORPH_KEYS) {
			expect(typeof out[key]).toBe("number");
			expect(Number.isFinite(out[key])).toBe(true);
		}
	});
	test("a missing 'from' field falls back to the 'to' value (no NaN, no 0 hole)", () => {
		// `from` omits speed/ringOpacity/maxBrightness; they should hold the
		// 'to' value across the whole sweep rather than collapsing to 0.
		const partialTo = { ...to, speed: 1.5 };
		const at0 = morphPresetStates(from, partialTo, 0, "linear");
		const at1 = morphPresetStates(from, partialTo, 1, "linear");
		expect(at0.speed).toBeCloseTo(1.5);
		expect(at1.speed).toBeCloseTo(1.5);
	});
	test("a missing 'to' field falls back to the 'from' value", () => {
		const partialFrom = { ...from, speed: 0.4 };
		const out = morphPresetStates(partialFrom, to, 1, "linear");
		expect(out.speed).toBeCloseTo(0.4);
	});
});
