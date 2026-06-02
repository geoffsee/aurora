import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export type ShadertoyMeta = {
	id: string;
	name: string;
	username: string;
};

export type ImportSuccess = {
	ok: true;
	wgsl: string;
	meta: ShadertoyMeta;
	usedIChannel: boolean;
};

export type ImportFailure = {
	ok: false;
	error: string;
};

export type ImportResult = ImportSuccess | ImportFailure;

const SHADERTOY_ID_RE = /^[A-Za-z0-9]{1,16}$/;

export const extractShadertoyId = (input: string): string | null => {
	const trimmed = input.trim();
	if (SHADERTOY_ID_RE.test(trimmed)) return trimmed;
	const match = trimmed.match(/\/view\/([A-Za-z0-9]+)/);
	if (match && match[1] && SHADERTOY_ID_RE.test(match[1])) {
		return match[1];
	}
	return null;
};

const sanitize = (s: unknown): string =>
	String(s ?? "").replace(/[\x00-\x1f<>]/g, "").slice(0, 200);

const WRAPPER_PREAMBLE = `#version 450
precision highp float;

layout(set = 2, binding = 0) uniform Params { vec4 params; };
layout(set = 2, binding = 1) uniform PaletteExtra { vec4 palette_extra; };
layout(set = 2, binding = 2) uniform AudioUniforms { vec4 audio_uniforms; };
layout(set = 2, binding = 3) uniform Reserved { vec4 _reserved; };

#define iTime (params.y)
#define iResolution (vec3(1280.0, 720.0, 1.0))
#define iMouse (vec4(0.0))
#define iFrame (int(params.y * 60.0))
#define iTimeDelta (1.0 / 60.0)
#define iFrameRate (60.0)
#define iDate (vec4(0.0))
#define iChannelTime0 (params.y)
#define iChannelTime1 (params.y)
#define iChannelTime2 (params.y)
#define iChannelTime3 (params.y)
#define iChannelResolution0 (vec3(512.0, 2.0, 1.0))
#define iChannelResolution1 (vec3(512.0, 2.0, 1.0))
#define iChannelResolution2 (vec3(512.0, 2.0, 1.0))
#define iChannelResolution3 (vec3(512.0, 2.0, 1.0))

const int iChannel0 = 0;
const int iChannel1 = 1;
const int iChannel2 = 2;
const int iChannel3 = 3;

vec4 _bevyosc_channel(int ch) {
  if (ch == 0) return vec4(audio_uniforms.y, audio_uniforms.z, audio_uniforms.w, audio_uniforms.x);
  return vec4(0.0);
}

#define texture(ch, uv)            _bevyosc_channel(ch)
#define texelFetch(ch, p, lod)     _bevyosc_channel(ch)
#define textureLod(ch, uv, lod)    _bevyosc_channel(ch)
#define texture2D(ch, uv)          _bevyosc_channel(ch)
#define textureGrad(ch, uv, dx, dy) _bevyosc_channel(ch)

`;

const WRAPPER_EPILOGUE = `

layout(location = 0) out vec4 _bevyosc_frag_out;
void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  _bevyosc_frag_out = color;
}
`;

const wrapGlsl = (userGlsl: string): string =>
	`${WRAPPER_PREAMBLE}// === SHADERTOY USER CODE ===\n${userGlsl}\n// === END USER CODE ===\n${WRAPPER_EPILOGUE}`;

type NagaRun = {
	code: number | null;
	stderr: string;
	stdout: string;
};

const runNaga = async (args: string[]): Promise<NagaRun> => {
	const proc = Bun.spawn(["naga", ...args], {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
};

/**
 * Naga emits a self-contained WGSL module with a `main` entry point and binding
 * layouts taken from our `layout(set=2, binding=N)` declarations. We need to:
 *   - Rename `fn main(...) -> @location(0) vec4<f32>` to `fn fragment(in: VertexOutput) -> ...`
 *   - Replace the `@builtin(position)` parameter with `in.position`
 *   - Prepend the Bevy `#import` for `VertexOutput`
 * If naga's output diverges from what we expect (e.g. different attribute
 * spelling), we return null so the caller can surface a clear error rather
 * than emit a broken file.
 */
const adaptNagaWgslForBevy = (raw: string): string | null => {
	const importLine = "#import bevy_sprite::mesh2d_vertex_output::VertexOutput";
	if (raw.includes(importLine)) return raw;

	const fragmentSig =
		/@fragment\s*\nfn\s+main\s*\(\s*@builtin\(position\)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*vec4<f32>\s*\)\s*->\s*@location\(0\)\s*vec4<f32>\s*\{/;
	const match = raw.match(fragmentSig);
	if (!match) return null;
	const posName = match[1];
	const replaced = raw.replace(
		fragmentSig,
		`@fragment\nfn fragment(_bevyosc_in: VertexOutput) -> @location(0) vec4<f32> {\n    let ${posName}: vec4<f32> = _bevyosc_in.position;`,
	);
	return `${importLine}\n\n${replaced}`;
};

const ICHANNEL_USAGE_RE = /\b(iChannel[0-3]|texture\s*\(|texelFetch\s*\(|textureLod\s*\(|texture2D\s*\(|textureGrad\s*\()/;

const checkIChannelUsage = (userGlsl: string): boolean =>
	ICHANNEL_USAGE_RE.test(userGlsl);

const fetchShader = async (id: string, apiKey: string) => {
	const apiUrl = `https://www.shadertoy.com/api/v1/shaders/${id}?key=${encodeURIComponent(apiKey)}`;
	const response = await fetch(apiUrl);
	if (!response.ok) {
		throw new Error(`Shadertoy API HTTP ${response.status}`);
	}
	const json = (await response.json()) as Record<string, unknown>;
	if (typeof json.Error === "string") {
		throw new Error(`Shadertoy API error: ${json.Error}`);
	}
	const shader = json.Shader as Record<string, unknown> | undefined;
	if (!shader) {
		throw new Error("Shadertoy API response missing `Shader` field");
	}
	return shader;
};

export const importShadertoyUrl = async (
	urlOrId: string,
	apiKey: string,
): Promise<ImportResult> => {
	const id = extractShadertoyId(urlOrId);
	if (!id) {
		return { ok: false, error: "Invalid Shadertoy URL or ID" };
	}

	let shader: Record<string, unknown>;
	try {
		shader = await fetchShader(id, apiKey);
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}

	const info = (shader.info ?? {}) as Record<string, unknown>;
	const renderpass = (shader.renderpass ?? []) as Array<Record<string, unknown>>;
	if (!Array.isArray(renderpass) || renderpass.length === 0) {
		return { ok: false, error: "Shadertoy response has no render passes" };
	}

	const imagePass = renderpass.find((p) => p.type === "image");
	if (!imagePass) {
		return { ok: false, error: "Shader has no Image render pass" };
	}
	const extraPasses = renderpass.filter((p) => p.type !== "image");
	if (extraPasses.length > 0) {
		const passNames = extraPasses
			.map((p) => sanitize(p.name ?? p.type))
			.join(", ");
		return {
			ok: false,
			error: `Multi-pass shaders not supported in v1. This shader has additional passes: ${passNames}`,
		};
	}

	const userGlsl = typeof imagePass.code === "string" ? imagePass.code : "";
	if (!userGlsl) {
		return { ok: false, error: "Image pass has no source code" };
	}

	const usedIChannel = checkIChannelUsage(userGlsl);
	const wrapped = wrapGlsl(userGlsl);

	const stem = randomBytes(8).toString("hex");
	const glslPath = join(tmpdir(), `shadertoy-${stem}.frag`);
	const wgslPath = join(tmpdir(), `shadertoy-${stem}.wgsl`);

	try {
		await writeFile(glslPath, wrapped, "utf8");
		const conv = await runNaga([glslPath, wgslPath]);
		if (conv.code !== 0) {
			return {
				ok: false,
				error: `naga GLSL→WGSL failed:\n${conv.stderr || conv.stdout}`,
			};
		}
		const rawWgsl = await readFile(wgslPath, "utf8");
		const adapted = adaptNagaWgslForBevy(rawWgsl);
		if (!adapted) {
			return {
				ok: false,
				error:
					"Could not adapt naga output to Bevy Material2d shape (unexpected entry-point signature)",
			};
		}

		// Round-trip validation: ensure the adapted WGSL parses cleanly.
		const validatePath = join(tmpdir(), `shadertoy-${stem}-validate.wgsl`);
		await writeFile(validatePath, adapted, "utf8");
		const verify = await runNaga([validatePath]);
		await unlink(validatePath).catch(() => {});
		if (verify.code !== 0) {
			return {
				ok: false,
				error: `Adapted WGSL failed validation:\n${verify.stderr || verify.stdout}`,
			};
		}

		const meta: ShadertoyMeta = {
			id,
			name: sanitize(info.name ?? id),
			username: sanitize(info.username ?? "unknown"),
		};
		return { ok: true, wgsl: adapted, meta, usedIChannel };
	} finally {
		await unlink(glslPath).catch(() => {});
		await unlink(wgslPath).catch(() => {});
	}
};
