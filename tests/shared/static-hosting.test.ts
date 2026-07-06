import { describe, expect, test } from "vitest";
import { isStaticHosting } from "../../shared/static-hosting.ts";

describe("isStaticHosting", () => {
	test("detects GitHub Pages", () => {
		expect(
			isStaticHosting({
				hostname: "geoffsee.github.io",
				protocol: "https:",
				search: "",
			}),
		).toBe(true);
	});

	test("detects explicit static query override", () => {
		expect(
			isStaticHosting({
				hostname: "127.0.0.1",
				protocol: "http:",
				search: "?static=1",
			}),
		).toBe(true);
	});

	test("local bridge dev is not static", () => {
		expect(
			isStaticHosting({
				hostname: "127.0.0.1",
				protocol: "http:",
				search: "",
			}),
		).toBe(false);
	});
});
