// Shader visual regression harness. `bun run test` has no GPU, so this suite
// evaluates the CPU reference port in tests/shader-reference.ts per pixel and
// compares hashes against the committed baselines. The .wgsl sources are
// hash-guarded so a shader edit fails the suite until the reference port and
// baselines are re-synced intentionally.
// Workflow: docs/shader-regression-harness.md

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { renderShader } from "./shader-reference.ts";
import {
	BASELINES_PATH,
	FRAME_HEIGHT,
	FRAME_WIDTH,
	SCENARIOS,
	SHADERS,
	WGSL_SOURCES,
	computeBaselines,
	frameKey,
	sha256,
	type ShaderBaselines,
} from "./update-shader-baselines.ts";

const RESYNC_HINT =
	"If this change is intentional, mirror it in tests/shader-reference.ts and run `bun tests/update-shader-baselines.ts` (see docs/shader-regression-harness.md).";

const baselines: ShaderBaselines = JSON.parse(
	readFileSync(BASELINES_PATH, "utf8"),
);
const current = computeBaselines();

describe("WGSL sources are hash-guarded", () => {
	for (const file of WGSL_SOURCES) {
		test(`${file} matches the committed baseline hash`, () => {
			expect(
				current.wgsl[file],
				`assets/shaders/${file} changed but tests/shader-baselines.json was not updated. ${RESYNC_HINT}`,
			).toBe(baselines.wgsl[file]);
		});
	}

	test("baseline covers exactly the shader sources on disk", () => {
		expect(Object.keys(baselines.wgsl).sort()).toEqual(
			[...WGSL_SOURCES].sort(),
		);
	});
});

describe("CPU reference render matches committed baselines", () => {
	for (const shader of SHADERS) {
		for (const scenario of SCENARIOS) {
			test(`${shader} / ${scenario.name}`, () => {
				const pixels = renderShader(
					shader,
					FRAME_WIDTH,
					FRAME_HEIGHT,
					scenario.uniforms,
				);
				expect(pixels).toHaveLength(FRAME_WIDTH * FRAME_HEIGHT * 4);
				expect(
					sha256(pixels),
					`rendered output for ${shader}/${scenario.name} drifted from the baseline. ${RESYNC_HINT}`,
				).toBe(baselines.frames[frameKey(shader, scenario.name)]);
			});
		}
	}

	test("baseline covers exactly the shader × scenario matrix", () => {
		const expected = SHADERS.flatMap((shader) =>
			SCENARIOS.map((s) => frameKey(shader, s.name)),
		).sort();
		expect(Object.keys(baselines.frames).sort()).toEqual(expected);
	});
});

describe("reference port sanity", () => {
	test("osc-inactive sentinel fully blanks the alpha channel", () => {
		for (const shader of SHADERS) {
			const pixels = renderShader(shader, 8, 8, {
				params: [0.5, 2, 0, 0],
				paletteExtra: [1, 1, 0.5, 0],
				audioUniforms: [-1, 0.9, 0.9, 0.9],
			});
			const alphas = pixels.filter((_, i) => i % 4 === 3);
			expect(alphas.every((v) => v === 0)).toBe(true);
		}
	});

	test("rendering is deterministic across calls", () => {
		const shader = SHADERS[0]!;
		const scenario = SCENARIOS[0]!;
		const a = renderShader(shader, 16, 16, scenario.uniforms);
		const b = renderShader(shader, 16, 16, scenario.uniforms);
		expect(sha256(a)).toBe(sha256(b));
	});
});
