import { describe, expect, test } from "vitest";
import {
	CONTROLS_PORT,
	projectorPreviewUrl,
	projectorWindowUrl,
	PROJECTOR_PORT,
} from "../../web/controls/lib/projector-url.ts";

describe("projectorPreviewUrl", () => {
	test("points at the projector port when served from the controls bridge", () => {
		const url = projectorPreviewUrl({
			port: String(CONTROLS_PORT),
			protocol: "http:",
			hostname: "127.0.0.1",
			href: `http://127.0.0.1:${CONTROLS_PORT}/`,
		});
		expect(url).toBe(`http://127.0.0.1:${PROJECTOR_PORT}/?embed=1`);
	});

	test("uses a relative parent URL on static hosting", () => {
		const url = projectorPreviewUrl({
			port: "",
			protocol: "https:",
			hostname: "example.github.io",
			href: "https://example.github.io/aurora/controls/index.html",
		});
		expect(url).toBe("https://example.github.io/aurora/?embed=1");
	});
});

describe("projectorWindowUrl", () => {
	test("opens the clean projector page without embed", () => {
		expect(
			projectorWindowUrl({
				port: "",
				protocol: "https:",
				hostname: "geoffsee.github.io",
				href: "https://geoffsee.github.io/aurora/controls/",
			}),
		).toBe("https://geoffsee.github.io/aurora/");
	});
});
