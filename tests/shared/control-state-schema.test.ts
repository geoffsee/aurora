import { expect, test } from "vitest";
import { migrateControlState } from "../../shared/control-state-schema.ts";

const DEFAULT_EMA_ALPHAS = {
	energy: 0.12,
	bass: 0.08,
	mid: 0.15,
	high: 0.22,
	pulse: 0.28,
};
const DEFAULT_BAND_CURVES = {
	energy: "linear",
	bass: "linear",
	mid: "linear",
	high: "linear",
};

test("v1 state is upgraded through v2..v6 with activeShader=0, bandCurves, emaAlphas, morph, and audioControlMode added", () => {
	const result = migrateControlState({
		schemaVersion: 1,
		crossfade: 0.5,
	}) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(7);
	expect(result.activeShader).toBe(0);
	expect(result.bandCurves).toEqual(DEFAULT_BAND_CURVES);
	expect(result.emaAlphas).toEqual(DEFAULT_EMA_ALPHAS);
	expect(result.morph).toBe(0);
	expect(result.audioControlMode).toBe(false);
});

test("v2 state is upgraded through v3..v6", () => {
	const result = migrateControlState({
		schemaVersion: 2,
		activeShader: 1,
	}) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(7);
	expect(result.activeShader).toBe(1);
	expect(result.bandCurves).toEqual(DEFAULT_BAND_CURVES);
	expect(result.emaAlphas).toEqual(DEFAULT_EMA_ALPHAS);
	expect(result.morph).toBe(0);
	expect(result.audioControlMode).toBe(false);
});

test("v3 state is upgraded through v4..v6 with emaAlphas, morph, and audioControlMode added", () => {
	const input = {
		schemaVersion: 3,
		activeShader: 1,
		bandCurves: {
			energy: "exponential",
			bass: "linear",
			mid: "logarithmic",
			high: "linear",
		},
	};
	const result = migrateControlState(input) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(7);
	expect(result.activeShader).toBe(1);
	expect(result.bandCurves).toEqual(input.bandCurves);
	expect(result.emaAlphas).toEqual(DEFAULT_EMA_ALPHAS);
	expect(result.morph).toBe(0);
	expect(result.audioControlMode).toBe(false);
});

test("v4 state is upgraded to v6 with morph and audioControlMode added", () => {
	const input = {
		schemaVersion: 4,
		activeShader: 1,
		bandCurves: {
			energy: "exponential",
			bass: "linear",
			mid: "logarithmic",
			high: "linear",
		},
		emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
	};
	const result = migrateControlState(input) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(7);
	expect(result.emaAlphas).toEqual(input.emaAlphas);
	expect(result.morph).toBe(0);
	expect(result.audioControlMode).toBe(false);
});

test("v3 state with legacy flat emaAlpha* fields carries them forward into emaAlphas", () => {
	const input = {
		schemaVersion: 3,
		activeShader: 1,
		bandCurves: {
			energy: "exponential",
			bass: "linear",
			mid: "linear",
			high: "linear",
		},
		emaAlphaBass: 0.1,
		emaAlphaEnergy: 0.3,
		emaAlphaMid: 0.2,
		emaAlphaHigh: 0.4,
		emaAlphaPulse: 0.5,
	};
	const result = migrateControlState(input) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(7);
	expect(result.emaAlphas).toEqual({
		energy: 0.3,
		bass: 0.1,
		mid: 0.2,
		high: 0.4,
		pulse: 0.5,
	});
	expect(result.morph).toBe(0);
	expect(result.audioControlMode).toBe(false);
});

test("v5 state is upgraded to v6 with audioControlMode added", () => {
	const input = {
		schemaVersion: 5,
		activeShader: 1,
		bandCurves: {
			energy: "exponential",
			bass: "linear",
			mid: "logarithmic",
			high: "linear",
		},
		emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
		morph: 0.4,
	};
	const result = migrateControlState(input) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(7);
	expect(result.activeShader).toBe(1);
	expect(result.emaAlphas).toEqual(input.emaAlphas);
	expect(result.morph).toBe(0.4);
	expect(result.audioControlMode).toBe(false);
});

test("v6 state is upgraded to v7 with paletteR/G/B derived from legacy palette hue", () => {
	const input = {
		schemaVersion: 6,
		activeShader: 1,
		palette: 0.5,
		bandCurves: {
			energy: "exponential",
			bass: "linear",
			mid: "logarithmic",
			high: "linear",
		},
		emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
		morph: 0.4,
		audioControlMode: true,
	};
	const result = migrateControlState(input) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(7);
	expect(result.paletteR).toBeTypeOf("number");
	expect(result.paletteG).toBeTypeOf("number");
	expect(result.paletteB).toBeTypeOf("number");
});

test("v7 state passes through unchanged", () => {
	const input = {
		schemaVersion: 7,
		activeShader: 1,
		paletteR: 0.2,
		paletteG: 0.4,
		paletteB: 0.8,
		bandCurves: {
			energy: "exponential",
			bass: "linear",
			mid: "logarithmic",
			high: "linear",
		},
		emaAlphas: { energy: 0.2, bass: 0.1, mid: 0.3, high: 0.4, pulse: 0.5 },
		morph: 0.4,
		audioControlMode: true,
	};
	expect(migrateControlState(input)).toBe(input);
});

test("null passes through unchanged", () => {
	expect(migrateControlState(null)).toBeNull();
});
