import { describe, expect, test } from "vitest";
import {
	adaptNagaWgslForBevy,
	checkIChannelUsage,
	extractShadertoyId,
	wrapGlsl,
} from "../shadertoy-import.ts";

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

describe("wrapGlsl", () => {
	test("emits the mainImage scaffold around user code", () => {
		const out = wrapGlsl("void mainImage(out vec4 c, in vec2 p){ c = vec4(1.0); }");
		expect(out).toContain("#version 450");
		expect(out).toContain("// === SHADERTOY USER CODE ===");
		expect(out).toContain("// === END USER CODE ===");
		expect(out).toContain("mainImage(color, gl_FragCoord.xy);");
		expect(out).toContain("layout(location = 0) out vec4 _bevyosc_frag_out;");
	});

	test("embeds the user source verbatim between the markers", () => {
		const user = "// my shader\nvoid mainImage(out vec4 c, in vec2 p){}";
		const out = wrapGlsl(user);
		expect(out).toContain(
			`// === SHADERTOY USER CODE ===\n${user}\n// === END USER CODE ===`,
		);
	});
});

describe("adaptNagaWgslForBevy", () => {
	const naga = (posName: string) =>
		`@fragment\nfn main(@builtin(position) ${posName}: vec4<f32>) -> @location(0) vec4<f32> {\n    return ${posName};\n}`;

	test("rewrites naga's main entry point into a Bevy fragment fn", () => {
		const adapted = adaptNagaWgslForBevy(naga("pos"));
		expect(adapted).not.toBeNull();
		expect(adapted).toContain(
			"#import bevy_sprite::mesh2d_vertex_output::VertexOutput",
		);
		expect(adapted).toContain("fn fragment(_bevyosc_in: VertexOutput)");
		expect(adapted).toContain("let pos: vec4<f32> = _bevyosc_in.position;");
		expect(adapted).not.toContain("fn main(");
	});

	test("is idempotent when the import is already present", () => {
		const already = `#import bevy_sprite::mesh2d_vertex_output::VertexOutput\n\nfn fragment() {}`;
		expect(adaptNagaWgslForBevy(already)).toBe(already);
	});

	test("returns null when the entry-point signature is unexpected", () => {
		expect(
			adaptNagaWgslForBevy(
				"@fragment\nfn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> { return vec4(1.0); }",
			),
		).toBeNull();
		expect(adaptNagaWgslForBevy("fn helper() -> f32 { return 1.0; }")).toBeNull();
	});
});

describe("checkIChannelUsage", () => {
	test("detects real iChannel / texture usage", () => {
		expect(checkIChannelUsage("vec4 c = texture(iChannel0, uv);")).toBe(true);
		expect(checkIChannelUsage("texelFetch(iChannel1, p, 0);")).toBe(true);
	});

	test("ignores mentions inside comments", () => {
		expect(checkIChannelUsage("// blurs the texture (slow)\nvec4 c;")).toBe(
			false,
		);
		expect(checkIChannelUsage("/* uses texture( ) elsewhere */\nfloat x;")).toBe(
			false,
		);
	});
});
