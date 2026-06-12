// Shared scenario definitions + baseline generator for the shader visual
// regression harness (see docs/shader-regression-harness.md).
//
// Run `bun tests/update-shader-baselines.ts` to regenerate
// tests/shader-baselines.json after an intentional shader change. The vitest
// suite in tests/shader-regression.test.ts imports the exports below, so the
// test and the generator can never disagree about what gets hashed.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	renderShader,
	type ShaderName,
	type ShaderUniforms,
} from "./shader-reference.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const BASELINES_PATH = join(here, "shader-baselines.json");
export const WGSL_DIR = join(here, "..", "assets", "shaders");
export const WGSL_SOURCES = ["vj_palette.wgsl", "vj_grid.wgsl"] as const;

export const SHADERS: readonly ShaderName[] = ["vj_palette", "vj_grid"];

// Small frames keep the suite fast while still covering radial geometry,
// grid cells, and the vignette; baselines are pixel-exact hashes, not images.
export const FRAME_WIDTH = 64;
export const FRAME_HEIGHT = 48;

export type ShaderScenario = { name: string; uniforms: ShaderUniforms };

export const SCENARIOS: readonly ShaderScenario[] = [
	{
		// Typical live set: OSC connected, all bands driving the visuals.
		name: "audio-active",
		uniforms: {
			params: [0.42, 1.25, 0, 0],
			paletteExtra: [0.8, 0.9, 0.6, 0],
			audioUniforms: [0.7, 0.5, 0.4, 0.3],
		},
	},
	{
		// Connected but nearly silent input — exercises the low end of audio_curve.
		name: "audio-quiet",
		uniforms: {
			params: [0.1, 7.5, 0, 0],
			paletteExtra: [1, 1, 0.05, 0],
			audioUniforms: [0.05, 0.02, 0.01, 0],
		},
	},
	{
		// OSC disconnected: energy sentinel -1.0 must blank the layer entirely.
		name: "osc-inactive",
		uniforms: {
			params: [0, 3, 0, 0],
			paletteExtra: [0.5, 0.5, 0, 0],
			audioUniforms: [-1, 0, 0, 0],
		},
	},
];

export type ShaderBaselines = {
	wgsl: Record<string, string>;
	frames: Record<string, string>;
};

export const sha256 = (data: string | Uint8Array): string =>
	createHash("sha256").update(data).digest("hex");

export const frameKey = (shader: ShaderName, scenario: string): string =>
	`${shader}/${scenario}`;

export function computeBaselines(): ShaderBaselines {
	const wgsl: Record<string, string> = {};
	for (const file of WGSL_SOURCES) {
		wgsl[file] = sha256(readFileSync(join(WGSL_DIR, file)));
	}
	const frames: Record<string, string> = {};
	for (const shader of SHADERS) {
		for (const scenario of SCENARIOS) {
			frames[frameKey(shader, scenario.name)] = sha256(
				renderShader(shader, FRAME_WIDTH, FRAME_HEIGHT, scenario.uniforms),
			);
		}
	}
	return { wgsl, frames };
}

if (import.meta.main) {
	writeFileSync(
		BASELINES_PATH,
		`${JSON.stringify(computeBaselines(), null, "\t")}\n`,
	);
	console.log(`wrote ${BASELINES_PATH}`);
}
