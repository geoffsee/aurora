import { expect, test } from "vitest";
import { migrateControlState } from "../control-state-schema.ts";

test("v1 state is upgraded to v2 with activeShader defaulted to 0", () => {
	const result = migrateControlState({ schemaVersion: 1, crossfade: 0.5 });
	expect((result as Record<string, unknown>).schemaVersion).toBe(2);
	expect((result as Record<string, unknown>).activeShader).toBe(0);
});

test("v2 state passes through unchanged", () => {
	const input = { schemaVersion: 2, activeShader: 1 };
	expect(migrateControlState(input)).toBe(input);
});

test("null passes through unchanged", () => {
	expect(migrateControlState(null)).toBeNull();
});
