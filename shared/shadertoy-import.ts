import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
	extractShadertoyId,
	fetchShadertoyShader,
	parseShadertoyImagePass,
} from "./shadertoy-api.ts";
import type { ShadertoyMeta } from "./shadertoy-api.ts";

export type { ShadertoyMeta };
export { extractShadertoyId } from "./shadertoy-api.ts";

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

// Array forms — Shadertoy's canonical uniforms are iChannelResolution[i] /
// iChannelTime[i], which the scalar-suffixed #defines above don't cover. These
// const arrays let shaders that index by channel compile too.
const vec3 iChannelResolution[4] = vec3[4](
  vec3(512.0, 2.0, 1.0),
  vec3(512.0, 2.0, 1.0),
  vec3(512.0, 2.0, 1.0),
  vec3(512.0, 2.0, 1.0)
);
const float iChannelTime[4] = float[4](0.0, 0.0, 0.0, 0.0);

const int iChannel0 = 0;
const int iChannel1 = 1;
const int iChannel2 = 2;
const int iChannel3 = 3;

vec4 _aurora_channel(int ch) {
  if (ch == 0) return vec4(audio_uniforms.y, audio_uniforms.z, audio_uniforms.w, audio_uniforms.x);
  return vec4(0.0);
}

#define texture(ch, uv)            _aurora_channel(ch)
#define texelFetch(ch, p, lod)     _aurora_channel(ch)
#define textureLod(ch, uv, lod)    _aurora_channel(ch)
#define texture2D(ch, uv)          _aurora_channel(ch)
#define textureGrad(ch, uv, dx, dy) _aurora_channel(ch)

`;

const WRAPPER_EPILOGUE = `

layout(location = 0) out vec4 _aurora_frag_out;
void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  _aurora_frag_out = color;
}
`;

export const wrapGlsl = (userGlsl: string): string =>
	`${WRAPPER_PREAMBLE}// === SHADERTOY USER CODE ===\n${userGlsl}\n// === END USER CODE ===\n${WRAPPER_EPILOGUE}`;

type NagaRun = {
	code: number | null;
	stderr: string;
	stdout: string;
};

// Returns the installed naga-cli semver (e.g. "26.0.0"), or null when the CLI is
// absent or its version can't be parsed. naga's WGSL output is version-specific,
// so the import-regression harness uses this to pin the WGSL snapshot to one
// release rather than failing across versions.
export const nagaVersion = async (): Promise<string | null> => {
	const { code, stdout } = await runNaga(["--version"]);
	if (code !== 0) return null;
	const match = stdout.match(/\d+\.\d+\.\d+/);
	return match ? match[0] : null;
};

const runNaga = async (args: string[]): Promise<NagaRun> => {
	let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
	try {
		proc = Bun.spawn(["naga", ...args], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch {
		// Bun.spawn throws "No such file or directory (os error 2)" when the binary
		// is missing. Surface a clear, actionable message instead of the raw error.
		return {
			code: null,
			stdout: "",
			stderr:
				"`naga` CLI not found on PATH. Install it with `cargo install naga-cli` to enable Shadertoy import.",
		};
	}
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
};

const BEVY_VERTEX_OUTPUT_IMPORT =
	"#import bevy_sprite::mesh2d_vertex_output::VertexOutput";

// Bevy resolves the `#import` above at material-load time; bare naga can't. For
// the standalone validation pass we swap it for a concrete VertexOutput matching
// the mesh2d shape so naga can type-check the adapted module on its own.
const VALIDATION_VERTEX_OUTPUT_STUB = `struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_position: vec4<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}`;

/**
 * Naga emits a self-contained WGSL module with a `main` entry point and binding
 * layouts taken from our `layout(set=2, binding=N)` declarations. We need to:
 *   - Rename `fn main(...) -> <return>` to `fn fragment(in: VertexOutput) -> <return>`
 *   - Replace the `@builtin(position)` parameter with `in.position`
 *   - Prepend the Bevy `#import` for `VertexOutput`
 * If naga's output diverges from what we expect (e.g. different attribute
 * spelling), we return null so the caller can surface a clear error rather
 * than emit a broken file.
 */
export const adaptNagaWgslForBevy = (raw: string): string | null => {
	const importLine = BEVY_VERTEX_OUTPUT_IMPORT;
	if (raw.includes(importLine)) return raw;

	// naga's return type varies by version: older builds inline `@location(0)
	// vec4<f32>`, newer ones return a generated output struct (e.g.
	// `FragmentOutput`). Capture whichever it is and keep it verbatim so the
	// rewritten body (which may `return FragmentOutput(...)`) stays type-correct.
	const fragmentSig =
		/@fragment\s*\nfn\s+main\s*\(\s*@builtin\(position\)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*vec4<f32>\s*\)\s*->\s*(@location\(0\)\s*vec4<f32>|[A-Za-z_][A-Za-z0-9_]*)\s*\{/;
	const match = raw.match(fragmentSig);
	if (!match) return null;
	const posName = match[1];
	const returnType = match[2];
	const replaced = raw.replace(
		fragmentSig,
		`@fragment\nfn fragment(_aurora_in: VertexOutput) -> ${returnType} {\n    let ${posName}: vec4<f32> = _aurora_in.position;`,
	);
	return `${importLine}\n\n${replaced}`;
};

const ICHANNEL_USAGE_RE = /\b(iChannel[0-3]|texture\s*\(|texelFetch\s*\(|textureLod\s*\(|texture2D\s*\(|textureGrad\s*\()/;

// Remove // line comments and /* */ block comments so a mention like
// `// blurs the texture (slow)` doesn't trip the usage check below.
const stripGlslComments = (src: string): string =>
	src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

export const checkIChannelUsage = (userGlsl: string): boolean =>
	ICHANNEL_USAGE_RE.test(stripGlslComments(userGlsl));

export type TransformSuccess = {
	ok: true;
	wgsl: string;
	usedIChannel: boolean;
};

export type TransformResult = TransformSuccess | ImportFailure;

/**
 * The network-free core of the import: take a Shadertoy Image-pass `mainImage`
 * body, wrap it in our scaffold, convert GLSL→WGSL with naga, adapt naga's entry
 * point to Bevy's Material2d shape, and re-validate the result. `importShadertoyUrl`
 * fetches the source then defers to this; the shader-import regression harness
 * drives it directly against a committed fixture so the real transform path is
 * snapshotted rather than a CPU stand-in. Requires the `naga` CLI on PATH.
 */
export const transformShadertoyGlsl = async (
	userGlsl: string,
): Promise<TransformResult> => {
	const usedIChannel = checkIChannelUsage(userGlsl);
	const wrapped = wrapGlsl(userGlsl);

	const stem = randomBytes(8).toString("hex");
	const glslPath = join(tmpdir(), `shadertoy-${stem}.frag`);
	const wgslPath = join(tmpdir(), `shadertoy-${stem}.wgsl`);

	try {
		await writeFile(glslPath, wrapped, "utf8");
		// naga can't infer GLSL input from the `.frag` stem alone (it reads the
		// stage but not the language), so name both explicitly.
		const conv = await runNaga([
			"--input-kind",
			"glsl",
			"--shader-stage",
			"frag",
			glslPath,
			wgslPath,
		]);
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

		// Round-trip validation: ensure the adapted WGSL parses cleanly. naga can't
		// resolve Bevy's `#import`, so validate against a concrete VertexOutput stub
		// — the returned `adapted` keeps the real import untouched.
		const validationSrc = adapted.replace(
			BEVY_VERTEX_OUTPUT_IMPORT,
			VALIDATION_VERTEX_OUTPUT_STUB,
		);
		const validatePath = join(tmpdir(), `shadertoy-${stem}-validate.wgsl`);
		await writeFile(validatePath, validationSrc, "utf8");
		const verify = await runNaga([validatePath]);
		await unlink(validatePath).catch(() => {});
		if (verify.code !== 0) {
			return {
				ok: false,
				error: `Adapted WGSL failed validation:\n${verify.stderr || verify.stdout}`,
			};
		}

		return { ok: true, wgsl: adapted, usedIChannel };
	} finally {
		await unlink(glslPath).catch(() => {});
		await unlink(wgslPath).catch(() => {});
	}
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
		shader = await fetchShadertoyShader(id, apiKey);
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}

	const parsed = parseShadertoyImagePass(shader, id);
	if ("ok" in parsed) {
		return parsed;
	}

	const { userGlsl, meta } = parsed;
	const transformed = await transformShadertoyGlsl(userGlsl);
	if (!transformed.ok) {
		return transformed;
	}

	return {
		ok: true,
		wgsl: transformed.wgsl,
		meta,
		usedIChannel: transformed.usedIChannel,
	};
};
