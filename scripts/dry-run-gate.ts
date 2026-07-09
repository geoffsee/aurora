// ──────────────────────────────────────────────────────────────────────────
// Dry-run gate semantics (issue #213)
//
// Pure verdict logic for the performer-less dry run, split out from the harness
// (scripts/dry-run.ts) so it carries no Bun/runtime dependency and can be
// unit-asserted (tests/bridge/dry-run-gate.test.ts) without booting a bridge.
// ──────────────────────────────────────────────────────────────────────────

export type Check = {
	name: string;
	ok: boolean;
	required: boolean;
	detail: string;
};

// Gate the accumulated checks into a pass/fail verdict. Under `sustained` the
// standing gate demands ZERO GAP lines, so every failing check — required or
// soft — is a failure; in one-shot mode only the required checks fail the run.
export function evaluateRun(
	checks: Check[],
	sustained: boolean,
): { failures: Check[]; gaps: Check[]; pass: boolean } {
	const failures = checks.filter((c) => !c.ok && (c.required || sustained));
	const gaps = checks.filter((c) => !c.ok);
	return { failures, gaps, pass: failures.length === 0 };
}
