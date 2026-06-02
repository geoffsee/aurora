import { expect, test } from "vitest";
import { migrateControlState } from "../control-state-schema.ts";

test("v1 state is upgraded through v2 then v3 with all new fields defaulted", () => {
	const result = migrateControlState({ schemaVersion: 1, crossfade: 0.5 }) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(3);
	expect(result.activeShader).toBe(0);
	expect(result.emaAlphaBass).toBe(0.08);
	expect(result.emaAlphaEnergy).toBe(0.12);
	expect(result.emaAlphaMid).toBe(0.15);
	expect(result.emaAlphaHigh).toBe(0.22);
	expect(result.emaAlphaPulse).toBe(0.28);
	expect(result.crossfade).toBe(0.5);
});

test("v2 state is upgraded to v3 with EMA alpha fields defaulted", () => {
	const result = migrateControlState({ schemaVersion: 2, activeShader: 1 }) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(3);
	expect(result.activeShader).toBe(1);
	expect(result.emaAlphaBass).toBe(0.08);
	expect(result.emaAlphaEnergy).toBe(0.12);
	expect(result.emaAlphaMid).toBe(0.15);
	expect(result.emaAlphaHigh).toBe(0.22);
	expect(result.emaAlphaPulse).toBe(0.28);
});

test("v3 state passes through unchanged", () => {
	const input = { schemaVersion: 3, activeShader: 1, emaAlphaBass: 0.15 };
	expect(migrateControlState(input)).toBe(input);
});

test("null passes through unchanged", () => {
	expect(migrateControlState(null)).toBeNull();
});
