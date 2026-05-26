import { describe, expect, test } from "vitest";
import {
	validateLiveOscMsg,
	validatePresetOscMsg,
	validateVstOscMsg,
} from "../osc-validation.ts";

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
		expect(validateLiveOscMsg({ address: "/bevyosc/something" }, "test")).toBe(
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
				{ address: "/bevyosc/vst/control/crossfade", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("accepts known control with plain number arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/control/bpm", args: [120] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("rejects unknown control name", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/control/unknown_param", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects control with zero args", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/control/crossfade", args: [] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects control with too many args", () => {
		expect(
			validateVstOscMsg(
				{
					address: "/bevyosc/vst/control/crossfade",
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
				{ address: "/bevyosc/vst/control/crossfade", args: [stringArg] },
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
				{ address: "/bevyosc/vst/trigger/flash", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("accepts reset trigger", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/trigger/reset", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("rejects unknown trigger name", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/trigger/unknown", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects trigger with wrong arg count", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/trigger/flash", args: [] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects trigger with non-numeric arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/trigger/flash", args: [stringArg] },
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
				{ address: "/bevyosc/vst/cue/drop", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(true);
	});

	test("rejects unknown cue name", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/cue/unknown_cue", args: [floatArg] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects cue with zero args", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/cue/drop", args: [] },
				"test",
				CUE_NAMES,
			),
		).toBe(false);
	});

	test("rejects cue with non-numeric arg", () => {
		expect(
			validateVstOscMsg(
				{ address: "/bevyosc/vst/cue/drop", args: [stringArg] },
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
			validatePresetOscMsg({ address: "/bevyosc/preset/recall/1" }, "test"),
		).toBe(true);
	});

	test("accepts valid recall address for slot 6", () => {
		expect(
			validatePresetOscMsg({ address: "/bevyosc/preset/recall/6" }, "test"),
		).toBe(true);
	});

	test("accepts valid save address", () => {
		expect(
			validatePresetOscMsg({ address: "/bevyosc/preset/save/3" }, "test"),
		).toBe(true);
	});

	test("rejects slot 0 (below min)", () => {
		expect(
			validatePresetOscMsg({ address: "/bevyosc/preset/recall/0" }, "test"),
		).toBe(false);
	});

	test("rejects slot 7 (above max)", () => {
		expect(
			validatePresetOscMsg({ address: "/bevyosc/preset/save/7" }, "test"),
		).toBe(false);
	});

	test("rejects non-integer slot", () => {
		expect(
			validatePresetOscMsg({ address: "/bevyosc/preset/recall/foo" }, "test"),
		).toBe(false);
	});

	test("rejects fractional slot", () => {
		expect(
			validatePresetOscMsg({ address: "/bevyosc/preset/recall/1.5" }, "test"),
		).toBe(false);
	});

	test("rejects unrelated bevyosc address", () => {
		expect(
			validatePresetOscMsg({ address: "/bevyosc/control/state" }, "test"),
		).toBe(false);
	});

	test("rejects empty address", () => {
		expect(validatePresetOscMsg({ address: "" }, "test")).toBe(false);
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
