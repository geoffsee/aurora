import { describe, expect, test } from "vitest";

// Mirror of the inline controls.html curve logic.
type CurveMode = "snap" | "linear" | "ease";
const CURVE_MODES: readonly CurveMode[] = ["snap", "linear", "ease"];

function applyCurve(t: number, curve: CurveMode, durationMs: number): number {
	if (curve === "snap" || durationMs <= 0) return 1;
	if (curve === "ease") return t * t * (3 - 2 * t);
	return t; // linear
}

function normalizePresetCurves(
	raw: Record<string, unknown> | undefined | null,
	keys: readonly string[],
): Record<string, CurveMode> {
	const out: Record<string, CurveMode> = {};
	for (const key of keys) {
		const c = raw?.[key];
		out[key] = CURVE_MODES.includes(c as CurveMode) ? (c as CurveMode) : "snap";
	}
	return out;
}

const INTERPOLATED_KEYS = [
	"crossfade",
	"speed",
	"intensity",
	"feedback",
	"depth",
	"palette",
	"ringOpacity",
	"maxBrightness",
] as const;

// ── applyCurve ────────────────────────────────────────────────────────────────

describe("applyCurve snap", () => {
	test("returns 1 at t=0", () => {
		expect(applyCurve(0, "snap", 500)).toBe(1);
	});
	test("returns 1 at t=0.5", () => {
		expect(applyCurve(0.5, "snap", 500)).toBe(1);
	});
	test("returns 1 at t=1", () => {
		expect(applyCurve(1, "snap", 500)).toBe(1);
	});
});

describe("applyCurve linear", () => {
	test("returns 0 at t=0", () => {
		expect(applyCurve(0, "linear", 500)).toBe(0);
	});
	test("returns 0.5 at t=0.5", () => {
		expect(applyCurve(0.5, "linear", 500)).toBe(0.5);
	});
	test("returns 1 at t=1", () => {
		expect(applyCurve(1, "linear", 500)).toBe(1);
	});
	test("returns t unchanged for any mid-range value", () => {
		expect(applyCurve(0.25, "linear", 500)).toBe(0.25);
		expect(applyCurve(0.75, "linear", 500)).toBe(0.75);
	});
});

describe("applyCurve ease (smoothstep)", () => {
	test("returns 0 at t=0", () => {
		expect(applyCurve(0, "ease", 500)).toBe(0);
	});
	test("returns 1 at t=1", () => {
		expect(applyCurve(1, "ease", 500)).toBe(1);
	});
	test("returns 0.5 at t=0.5 (symmetric midpoint)", () => {
		expect(applyCurve(0.5, "ease", 500)).toBeCloseTo(0.5);
	});
	test("is slower than linear at start (t=0.1)", () => {
		expect(applyCurve(0.1, "ease", 500)).toBeLessThan(0.1);
	});
	test("is faster than linear at end (t=0.9)", () => {
		expect(applyCurve(0.9, "ease", 500)).toBeGreaterThan(0.9);
	});
	test("is monotonically increasing", () => {
		const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
		const values = samples.map((t) => applyCurve(t, "ease", 500));
		for (let i = 1; i < values.length; i++) {
			const prev = values[i - 1] ?? 0;
			const curr = values[i] ?? 0;
			expect(curr).toBeGreaterThanOrEqual(prev);
		}
	});
});

describe("applyCurve zero duration forces snap", () => {
	test("linear with durationMs=0 returns 1", () => {
		expect(applyCurve(0.5, "linear", 0)).toBe(1);
	});
	test("ease with durationMs=0 returns 1", () => {
		expect(applyCurve(0.5, "ease", 0)).toBe(1);
	});
	test("snap with durationMs=0 returns 1", () => {
		expect(applyCurve(0.5, "snap", 0)).toBe(1);
	});
});

// ── normalizePresetCurves ─────────────────────────────────────────────────────

describe("normalizePresetCurves backward compatibility", () => {
	test("returns all snap when curves is undefined (old preset format)", () => {
		const curves = normalizePresetCurves(undefined, INTERPOLATED_KEYS);
		for (const key of INTERPOLATED_KEYS) {
			expect(curves[key]).toBe("snap");
		}
	});

	test("returns all snap when curves is null", () => {
		const curves = normalizePresetCurves(null, INTERPOLATED_KEYS);
		for (const key of INTERPOLATED_KEYS) {
			expect(curves[key]).toBe("snap");
		}
	});

	test("returns all snap for empty curves object", () => {
		const curves = normalizePresetCurves({}, INTERPOLATED_KEYS);
		for (const key of INTERPOLATED_KEYS) {
			expect(curves[key]).toBe("snap");
		}
	});
});

describe("normalizePresetCurves valid data", () => {
	test("preserves linear for a single key, snaps the rest", () => {
		const curves = normalizePresetCurves({ crossfade: "linear" }, INTERPOLATED_KEYS);
		expect(curves.crossfade).toBe("linear");
		expect(curves.intensity).toBe("snap");
	});

	test("preserves all three valid modes when set", () => {
		const input: Record<string, unknown> = {
			crossfade: "linear",
			intensity: "ease",
			palette: "snap",
		};
		const curves = normalizePresetCurves(input, INTERPOLATED_KEYS);
		expect(curves.crossfade).toBe("linear");
		expect(curves.intensity).toBe("ease");
		expect(curves.palette).toBe("snap");
	});

	test("preserves all-ease preset", () => {
		const input = Object.fromEntries(INTERPOLATED_KEYS.map((k) => [k, "ease"]));
		const curves = normalizePresetCurves(input, INTERPOLATED_KEYS);
		for (const key of INTERPOLATED_KEYS) {
			expect(curves[key]).toBe("ease");
		}
	});
});

describe("normalizePresetCurves invalid data", () => {
	test("replaces unknown string with snap", () => {
		const curves = normalizePresetCurves(
			{ crossfade: "unknown_mode" },
			INTERPOLATED_KEYS,
		);
		expect(curves.crossfade).toBe("snap");
	});

	test("replaces numeric value with snap", () => {
		const curves = normalizePresetCurves({ intensity: 1 }, INTERPOLATED_KEYS);
		expect(curves.intensity).toBe("snap");
	});

	test("replaces null value with snap", () => {
		const curves = normalizePresetCurves({ palette: null }, INTERPOLATED_KEYS);
		expect(curves.palette).toBe("snap");
	});
});
