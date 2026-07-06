import { describe, expect, test } from "vitest";
import { shouldUseBroadcastChannel } from "../../web/projector-bridge.ts";

describe("shouldUseBroadcastChannel", () => {
	test("requires embed=1 and a same-origin parent frame", () => {
		expect(
			shouldUseBroadcastChannel(
				{ search: "?embed=1" },
				{ parent: window },
			),
		).toBe(true);
	});

	test("rejects missing embed flag", () => {
		expect(shouldUseBroadcastChannel({ search: "" }, { parent: window })).toBe(
			false,
		);
	});
});
