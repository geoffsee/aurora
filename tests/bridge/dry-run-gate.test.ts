import { describe, expect, test } from "vitest";
import { type Check, evaluateRun } from "../../scripts/dry-run-gate.ts";

// ──────────────────────────────────────────────────────────────────────────
// The standing dry-run gate (#213) turns the performer-less run from a one-shot
// forcing function into a pass/fail gate. Its graduation bar is "zero GAP lines
// over a sustained run", which lives entirely in evaluateRun: under sustain a
// soft gap must fail the run, in one-shot mode it must not. This asserts that
// verdict logic so the gate can never silently soften back into a logger.
// ──────────────────────────────────────────────────────────────────────────

const check = (over: Partial<Check> & Pick<Check, "name">): Check => ({
	ok: true,
	required: false,
	detail: "",
	...over,
});

describe("dry-run gate (#213)", () => {
	test("all checks passing → pass in both modes", () => {
		const checks = [
			check({ name: "required_ok", required: true }),
			check({ name: "soft_ok", required: false }),
		];
		expect(evaluateRun(checks, false).pass).toBe(true);
		expect(evaluateRun(checks, true).pass).toBe(true);
	});

	test("a failing required check fails in either mode", () => {
		const checks = [check({ name: "req", required: true, ok: false })];
		expect(evaluateRun(checks, false).pass).toBe(false);
		expect(evaluateRun(checks, true).pass).toBe(false);
	});

	test("a soft gap is tolerated one-shot but fails the sustained gate", () => {
		const checks = [
			check({ name: "required_ok", required: true }),
			check({ name: "soft_gap", required: false, ok: false }),
		];
		// One-shot: the first run is expected to surface soft gaps without failing.
		const oneShot = evaluateRun(checks, false);
		expect(oneShot.pass).toBe(true);
		expect(oneShot.gaps.map((c) => c.name)).toEqual(["soft_gap"]);
		expect(oneShot.failures).toHaveLength(0);

		// Sustained: zero GAP lines is the pass condition, so the same gap fails.
		const sustained = evaluateRun(checks, true);
		expect(sustained.pass).toBe(false);
		expect(sustained.failures.map((c) => c.name)).toEqual(["soft_gap"]);
	});

	test("gaps lists every failing check regardless of mode", () => {
		const checks = [
			check({ name: "req_fail", required: true, ok: false }),
			check({ name: "soft_fail", required: false, ok: false }),
			check({ name: "ok", required: false, ok: true }),
		];
		for (const sustained of [false, true]) {
			expect(evaluateRun(checks, sustained).gaps.map((c) => c.name)).toEqual([
				"req_fail",
				"soft_fail",
			]);
		}
	});
});
