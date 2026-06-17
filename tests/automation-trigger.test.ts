import { describe, expect, test } from "vitest";
import {
	matchMidiNote,
	matchMidiCc,
	matchOscAddress,
	resolveAction,
	type AutomationTriggerBinding,
} from "../automation-trigger.ts";

// ---------------------------------------------------------------------------
// matchMidiNote
// ---------------------------------------------------------------------------

describe("matchMidiNote", () => {
	test("returns action when note and channel match exactly", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-note", note: 60, channel: 1, action: "play" },
		];
		expect(matchMidiNote(60, 1, bindings)).toBe("play");
	});

	test("omni channel (0) matches any incoming channel", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-note", note: 60, channel: 0, action: "toggle" },
		];
		expect(matchMidiNote(60, 7, bindings)).toBe("toggle");
		expect(matchMidiNote(60, 16, bindings)).toBe("toggle");
	});

	test("returns null for wrong note number", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-note", note: 60, channel: 0, action: "play" },
		];
		expect(matchMidiNote(61, 1, bindings)).toBeNull();
		expect(matchMidiNote(0, 1, bindings)).toBeNull();
		expect(matchMidiNote(127, 1, bindings)).toBeNull();
	});

	test("returns null when channel does not match a specific binding channel", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-note", note: 60, channel: 2, action: "play" },
		];
		expect(matchMidiNote(60, 1, bindings)).toBeNull();
		expect(matchMidiNote(60, 3, bindings)).toBeNull();
	});

	test("returns action of the first matching binding (priority by order)", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-note", note: 60, channel: 0, action: "play" },
			{ type: "midi-note", note: 60, channel: 0, action: "stop" },
		];
		expect(matchMidiNote(60, 1, bindings)).toBe("play");
	});

	test("skips non-midi-note bindings", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "osc", address: "/trigger", action: "play" },
			{ type: "midi-cc", cc: 60, channel: 0, threshold: 0, action: "play" },
			{ type: "midi-note", note: 60, channel: 0, action: "toggle-loop" },
		];
		expect(matchMidiNote(60, 1, bindings)).toBe("toggle-loop");
	});

	test("returns null for empty bindings", () => {
		expect(matchMidiNote(60, 1, [])).toBeNull();
	});

	test("note 0 and note 127 are valid binding targets", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-note", note: 0, channel: 0, action: "play" },
			{ type: "midi-note", note: 127, channel: 0, action: "stop" },
		];
		expect(matchMidiNote(0, 1, bindings)).toBe("play");
		expect(matchMidiNote(127, 1, bindings)).toBe("stop");
	});
});

// ---------------------------------------------------------------------------
// matchMidiCc
// ---------------------------------------------------------------------------

describe("matchMidiCc", () => {
	test("returns action when CC, channel, and value meets threshold", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-cc", cc: 64, channel: 0, threshold: 64, action: "play" },
		];
		expect(matchMidiCc(64, 1, 64, bindings)).toBe("play");
		expect(matchMidiCc(64, 1, 127, bindings)).toBe("play");
	});

	test("returns null when value is below threshold", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-cc", cc: 64, channel: 0, threshold: 64, action: "play" },
		];
		expect(matchMidiCc(64, 1, 63, bindings)).toBeNull();
		expect(matchMidiCc(64, 1, 0, bindings)).toBeNull();
	});

	test("matches value at exact threshold boundary", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-cc", cc: 64, channel: 0, threshold: 64, action: "stop" },
		];
		expect(matchMidiCc(64, 1, 64, bindings)).toBe("stop");
	});

	test("threshold of 0 fires on any non-negative value", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-cc", cc: 1, channel: 0, threshold: 0, action: "toggle" },
		];
		expect(matchMidiCc(1, 1, 0, bindings)).toBe("toggle");
		expect(matchMidiCc(1, 1, 127, bindings)).toBe("toggle");
	});

	test("omni channel (0) matches any incoming channel", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-cc", cc: 64, channel: 0, threshold: 0, action: "toggle" },
		];
		expect(matchMidiCc(64, 5, 1, bindings)).toBe("toggle");
		expect(matchMidiCc(64, 16, 1, bindings)).toBe("toggle");
	});

	test("specific channel only matches that channel", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-cc", cc: 64, channel: 3, threshold: 0, action: "play" },
		];
		expect(matchMidiCc(64, 3, 64, bindings)).toBe("play");
		expect(matchMidiCc(64, 2, 64, bindings)).toBeNull();
	});

	test("returns null for wrong CC number", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-cc", cc: 64, channel: 0, threshold: 0, action: "play" },
		];
		expect(matchMidiCc(65, 1, 127, bindings)).toBeNull();
	});

	test("skips non-midi-cc bindings", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-note", note: 64, channel: 0, action: "play" },
			{
				type: "midi-cc",
				cc: 64,
				channel: 0,
				threshold: 0,
				action: "play-loop",
			},
		];
		expect(matchMidiCc(64, 1, 64, bindings)).toBe("play-loop");
	});

	test("returns null for empty bindings", () => {
		expect(matchMidiCc(64, 1, 127, [])).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// matchOscAddress
// ---------------------------------------------------------------------------

describe("matchOscAddress", () => {
	test("returns action for exact address match", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "osc", address: "/my/trigger/play", action: "play-loop" },
		];
		expect(matchOscAddress("/my/trigger/play", bindings)).toBe("play-loop");
	});

	test("returns null for non-matching address", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "osc", address: "/my/trigger/play", action: "play" },
		];
		expect(matchOscAddress("/other/address", bindings)).toBeNull();
		expect(matchOscAddress("/my/trigger/play/extra", bindings)).toBeNull();
	});

	test("address match is exact — no prefix matching", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "osc", address: "/trigger", action: "play" },
		];
		expect(matchOscAddress("/trigger/sub", bindings)).toBeNull();
	});

	test("skips non-osc bindings", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "midi-note", note: 60, channel: 0, action: "play" },
			{ type: "midi-cc", cc: 1, channel: 0, threshold: 0, action: "play" },
			{ type: "osc", address: "/trigger", action: "stop" },
		];
		expect(matchOscAddress("/trigger", bindings)).toBe("stop");
	});

	test("returns first matching osc binding", () => {
		const bindings: AutomationTriggerBinding[] = [
			{ type: "osc", address: "/trigger", action: "play" },
			{ type: "osc", address: "/trigger", action: "stop" },
		];
		expect(matchOscAddress("/trigger", bindings)).toBe("play");
	});

	test("returns null for empty bindings", () => {
		expect(matchOscAddress("/any", [])).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// resolveAction
// ---------------------------------------------------------------------------

describe("resolveAction", () => {
	test("toggle returns play when not playing", () => {
		expect(resolveAction("toggle", false)).toBe("play");
	});

	test("toggle returns stop when playing", () => {
		expect(resolveAction("toggle", true)).toBe("stop");
	});

	test("toggle-loop returns play-loop when not playing", () => {
		expect(resolveAction("toggle-loop", false)).toBe("play-loop");
	});

	test("toggle-loop returns stop when playing", () => {
		expect(resolveAction("toggle-loop", true)).toBe("stop");
	});

	test("play passes through regardless of play state", () => {
		expect(resolveAction("play", false)).toBe("play");
		expect(resolveAction("play", true)).toBe("play");
	});

	test("play-loop passes through regardless of play state", () => {
		expect(resolveAction("play-loop", false)).toBe("play-loop");
		expect(resolveAction("play-loop", true)).toBe("play-loop");
	});

	test("stop passes through regardless of play state", () => {
		expect(resolveAction("stop", false)).toBe("stop");
		expect(resolveAction("stop", true)).toBe("stop");
	});
});
