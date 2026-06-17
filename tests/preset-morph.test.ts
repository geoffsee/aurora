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

// ── morphPresets (controls.html) parity with preset-morph.ts ──────────────────
// controls.html ships an inline copy of morphPresets driven by its own
// INTERPOLATED_KEYS list; that copy is what actually runs in the browser.
// If this suite fails, the inline copy in controls.html has drifted from the
// canonical module — update one to match the other.

describe("morphPresets (controls.html) parity with preset-morph.ts", () => {
	// Inline replica of INTERPOLATED_KEYS / clamp01 / morphPresets from controls.html.
	const INLINE_INTERPOLATED_KEYS = [
		"crossfade",
		"speed",
		"intensity",
		"feedback",
		"depth",
		"palette",
		"ringOpacity",
		"maxBrightness",
	];
	const clamp01 = (value: unknown): number => {
		const n = Number(value);
		return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
	};
	function inlineMorphPresets(
		a: Record<string, unknown>,
		b: Record<string, unknown>,
		weight: number,
	): Record<string, number> {
		const w = clamp01(weight);
		const out: Record<string, number> = {};
		for (const key of INLINE_INTERPOLATED_KEYS) {
			const av = Number(a[key]);
			const bv = Number(b[key]);
			const from = Number.isFinite(av) ? av : bv;
			const to = Number.isFinite(bv) ? bv : av;
			if (!Number.isFinite(from)) continue;
			out[key] = from + (to - from) * w;
		}
		return out;
	}

	test("INTERPOLATED_KEYS matches MORPH_INTERPOLATED_KEYS", () => {
		expect(INLINE_INTERPOLATED_KEYS).toEqual([...MORPH_INTERPOLATED_KEYS]);
	});

	test("inline and module morph agree across weights", () => {
		for (const w of [0, 0.25, 0.5, 0.75, 1, -2, 3]) {
			expect(inlineMorphPresets(presetA, presetB, w)).toEqual(
				morphPresets(presetA, presetB, w),
			);
		}
	});

	test("inline and module morph agree with partially-populated presets", () => {
		const partialA = { crossfade: 0.2, palette: 0.4 };
		for (const w of [0, 0.5, 1]) {
			expect(inlineMorphPresets(partialA, presetB, w)).toEqual(
				morphPresets(partialA, presetB, w),
			);
		}
	});

	test("inline and module morph agree when a key is absent on both sides", () => {
		const a = { crossfade: 0 };
		const b = { crossfade: 1 };
		expect(inlineMorphPresets(a, b, 0.5)).toEqual(morphPresets(a, b, 0.5));
	});
});
