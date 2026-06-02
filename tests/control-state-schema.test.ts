import { expect, test } from "vitest";
import { migrateControlState } from "../control-state-schema.ts";

test("v1 state is upgraded through v2 then v3 with activeShader=0 and bandCurves added", () => {
	const result = migrateControlState({ schemaVersion: 1, crossfade: 0.5 }) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(3);
	expect(result.activeShader).toBe(0);
	expect(result.bandCurves).toEqual({ energy: "linear", bass: "linear", mid: "linear", high: "linear" });
});

test("v2 state is upgraded to v3 with bandCurves added", () => {
	const result = migrateControlState({ schemaVersion: 2, activeShader: 1 }) as Record<string, unknown>;
	expect(result.schemaVersion).toBe(3);
	expect(result.activeShader).toBe(1);
	expect(result.bandCurves).toEqual({ energy: "linear", bass: "linear", mid: "linear", high: "linear" });
});

test("v3 state passes through unchanged", () => {
	const input = { schemaVersion: 3, activeShader: 1, bandCurves: { energy: "exponential", bass: "linear", mid: "logarithmic", high: "linear" } };
	expect(migrateControlState(input)).toBe(input);
});

test("null passes through unchanged", () => {
	expect(migrateControlState(null)).toBeNull();
});
