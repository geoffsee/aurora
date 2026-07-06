import { describe, expect, test } from "vitest";
import {
	geoffseePagesControlsUrl,
	geoffseePagesProjectorUrl,
	isGeoffseeGithubPages,
	isStaticHosting,
} from "../../shared/static-hosting.ts";

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

describe("isGeoffseeGithubPages", () => {
	test("matches the published site URL", () => {
		expect(
			isGeoffseeGithubPages({
				href: "https://geoffsee.github.io/aurora/",
			}),
		).toBe(true);
	});

	test("does not match local dev", () => {
		expect(
			isGeoffseeGithubPages({
				href: "http://127.0.0.1:3000/",
			}),
		).toBe(false);
	});
});

describe("geoffseePagesNav urls", () => {
	test("resolves controls and projector paths from the repo root", () => {
		const root = { href: "https://geoffsee.github.io/aurora/" };
		expect(geoffseePagesControlsUrl(root)).toBe(
			"https://geoffsee.github.io/aurora/controls/",
		);
		expect(geoffseePagesProjectorUrl({ href: "https://geoffsee.github.io/aurora/controls/" })).toBe(
			"https://geoffsee.github.io/aurora/",
		);
	});
});
