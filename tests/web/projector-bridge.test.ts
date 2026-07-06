import { describe, expect, test } from "vitest";
import {
	shouldRunStandaloneStaticDemo,
	shouldUseBroadcastChannel,
} from "../../web/projector-bridge.ts";

describe("shouldUseBroadcastChannel", () => {
	test("requires embed=1 and a same-origin parent frame", () => {
		const parent = { location: { origin: "http://127.0.0.1:3001" } };
		const frame = { parent: parent as Window };
		expect(
			shouldUseBroadcastChannel(
				{ search: "?embed=1", origin: "http://127.0.0.1:3001" },
				frame,
			),
		).toBe(true);
	});

	test("rejects missing embed flag", () => {
		expect(
			shouldUseBroadcastChannel({ search: "", origin: "http://127.0.0.1:3001" }, { parent: window }),
		).toBe(false);
	});
});

describe("shouldRunStandaloneStaticDemo", () => {
	test("is true on GitHub Pages without an embed parent", () => {
		expect(
			shouldRunStandaloneStaticDemo(
				{
					search: "",
					hostname: "geoffsee.github.io",
					protocol: "https:",
					origin: "https://geoffsee.github.io",
				},
				{ parent: window },
			),
		).toBe(true);
	});

	test("is false when embedded preview can use BroadcastChannel", () => {
		const parent = { location: { origin: "https://geoffsee.github.io" } };
		expect(
			shouldRunStandaloneStaticDemo(
				{
					search: "?embed=1",
					hostname: "geoffsee.github.io",
					protocol: "https:",
					origin: "https://geoffsee.github.io",
				},
				{ parent: parent as Window },
			),
		).toBe(false);
	});
});
