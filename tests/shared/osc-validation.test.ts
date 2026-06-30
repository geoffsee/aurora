import { describe, expect, test } from "vitest";
import {
	CONTROL_STATE_SCHEMA_VERSION,
	PRESET_MORPH_ADDRESS,
	validateControlStateVersion,
	validateLiveOscMsg,
	validatePresetMorphOscMsg,
	validatePresetOscMsg,
	validateVstOscMsg,
} from "../../shared/osc-validation.ts";

const CUE_NAMES: ReadonlySet<string> = new Set([
	"warmup",
	"drop",
	"tunnel",
	"burst",
	"wash",
	"panic",
]);

const floatArg = { type: "f", value: 0.5 };
const stringArg = { type: "s", value: "hello" };

// ── validateLiveOscMsg ────────────────────────────────────────────────────────

describe("validateLiveOscMsg", () => {
	test("accepts /live/ address", () => {
		expect(
			validateLiveOscMsg({ address: "/live/song/get/tempo" }, "test"),
		).toBe(true);
	});

	test("rejects address without /live/ prefix", () => {
		expect(validateLiveOscMsg({ address: "/aurora/something" }, "test")).toBe(
			false,
		);
	});

	test("rejects empty address", () => {
		expect(validateLiveOscMsg({ address: "" }, "test")).toBe(false);
	});
});

// ── validateVstOscMsg — control branch ───────────────────────────────────────

describe("validateVstOscMsg control branch", () => {
	test("accepts known control with float arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/control/crossfade", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("accepts known control with plain number arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/control/bpm", args: [120] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("rejects unknown control name", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/control/unknown_param", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects control with zero args", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/control/crossfade", args: [] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects control with too many args", () => {
		expect(
			validateVstOscMsg(
				{
					address: "/aurora/vst/control/crossfade",
					args: [floatArg, floatArg],
				},
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects control with non-numeric arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/control/crossfade", args: [stringArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});
});

// ── validateVstOscMsg — trigger branch ───────────────────────────────────────

describe("validateVstOscMsg trigger branch", () => {
	test("accepts flash trigger", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/trigger/flash", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("accepts reset trigger", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/trigger/reset", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("rejects unknown trigger name", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/trigger/unknown", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects trigger with wrong arg count", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/trigger/flash", args: [] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects trigger with non-numeric arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/trigger/flash", args: [stringArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});
});

// ── validateVstOscMsg — cue branch ───────────────────────────────────────────

describe("validateVstOscMsg cue branch", () => {
	test("accepts known cue with float arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/cue/drop", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("rejects unknown cue name", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/cue/unknown_cue", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects cue with zero args", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/cue/drop", args: [] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects cue with non-numeric arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/aurora/vst/cue/drop", args: [stringArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});
});

// ── validatePresetOscMsg ──────────────────────────────────────────────────────

describe("validatePresetOscMsg", () => {
	test("accepts valid recall address for slot 1", () => {
		expect(
			validatePresetOscMsg({ address: "/aurora/preset/recall/1" }, "test"),
		).toBe(true);
	});

	test("accepts valid recall address for slot 6", () => {
		expect(
			validatePresetOscMsg({ address: "/aurora/preset/recall/6" }, "test"),
		).toBe(true);
	});

	test("accepts valid save address", () => {
		expect(
			validatePresetOscMsg({ address: "/aurora/preset/save/3" }, "test"),
		).toBe(true);
	});

	test("rejects slot 0 (below min)", () => {
		expect(
			validatePresetOscMsg({ address: "/aurora/preset/recall/0" }, "test"),
		).toBe(false);
	});

	test("rejects slot 7 (above max)", () => {
		expect(
			validatePresetOscMsg({ address: "/aurora/preset/save/7" }, "test"),
		).toBe(false);
	});

	test("rejects non-integer slot", () => {
		expect(
			validatePresetOscMsg({ address: "/aurora/preset/recall/foo" }, "test"),
		).toBe(false);
	});

	test("rejects fractional slot", () => {
		expect(
			validatePresetOscMsg({ address: "/aurora/preset/recall/1.5" }, "test"),
		).toBe(false);
	});

	test("rejects unrelated aurora address", () => {
		expect(
			validatePresetOscMsg({ address: "/aurora/control/state" }, "test"),
		).toBe(false);
	});

	test("rejects empty address", () => {
		expect(validatePresetOscMsg({ address: "" }, "test")).toBe(false);
	});
});

// ── validatePresetMorphOscMsg ────────────────────────────────────────────────

describe("validatePresetMorphOscMsg", () => {
	test("accepts from/to/position", () => {
		expect(
			validatePresetMorphOscMsg(
				{
					address: PRESET_MORPH_ADDRESS,
					args: [
						{ type: "s", value: "warmup" },
						{ type: "s", value: "drop" },
						floatArg,
					],
				},
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("accepts optional curve arg", () => {
		expect(
			validatePresetMorphOscMsg(
				{
					address: PRESET_MORPH_ADDRESS,
					args: [
						{ type: "s", value: "warmup" },
						{ type: "s", value: "drop" },
						floatArg,
						{ type: "s", value: "ease" },
					],
				},
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("accepts plain string/number args", () => {
		expect(
			validatePresetMorphOscMsg(
				{ address: PRESET_MORPH_ADDRESS, args: ["warmup", "drop", 0.5] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("rejects wrong address", () => {
		expect(
			validatePresetMorphOscMsg(
				{ address: "/aurora/preset/recall/1", args: ["warmup", "drop", 0.5] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects too few args", () => {
		expect(
			validatePresetMorphOscMsg(
				{ address: PRESET_MORPH_ADDRESS, args: ["warmup", "drop"] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects too many args", () => {
		expect(
			validatePresetMorphOscMsg(
				{
					address: PRESET_MORPH_ADDRESS,
					args: ["warmup", "drop", 0.5, "ease", "extra"],
				},
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects unknown cue name", () => {
		expect(
			validatePresetMorphOscMsg(
				{ address: PRESET_MORPH_ADDRESS, args: ["warmup", "nope", 0.5] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects non-string from/to", () => {
		expect(
			validatePresetMorphOscMsg(
				{ address: PRESET_MORPH_ADDRESS, args: [floatArg, floatArg, 0.5] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects non-numeric position", () => {
		expect(
			validatePresetMorphOscMsg(
				{
					address: PRESET_MORPH_ADDRESS,
					args: ["warmup", "drop", { type: "s", value: "half" }],
				},
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});
});

// ── validateControlStateVersion ──────────────────────────────────────────────

describe("validateControlStateVersion", () => {
	test("accepts state with matching schemaVersion", () => {
		expect(
			validateControlStateVersion(
				{ schemaVersion: CONTROL_STATE_SCHEMA_VERSION, crossfade: 0.5 },
				"test",
			),
		).toBe(true);
	});

	test("rejects state with a different version number", () => {
		expect(
			validateControlStateVersion(
				{ schemaVersion: CONTROL_STATE_SCHEMA_VERSION + 1, crossfade: 0.5 },
				"test",
			),
		).toBe(false);
	});

	test("rejects state missing schemaVersion", () => {
		expect(validateControlStateVersion({ crossfade: 0.5 }, "test")).toBe(false);
	});

	test("rejects null state", () => {
		expect(validateControlStateVersion(null, "test")).toBe(false);
	});

	test("rejects non-object state", () => {
		expect(validateControlStateVersion("not-an-object", "test")).toBe(false);
	});

	test("rejects state with schemaVersion set to zero", () => {
		expect(validateControlStateVersion({ schemaVersion: 0 }, "test")).toBe(
			false,
		);
	});
});

// ── validateVstOscMsg — unrecognised prefix ───────────────────────────────────

describe("validateVstOscMsg unrecognised prefix", () => {
	test("rejects completely unknown address", () => {
		expect(
			validateVstOscMsg(
				{ address: "/unknown/path", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects /live/ address", () => {
		expect(
			validateVstOscMsg(
				{ address: "/live/song/get/tempo", args: [] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});
});
