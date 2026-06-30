import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import contract from "../../shared/vst-osc-contract.json" with { type: "json" };

const VST_LIB_PATH = join(
	__dirname,
	"..",
	"..",
	"plugins",
	"aurora-vst",
	"src",
	"lib.rs",
);
const vstSource = readFileSync(VST_LIB_PATH, "utf8");

const extractCallArgs = (fnName: string): string[] => {
	// Matches `fnName("literal"` — captures the first string-literal argument at
	// each call site. The function definition (`fn fnName(&self, name: &str, ...)`)
	// has no string-literal arg so it's naturally excluded.
	const re = new RegExp(`\\b${fnName}\\s*\\(\\s*"([^"]+)"`, "g");
	const out: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(vstSource)) !== null) {
		const captured = m[1];
		if (captured !== undefined) out.push(captured);
	}
	return out;
};

const sortedUnique = (items: readonly string[]): string[] =>
	[...new Set(items)].sort();

describe("VST OSC contract", () => {
	test("vstEmitted is a subset of bridgeAccepts for each kind", () => {
		const checkSubset = (
			emitted: readonly string[],
			accepted: readonly string[],
		) => {
			const acceptSet = new Set(accepted);
			for (const name of emitted) {
				expect(acceptSet.has(name)).toBe(true);
			}
		};
		checkSubset(contract.controls.vstEmitted, contract.controls.bridgeAccepts);
		checkSubset(contract.triggers.vstEmitted, contract.triggers.bridgeAccepts);
		checkSubset(contract.cues.vstEmitted, contract.cues.bridgeAccepts);
	});

	test("VST source send_f32/i32/bool calls match controls.vstEmitted exactly", () => {
		const emittedControls = sortedUnique([
			...extractCallArgs("send_f32"),
			...extractCallArgs("send_i32"),
			...extractCallArgs("send_bool"),
		]);
		expect(emittedControls).toEqual(sortedUnique(contract.controls.vstEmitted));
	});

	test("VST source send_trigger calls match triggers.vstEmitted exactly", () => {
		const emittedTriggers = sortedUnique(extractCallArgs("send_trigger"));
		expect(emittedTriggers).toEqual(sortedUnique(contract.triggers.vstEmitted));
	});

	test("VST source send_cue calls match cues.vstEmitted exactly", () => {
		const emittedCues = sortedUnique(extractCallArgs("send_cue"));
		expect(emittedCues).toEqual(sortedUnique(contract.cues.vstEmitted));
	});

	test("contract files are kept in sync at module load", async () => {
		// Importing osc-validation.ts runs the runtime assertSubset checks. If they
		// fail, the import itself throws. This test confirms the module loads.
		const mod = await import("../../shared/osc-validation.ts");
		expect(mod.VST_CONTROL_NAMES.size).toBe(
			contract.controls.bridgeAccepts.length,
		);
		expect(mod.VST_TRIGGER_NAMES.size).toBe(
			contract.triggers.bridgeAccepts.length,
		);
	});
});
