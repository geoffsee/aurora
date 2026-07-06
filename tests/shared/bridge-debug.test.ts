import { describe, expect, test, vi } from "vitest";
import { bridgeDebug, isBridgeDebugEnabled } from "../../shared/bridge-debug.ts";

describe("bridgeDebug", () => {
	test("is enabled on static hosting", () => {
		expect(
			isBridgeDebugEnabled({
				hostname: "geoffsee.github.io",
				protocol: "https:",
				search: "",
			}),
		).toBe(true);
	});

	test("is enabled with ?debug=1 on local dev", () => {
		expect(
			isBridgeDebugEnabled({
				hostname: "127.0.0.1",
				protocol: "http:",
				search: "?debug=1",
			}),
		).toBe(true);
	});

	test("logs when enabled", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		bridgeDebug("test event", { ok: true }, {
			hostname: "geoffsee.github.io",
			protocol: "https:",
			search: "",
		});
		expect(spy).toHaveBeenCalledWith(
			"[aurora-bridge] test event",
			expect.objectContaining({ ok: true }),
		);
		spy.mockRestore();
	});
});
