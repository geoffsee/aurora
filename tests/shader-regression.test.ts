import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	SHADERS,
	decodePng,
	diffFramebuffers,
	encodePng,
	renderShader,
} from "./shader-render.ts";

// Baselines live next to the existing ws-fanout snapshots, keyed by this file
// name to match the repo's `__screenshots__/<testfile>/` convention.
const BASELINE_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"__screenshots__",
	"shader-regression.test.ts",
);

// Set UPDATE_SHADER_BASELINES=1 to (re)write baselines instead of diffing.
const UPDATE = process.env.UPDATE_SHADER_BASELINES === "1";

// Allow a vanishingly small fraction of pixels to drift within tolerance so the
// harness survives cross-platform float jitter but still trips on real changes.
const MAX_DRIFT_FRACTION = 0.005;

// Note: this only asserts a Shadertoy-*style* archetype's output is snapshotted.
// It does NOT exercise the real import/transform pipeline (shadertoy-import.ts:
// wrapGlsl / adaptNagaWgslForBevy) or the GPU WGSL — those share no code with the
// CPU reimplementation here, so a regression in them won't move these baselines.
test("a Shadertoy-style shader archetype is covered by the harness", () => {
	expect(SHADERS.some((s) => s.shadertoyStyle)).toBe(true);
});

describe("shader visual regression", () => {
	for (const shader of SHADERS) {
		test(`${shader.name} matches its baseline`, () => {
			const fb = renderShader(shader);
			const baselinePath = join(BASELINE_DIR, `${shader.name}.png`);

			if (UPDATE) {
				mkdirSync(BASELINE_DIR, { recursive: true });
				writeFileSync(baselinePath, encodePng(fb));
				return;
			}

			if (!existsSync(baselinePath)) {
				if (process.env.CI) {
					// A missing baseline in CI means a regression guard with nothing to
					// guard against — fail loudly instead of silently recording one.
					throw new Error(
						`Missing baseline for "${shader.name}"; run ` +
							`UPDATE_SHADER_BASELINES=1 bun run test:web and commit the PNG.`,
					);
				}
				// First local run with no committed baseline: record it and pass,
				// matching the create-on-missing behaviour of snapshot tooling.
				mkdirSync(BASELINE_DIR, { recursive: true });
				writeFileSync(baselinePath, encodePng(fb));
				return;
			}

			const baseline = decodePng(readFileSync(baselinePath));
			const diff = diffFramebuffers(baseline, fb);
			const maxDrifted = Math.floor(diff.totalPixels * MAX_DRIFT_FRACTION);

			expect(
				diff.driftedPixels,
				`Shader "${shader.name}" drifted from baseline: ${diff.driftedPixels}/${diff.totalPixels} ` +
					`pixels changed (max channel delta ${diff.maxChannelDelta}). ` +
					`If this change is intentional, refresh baselines with ` +
					`UPDATE_SHADER_BASELINES=1 bun run test:web.`,
			).toBeLessThanOrEqual(maxDrifted);
		});
	}
});

test("PNG codec round-trips a rendered framebuffer", () => {
	const fb = renderShader(SHADERS[0]!);
	const decoded = decodePng(encodePng(fb));
	expect(decoded.width).toBe(fb.width);
	expect(decoded.height).toBe(fb.height);
	expect(diffFramebuffers(fb, decoded, 0).matched).toBe(true);
});
