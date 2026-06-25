import { describe, expect, test } from "vitest";
import { isAudioCurveShape, AUDIO_CURVE_SHAPES } from "../../shared/osc-validation.ts";

// Mirror of the applyAudioCurve function from index.html.
type CurveShape = "linear" | "exponential" | "logarithmic";
function applyAudioCurve(value: number, curve: CurveShape): number {
	if (curve === "exponential") return value * value;
	if (curve === "logarithmic") return Math.sqrt(Math.max(0, value));
	return value;
}

// ── isAudioCurveShape ─────────────────────────────────────────────────────────

describe("isAudioCurveShape", () => {
	test("accepts all valid shapes", () => {
		for (const shape of AUDIO_CURVE_SHAPES) {
			expect(isAudioCurveShape(shape)).toBe(true);
		}
	});
	test("rejects unknown strings", () => {
		expect(isAudioCurveShape("quadratic")).toBe(false);
		expect(isAudioCurveShape("snap")).toBe(false);
	});
	test("rejects non-strings", () => {
		expect(isAudioCurveShape(1)).toBe(false);
		expect(isAudioCurveShape(null)).toBe(false);
		expect(isAudioCurveShape(undefined)).toBe(false);
	});
});

// ── applyAudioCurve linear ────────────────────────────────────────────────────

describe("applyAudioCurve linear", () => {
	test("returns 0 at 0", () => expect(applyAudioCurve(0, "linear")).toBe(0));
	test("returns 0.5 at 0.5", () =>
		expect(applyAudioCurve(0.5, "linear")).toBe(0.5));
	test("returns 1 at 1", () => expect(applyAudioCurve(1, "linear")).toBe(1));
});

// ── applyAudioCurve exponential ───────────────────────────────────────────────

describe("applyAudioCurve exponential (x²)", () => {
	test("returns 0 at 0", () =>
		expect(applyAudioCurve(0, "exponential")).toBe(0));
	test("returns 1 at 1", () =>
		expect(applyAudioCurve(1, "exponential")).toBe(1));
	test("compresses low values (0.5 → 0.25)", () =>
		expect(applyAudioCurve(0.5, "exponential")).toBe(0.25));
	test("is less than linear for mid-range inputs", () => {
		for (const v of [0.1, 0.3, 0.7, 0.9]) {
			expect(applyAudioCurve(v, "exponential")).toBeLessThan(v);
		}
	});
	test("is monotonically increasing", () => {
		const samples = [0, 0.25, 0.5, 0.75, 1];
		const vals = samples.map((v) => applyAudioCurve(v, "exponential"));
		for (let i = 1; i < vals.length; i++) {
			expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]!);
		}
	});
});

// ── applyAudioCurve logarithmic ───────────────────────────────────────────────

describe("applyAudioCurve logarithmic (√x)", () => {
	test("returns 0 at 0", () =>
		expect(applyAudioCurve(0, "logarithmic")).toBe(0));
	test("returns 1 at 1", () =>
		expect(applyAudioCurve(1, "logarithmic")).toBe(1));
	test("boosts low values (0.25 → 0.5)", () =>
		expect(applyAudioCurve(0.25, "logarithmic")).toBeCloseTo(0.5));
	test("is greater than linear for mid-range inputs", () => {
		for (const v of [0.1, 0.3, 0.7, 0.9]) {
			expect(applyAudioCurve(v, "logarithmic")).toBeGreaterThan(v);
		}
	});
	test("handles negative input gracefully (clamps to 0)", () => {
		expect(applyAudioCurve(-0.5, "logarithmic")).toBe(0);
	});
	test("is monotonically increasing", () => {
		const samples = [0, 0.25, 0.5, 0.75, 1];
		const vals = samples.map((v) => applyAudioCurve(v, "logarithmic"));
		for (let i = 1; i < vals.length; i++) {
			expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]!);
		}
	});
});

// ── curve symmetry ────────────────────────────────────────────────────────────

describe("exponential and logarithmic are inverses of each other", () => {
	test("exp(log(x)) ≈ x", () => {
		for (const v of [0.1, 0.25, 0.5, 0.75, 0.9]) {
			const roundtrip = applyAudioCurve(
				applyAudioCurve(v, "logarithmic"),
				"exponential",
			);
			expect(roundtrip).toBeCloseTo(v, 10);
		}
	});
});
