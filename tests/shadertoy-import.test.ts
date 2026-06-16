import { describe, expect, test } from "vitest";
import { extractShadertoyId } from "../shadertoy-import.ts";

describe("extractShadertoyId", () => {
	test("accepts a bare shader ID", () => {
		expect(extractShadertoyId("ftGGWm")).toBe("ftGGWm");
		expect(extractShadertoyId("XdXGzr")).toBe("XdXGzr");
	});

	test("extracts ID from full Shadertoy URL", () => {
		expect(extractShadertoyId("https://www.shadertoy.com/view/ftGGWm")).toBe(
			"ftGGWm",
		);
		expect(extractShadertoyId("http://shadertoy.com/view/XdXGzr")).toBe(
			"XdXGzr",
		);
		expect(extractShadertoyId("shadertoy.com/view/Wd3Bz4?foo=bar")).toBe(
			"Wd3Bz4",
		);
	});

	test("trims whitespace", () => {
		expect(extractShadertoyId("  ftGGWm  ")).toBe("ftGGWm");
	});

	test("rejects IDs with disallowed characters", () => {
		expect(extractShadertoyId("ftG-GWm")).toBeNull();
		expect(extractShadertoyId("ftG_GWm")).toBeNull();
		expect(extractShadertoyId("ftG GWm")).toBeNull();
		expect(extractShadertoyId("ftG/GWm")).toBeNull();
	});

	test("rejects IDs longer than 16 chars", () => {
		expect(extractShadertoyId("a".repeat(17))).toBeNull();
		expect(
			extractShadertoyId(`https://shadertoy.com/view/${"a".repeat(17)}`),
		).toBeNull();
	});

	test("rejects empty / non-matching strings", () => {
		expect(extractShadertoyId("")).toBeNull();
		expect(extractShadertoyId("   ")).toBeNull();
		expect(extractShadertoyId("not a url")).toBeNull();
		expect(extractShadertoyId("https://example.com/view/abc123")).toBe(
			"abc123",
		);
	});

	test("rejects path traversal in URL form", () => {
		expect(
			extractShadertoyId("https://shadertoy.com/view/../../../etc/passwd"),
		).toBeNull();
	});
});
