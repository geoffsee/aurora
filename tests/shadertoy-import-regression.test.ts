import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
	nagaVersion,
	transformShadertoyGlsl,
	wrapGlsl,
} from "../shadertoy-import.ts";

// Unlike tests/shader-regression.test.ts (which diffs CPU stand-in renders), this
// harness drives a real imported Shadertoy shader through the *actual* import
// transform in shadertoy-import.ts and snapshots its text output, closing the
// false-coverage gap called out in AGENTS.md. The fixture is the raw Image-pass
// source as the Shadertoy API returns it.
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "fixtures", "shadertoy");
const SHADER_NAME = "palette-swirl";
const FIXTURE_GLSL = join(FIXTURE_DIR, `${SHADER_NAME}.frag`);
const WRAPPED_BASELINE = join(FIXTURE_DIR, `${SHADER_NAME}.wrapped.glsl`);
const WGSL_BASELINE = join(FIXTURE_DIR, `${SHADER_NAME}.wgsl`);

// Shares the env var with the PNG harness so a single documented command refreshes
// every shader baseline at once.
const UPDATE = process.env.UPDATE_SHADER_BASELINES === "1";

// naga's WGSL output is version-specific (SSA temp names, generated output-struct
// shape), so the *.wgsl baseline is only reproducible against one pinned naga-cli
// release. Matches the `naga` crate in Cargo.lock; install with
// `cargo install naga-cli@26.0.0`. Also recorded in AGENTS.md. Stage 2 below runs
// the WGSL snapshot ONLY against this version and skips on any other (or absent)
// naga, so a contributor on a different release gets a skip rather than a
// false-positive "regression". Bump this together with the regenerated baseline.
const PINNED_NAGA_VERSION = "26.0.0";

const userGlsl = readFileSync(FIXTURE_GLSL, "utf8");

// Compare `actual` against a committed text baseline, mirroring the PNG harness's
// missing-baseline policy: UPDATE rewrites it; a missing baseline is recorded and
// passes locally but fails in CI (so an uncommitted/deleted baseline can't go
// green); otherwise an exact mismatch fails the build.
const expectMatchesBaseline = (path: string, actual: string, label: string) => {
	if (UPDATE) {
		writeFileSync(path, actual);
		return;
	}
	if (!existsSync(path)) {
		if (process.env.CI) {
			throw new Error(
				`Missing ${label} baseline; run ` +
					`UPDATE_SHADER_BASELINES=1 bun run test:web and commit it.`,
			);
		}
		writeFileSync(path, actual);
		return;
	}
	expect(
		actual,
		`${label} drifted from its baseline. If the transform change is intentional, ` +
			`refresh with UPDATE_SHADER_BASELINES=1 bun run test:web.`,
	).toBe(readFileSync(path, "utf8"));
};

describe("shadertoy import transform regression", () => {
	// Stage 1: the GLSL wrapping is pure TypeScript, so it runs everywhere (no naga
	// needed) and guards regressions in the scaffold/preamble against a real shader.
	test("wrapGlsl output for the imported shader matches its baseline", () => {
		expectMatchesBaseline(WRAPPED_BASELINE, wrapGlsl(userGlsl), "wrapped GLSL");
	});

	// Stage 2: the full GLSL→WGSL transform needs the pinned `naga` CLI. We snapshot
	// the real adapted WGSL and fail on drift ONLY when the local naga-cli matches
	// PINNED_NAGA_VERSION; on any other (or absent) naga we skip rather than emit a
	// version-driven false positive. Note CI does NOT install naga (see ci.yml), so
	// this stage is skipped in the gate — stage 1 is what CI actually exercises here.
	test("full transform WGSL for the imported shader matches its baseline", async (ctx) => {
		if ((await nagaVersion()) !== PINNED_NAGA_VERSION) {
			ctx.skip();
			return;
		}
		const result = await transformShadertoyGlsl(userGlsl);
		expect(
			result.ok,
			result.ok ? "" : `transform failed: ${result.error}`,
		).toBe(true);
		if (!result.ok) return;
		expectMatchesBaseline(WGSL_BASELINE, result.wgsl, "adapted WGSL");
	});
});
