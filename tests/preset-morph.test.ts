import { describe, expect, test } from "vitest";
import {
	MORPH_CURVE_MODES,
	MORPH_INTERPOLATED_KEYS,
	MORPH_VERSION_KEYS,
	clampMorphWeight,
	computeMorphState,
	morphCurveValue,
	normalizeMorphCurve,
	type MorphCurveMode,
} from "../preset-morph.ts";
import { PRESET_MORPH_ADDRESS } from "../osc-validation.ts";

// ── constants ─────────────────────────────────────────────────────────────────

describe("morph constants", () => {
	test("OSC address matches the controls.html handler", () => {
		expect(PRESET_MORPH_ADDRESS).toBe("/bevyosc/preset/morph");
	});

	test("curve modes match the recall transition curve modes", () => {
		expect(MORPH_CURVE_MODES).toEqual(["snap", "linear", "ease"]);
	});

	test("interpolated keys match INTERPOLATED_KEYS in controls.html", () => {
		expect(MORPH_INTERPOLATED_KEYS).toEqual([
			"crossfade",
			"speed",
			"intensity",
			"feedback",
			"depth",
			"palette",
			"ringOpacity",
			"maxBrightness",
		]);
	});
});

// ── clampMorphWeight ──────────────────────────────────────────────────────────

describe("clampMorphWeight", () => {
	test("passes through in-range weights", () => {
		expect(clampMorphWeight(0)).toBe(0);
		expect(clampMorphWeight(0.42)).toBe(0.42);
		expect(clampMorphWeight(1)).toBe(1);
	});

	test("clamps out-of-range weights", () => {
		expect(clampMorphWeight(-0.5)).toBe(0);
		expect(clampMorphWeight(1.5)).toBe(1);
	});

	test("coerces numeric strings (OSC args may arrive as strings)", () => {
		expect(clampMorphWeight("0.25")).toBe(0.25);
	});

	test("returns null for non-finite input", () => {
		expect(clampMorphWeight(Number.NaN)).toBeNull();
		expect(clampMorphWeight(Number.POSITIVE_INFINITY)).toBeNull();
		expect(clampMorphWeight(undefined)).toBeNull();
		expect(clampMorphWeight("fade")).toBeNull();
		expect(clampMorphWeight(null)).toBe(0); // Number(null) === 0
	});
});

// ── normalizeMorphCurve ───────────────────────────────────────────────────────

describe("normalizeMorphCurve", () => {
	test("preserves valid modes", () => {
		expect(normalizeMorphCurve("snap")).toBe("snap");
		expect(normalizeMorphCurve("linear")).toBe("linear");
		expect(normalizeMorphCurve("ease")).toBe("ease");
	});

	test("defaults to linear (a morph fader fades by default, unlike recall)", () => {
		expect(normalizeMorphCurve(undefined)).toBe("linear");
		expect(normalizeMorphCurve("unknown_mode")).toBe("linear");
		expect(normalizeMorphCurve(1)).toBe("linear");
	});
});

// ── morphCurveValue ───────────────────────────────────────────────────────────

describe("morphCurveValue linear", () => {
	test("is the identity", () => {
		expect(morphCurveValue(0, "linear")).toBe(0);
		expect(morphCurveValue(0.3, "linear")).toBe(0.3);
		expect(morphCurveValue(1, "linear")).toBe(1);
	});
});

describe("morphCurveValue ease (smoothstep)", () => {
	test("matches endpoints", () => {
		expect(morphCurveValue(0, "ease")).toBe(0);
		expect(morphCurveValue(1, "ease")).toBe(1);
	});

	test("is symmetric at the midpoint", () => {
		expect(morphCurveValue(0.5, "ease")).toBeCloseTo(0.5);
	});

	test("is slower than linear early and faster late", () => {
		expect(morphCurveValue(0.1, "ease")).toBeLessThan(0.1);
		expect(morphCurveValue(0.9, "ease")).toBeGreaterThan(0.9);
	});
});

describe("morphCurveValue snap (cut)", () => {
	test("holds A below the midpoint", () => {
		expect(morphCurveValue(0, "snap")).toBe(0);
		expect(morphCurveValue(0.49, "snap")).toBe(0);
	});

	test("cuts to B at and above the midpoint", () => {
		expect(morphCurveValue(0.5, "snap")).toBe(1);
		expect(morphCurveValue(1, "snap")).toBe(1);
	});
});

// ── computeMorphState ─────────────────────────────────────────────────────────

const fromState = {
	crossfade: 0,
	speed: 1,
	intensity: 0.2,
	feedback: 0.1,
	depth: 0,
	palette: 0.25,
	ringOpacity: 1,
	maxBrightness: 1,
	deckAMode: 0,
	strobe: false,
	activeShader: 0,
	cueVersion: 3,
	flashVersion: 1,
	resetVersion: 2,
};

const toState = {
	crossfade: 1,
	speed: 2,
	intensity: 0.8,
	feedback: 0.5,
	depth: 0.6,
	palette: 0.75,
	ringOpacity: 0,
	maxBrightness: 0.5,
	deckAMode: 3,
	strobe: true,
	activeShader: 1,
	cueVersion: 99,
	flashVersion: 98,
	resetVersion: 97,
};

describe("computeMorphState endpoints", () => {
	test("weight 0 reproduces preset A", () => {
		const merged = computeMorphState(fromState, toState, {}, 0);
		expect(merged.crossfade).toBe(0);
		expect(merged.intensity).toBe(0.2);
		expect(merged.deckAMode).toBe(0);
		expect(merged.strobe).toBe(false);
		expect(merged.activeShader).toBe(0);
	});

	test("weight 1 reproduces preset B", () => {
		const merged = computeMorphState(fromState, toState, {}, 1);
		expect(merged.crossfade).toBe(1);
		expect(merged.intensity).toBe(0.8);
		expect(merged.deckAMode).toBe(3);
		expect(merged.strobe).toBe(true);
		expect(merged.activeShader).toBe(1);
	});
});

describe("computeMorphState continuous blend", () => {
	test("weight 0.5 with default linear curves yields the midpoint", () => {
		const merged = computeMorphState(fromState, toState, {}, 0.5);
		expect(merged.crossfade).toBeCloseTo(0.5);
		expect(merged.speed).toBeCloseTo(1.5);
		expect(merged.intensity).toBeCloseTo(0.5);
		expect(merged.ringOpacity).toBeCloseTo(0.5);
	});

	test("weight 0.25 blends a quarter of the way", () => {
		const merged = computeMorphState(fromState, toState, {}, 0.25);
		expect(merged.crossfade).toBeCloseTo(0.25);
		expect(merged.maxBrightness).toBeCloseTo(0.875);
	});

	test("ease curve bends the blend toward the endpoints", () => {
		const merged = computeMorphState(
			fromState,
			toState,
			{ crossfade: "ease" },
			0.25,
		);
		expect(merged.crossfade).toBeCloseTo(0.25 * 0.25 * (3 - 2 * 0.25));
		// other keys stay linear
		expect(merged.speed).toBeCloseTo(1.25);
	});

	test("snap curve cuts that key at the midpoint while others fade", () => {
		const before = computeMorphState(
			fromState,
			toState,
			{ crossfade: "snap" },
			0.49,
		);
		expect(before.crossfade).toBe(0);
		expect(before.speed).toBeCloseTo(1.49);
		const after = computeMorphState(
			fromState,
			toState,
			{ crossfade: "snap" },
			0.5,
		);
		expect(after.crossfade).toBe(1);
	});
});

describe("computeMorphState discrete fields cut at the midpoint", () => {
	test("below 0.5 the A side wins", () => {
		const merged = computeMorphState(fromState, toState, {}, 0.49);
		expect(merged.deckAMode).toBe(0);
		expect(merged.strobe).toBe(false);
		expect(merged.activeShader).toBe(0);
	});

	test("at 0.5 and above the B side wins", () => {
		const merged = computeMorphState(fromState, toState, {}, 0.5);
		expect(merged.deckAMode).toBe(3);
		expect(merged.strobe).toBe(true);
		expect(merged.activeShader).toBe(1);
	});
});

describe("computeMorphState robustness", () => {
	test("strips live version counters from both sides", () => {
		for (const weight of [0, 0.49, 0.5, 1]) {
			const merged = computeMorphState(fromState, toState, {}, weight);
			for (const key of MORPH_VERSION_KEYS) {
				expect(merged).not.toHaveProperty(key);
			}
		}
	});

	test("missing numeric in A falls back to B's value (constant blend)", () => {
		const partialFrom = { ...fromState } as Record<string, unknown>;
		delete partialFrom.crossfade;
		const merged = computeMorphState(partialFrom, toState, {}, 0.25);
		expect(merged.crossfade).toBe(1);
	});

	test("missing numeric in B holds A's value", () => {
		const partialTo = { ...toState } as Record<string, unknown>;
		delete partialTo.crossfade;
		const merged = computeMorphState(fromState, partialTo, {}, 0.75);
		expect(merged.crossfade).toBe(0);
	});

	test("missing on both sides yields 0", () => {
		const merged = computeMorphState({}, {}, {}, 0.5);
		expect(merged.crossfade).toBe(0);
	});

	test("null curves object defaults every key to linear", () => {
		const merged = computeMorphState(fromState, toState, null, 0.5);
		expect(merged.crossfade).toBeCloseTo(0.5);
	});
});

// ── parity with the controls.html inline mirror ───────────────────────────────

// Inline replica of computeMorphState()/morphCurveValue() in controls.html.
// When editing controls.html's morph logic, update this replica too.
const INTERPOLATED_KEYS = MORPH_INTERPOLATED_KEYS;
const CURVE_MODES = MORPH_CURVE_MODES as readonly string[];

function inlineMorphCurveValue(weight: number, curve: string): number {
	if (curve === "snap") return weight < 0.5 ? 0 : 1;
	if (curve === "ease") return weight * weight * (3 - 2 * weight);
	return weight;
}

function inlineComputeMorphState(
	from: Record<string, unknown>,
	to: Record<string, unknown>,
	curves: Record<string, string> | null | undefined,
	weight: number,
): Record<string, unknown> {
	const { cueVersion, flashVersion, resetVersion, ...result } = {
		...(weight < 0.5 ? from : to),
	} as Record<string, unknown>;
	for (const key of INTERPOLATED_KEYS) {
		const a =
			typeof from[key] === "number"
				? (from[key] as number)
				: typeof to[key] === "number"
					? (to[key] as number)
					: 0;
		const b = typeof to[key] === "number" ? (to[key] as number) : a;
		const curve = CURVE_MODES.includes(curves?.[key] as string)
			? (curves?.[key] as string)
			: "linear";
		result[key] = a + (b - a) * inlineMorphCurveValue(weight, curve);
	}
	return result;
}

describe("controls.html inline mirror parity", () => {
	test("matches preset-morph.ts across weights and curve modes", () => {
		const curveSets: (Record<string, string> | null)[] = [
			null,
			{},
			{ crossfade: "snap", intensity: "ease", palette: "linear" },
			Object.fromEntries(INTERPOLATED_KEYS.map((k) => ["" + k, "ease"])),
			{ crossfade: "bogus" },
		];
		for (const curves of curveSets) {
			for (const weight of [0, 0.1, 0.25, 0.49, 0.5, 0.51, 0.75, 0.9, 1]) {
				expect(
					inlineComputeMorphState(fromState, toState, curves, weight),
				).toEqual(computeMorphState(fromState, toState, curves, weight));
			}
		}
	});

	test("curve value functions agree on every mode", () => {
		for (const curve of MORPH_CURVE_MODES) {
			for (const weight of [0, 0.2, 0.5, 0.8, 1]) {
				expect(inlineMorphCurveValue(weight, curve)).toBe(
					morphCurveValue(weight, curve as MorphCurveMode),
				);
			}
		}
	});
});
