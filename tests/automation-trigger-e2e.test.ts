import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeStateLog } from "../state-log.ts";
import { buildRecording } from "../automation-player.ts";
import { CONTROL_STATE_SCHEMA_VERSION } from "../osc-validation.ts";
import {
	DEFAULT_OSC_BINDINGS,
	makeAutomationBridge,
	parseTriggerBindings,
} from "../automation-bridge.ts";

// ---------------------------------------------------------------------------
// parseTriggerBindings
// ---------------------------------------------------------------------------

describe("parseTriggerBindings", () => {
	test("parses valid midi-note binding", () => {
		const bindings = parseTriggerBindings(
			JSON.stringify([
				{ type: "midi-note", note: 60, channel: 1, action: "toggle" },
			]),
		);
		expect(bindings).toHaveLength(1);
		expect(bindings[0]).toMatchObject({
			type: "midi-note",
			note: 60,
			channel: 1,
			action: "toggle",
		});
	});

	test("parses valid midi-cc binding", () => {
		const bindings = parseTriggerBindings(
			JSON.stringify([
				{ type: "midi-cc", cc: 64, channel: 0, threshold: 64, action: "play" },
			]),
		);
		expect(bindings).toHaveLength(1);
		expect(bindings[0]).toMatchObject({
			type: "midi-cc",
			cc: 64,
			channel: 0,
			threshold: 64,
			action: "play",
		});
	});

	test("parses valid osc binding", () => {
		const bindings = parseTriggerBindings(
			JSON.stringify([{ type: "osc", address: "/my/trigger", action: "stop" }]),
		);
		expect(bindings).toHaveLength(1);
		expect(bindings[0]).toMatchObject({
			type: "osc",
			address: "/my/trigger",
			action: "stop",
		});
	});

	test("parses all action types", () => {
		const actions = ["play", "play-loop", "stop", "toggle", "toggle-loop"];
		const raw = actions.map((action) => ({
			type: "osc",
			address: `/${action}`,
			action,
		}));
		const bindings = parseTriggerBindings(JSON.stringify(raw));
		expect(bindings).toHaveLength(5);
	});

	test("filters out bindings with unknown action", () => {
		const bindings = parseTriggerBindings(
			JSON.stringify([{ type: "osc", address: "/x", action: "unknown" }]),
		);
		expect(bindings).toHaveLength(0);
	});

	test("filters out bindings with unknown type", () => {
		const bindings = parseTriggerBindings(
			JSON.stringify([{ type: "nfc", address: "/x", action: "play" }]),
		);
		expect(bindings).toHaveLength(0);
	});

	test("filters out midi-note bindings missing required fields", () => {
		const bindings = parseTriggerBindings(
			JSON.stringify([{ type: "midi-note", action: "play" }]),
		);
		expect(bindings).toHaveLength(0);
	});

	test("returns [] for invalid JSON", () => {
		expect(parseTriggerBindings("not json")).toHaveLength(0);
	});

	test("returns [] for non-array JSON", () => {
		expect(parseTriggerBindings('{"type":"osc"}')).toHaveLength(0);
	});

	test("mixes valid and invalid bindings — only valid ones kept", () => {
		const bindings = parseTriggerBindings(
			JSON.stringify([
				{ type: "midi-note", note: 60, channel: 0, action: "play" },
				{ type: "oops", action: "play" },
				{ type: "osc", address: "/trigger", action: "stop" },
			]),
		);
		expect(bindings).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// DEFAULT_OSC_BINDINGS
// ---------------------------------------------------------------------------

describe("DEFAULT_OSC_BINDINGS", () => {
	test("covers the five canonical automation addresses", () => {
		const addresses = new Set(
			DEFAULT_OSC_BINDINGS.filter((b) => b.type === "osc").map(
				(b) => (b as { address: string }).address,
			),
		);
		for (const addr of [
			"/bevyosc/automation/play",
			"/bevyosc/automation/play-loop",
			"/bevyosc/automation/stop",
			"/bevyosc/automation/toggle",
			"/bevyosc/automation/toggle-loop",
		]) {
			expect(addresses.has(addr)).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// makeAutomationBridge — unit tests
// ---------------------------------------------------------------------------

describe("makeAutomationBridge", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function makeRecordedEntries() {
		vi.setSystemTime(0);
		const log = makeStateLog(20);
		const s0 = { crossfade: 0.3 };
		log.record(null, s0 as Record<string, unknown>);
		vi.setSystemTime(500);
		const s1 = { crossfade: 0.7 };
		log.record(s0 as Record<string, unknown>, s1 as Record<string, unknown>);
		vi.setSystemTime(1000);
		const s2 = { crossfade: 0.9, palette: 0.5 };
		log.record(s1 as Record<string, unknown>, s2 as Record<string, unknown>);
		return log;
	}

	test("onMidiNote with matching binding starts playback and returns true", () => {
		const log = makeRecordedEntries();
		const applied: Record<string, unknown>[] = [];
		const bridge = makeAutomationBridge(
			(d) => applied.push({ ...d }),
			[{ type: "midi-note", note: 60, channel: 0, action: "toggle" }],
			() => log.toArray(),
		);

		const fired = bridge.onMidiNote(60, 1);
		expect(fired).toBe(true);
		expect(bridge.player.isActive()).toBe(true);
		expect(applied.at(-1)).toMatchObject({ replaying: true });
	});

	test("onMidiNote with non-matching note returns false and leaves player idle", () => {
		const log = makeRecordedEntries();
		const bridge = makeAutomationBridge(
			() => {},
			[{ type: "midi-note", note: 60, channel: 0, action: "toggle" }],
			() => log.toArray(),
		);

		expect(bridge.onMidiNote(61, 1)).toBe(false);
		expect(bridge.player.isActive()).toBe(false);
	});

	test("onMidiCc above threshold starts playback", () => {
		const log = makeRecordedEntries();
		const applied: Record<string, unknown>[] = [];
		const bridge = makeAutomationBridge(
			(d) => applied.push({ ...d }),
			[{ type: "midi-cc", cc: 64, channel: 0, threshold: 64, action: "play" }],
			() => log.toArray(),
		);

		expect(bridge.onMidiCc(64, 1, 64)).toBe(true);
		expect(bridge.player.isActive()).toBe(true);
	});

	test("onMidiCc below threshold does not fire", () => {
		const log = makeRecordedEntries();
		const bridge = makeAutomationBridge(
			() => {},
			[{ type: "midi-cc", cc: 64, channel: 0, threshold: 64, action: "play" }],
			() => log.toArray(),
		);

		expect(bridge.onMidiCc(64, 1, 63)).toBe(false);
		expect(bridge.player.isActive()).toBe(false);
	});

	test("onOscAddress with default /bevyosc/automation/toggle starts then stops playback", () => {
		const log = makeRecordedEntries();
		const applied: Record<string, unknown>[] = [];
		const bridge = makeAutomationBridge(
			(d) => applied.push({ ...d }),
			[],
			() => log.toArray(),
		);

		// First trigger: toggle → play
		bridge.onOscAddress("/bevyosc/automation/toggle");
		expect(bridge.player.isActive()).toBe(true);

		// Second trigger: toggle → stop
		bridge.onOscAddress("/bevyosc/automation/toggle");
		expect(bridge.player.isActive()).toBe(false);
		expect(applied.at(-1)).toMatchObject({ replaying: false });
	});

	test("onOscAddress with /bevyosc/automation/play always starts (even if active)", () => {
		const log = makeRecordedEntries();
		const bridge = makeAutomationBridge(
			() => {},
			[],
			() => log.toArray(),
		);

		bridge.onOscAddress("/bevyosc/automation/play");
		expect(bridge.player.isActive()).toBe(true);

		// Play again while active — should restart (play is not a toggle)
		bridge.onOscAddress("/bevyosc/automation/play");
		expect(bridge.player.isActive()).toBe(true);
	});

	test("onOscAddress with /bevyosc/automation/stop stops active playback", () => {
		const log = makeRecordedEntries();
		const applied: Record<string, unknown>[] = [];
		const bridge = makeAutomationBridge(
			(d) => applied.push({ ...d }),
			[],
			() => log.toArray(),
		);

		bridge.onOscAddress("/bevyosc/automation/play");
		expect(bridge.player.isActive()).toBe(true);

		bridge.onOscAddress("/bevyosc/automation/stop");
		expect(bridge.player.isActive()).toBe(false);
	});

	test("onOscAddress returns false for unrecognised address", () => {
		const bridge = makeAutomationBridge(
			() => {},
			[],
			() => [],
		);
		expect(bridge.onOscAddress("/unrelated/address")).toBe(false);
	});

	test("extra bindings are consulted after default OSC bindings", () => {
		const log = makeRecordedEntries();
		const bridge = makeAutomationBridge(
			() => {},
			[{ type: "osc", address: "/custom/play", action: "play" }],
			() => log.toArray(),
		);

		expect(bridge.onOscAddress("/custom/play")).toBe(true);
		expect(bridge.player.isActive()).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// E2E: record → MIDI trigger → playback → stop (issue #87 acceptance criteria)
// ---------------------------------------------------------------------------

describe("automation trigger E2E via MIDI note", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("MIDI note-on triggers full playback sequence end-to-end", () => {
		vi.setSystemTime(0);

		// --- record phase ---
		const log = makeStateLog(50);
		const s0 = { crossfade: 0.2, intensity: 0.6 };
		log.record(null, s0 as Record<string, unknown>);

		vi.setSystemTime(400);
		const s1 = { crossfade: 0.2, intensity: 0.8 };
		log.record(s0 as Record<string, unknown>, s1 as Record<string, unknown>);

		vi.setSystemTime(800);
		const s2 = { crossfade: 0.6, intensity: 0.8 };
		log.record(s1 as Record<string, unknown>, s2 as Record<string, unknown>);

		// Verify the recording will have the expected frames
		const previewRecording = buildRecording(
			log.toArray(),
			CONTROL_STATE_SCHEMA_VERSION,
		);
		expect(previewRecording.durationMs).toBe(800);
		expect(previewRecording.frames).toHaveLength(3);

		// --- set up bridge with MIDI note binding ---
		const applied: Record<string, unknown>[] = [];
		const bridge = makeAutomationBridge(
			(diff) => applied.push({ ...diff }),
			[{ type: "midi-note", note: 48, channel: 1, action: "toggle" }],
			() => log.toArray(),
		);

		// --- trigger playback via MIDI note-on (note 48, ch 1) ---
		vi.setSystemTime(0);
		const triggered = bridge.onMidiNote(48, 1);
		expect(triggered).toBe(true);
		expect(bridge.player.isActive()).toBe(true);
		expect(applied[0]).toMatchObject({ replaying: true });

		// --- advance time through the full recording ---
		const TICK_MS = 16;
		vi.advanceTimersByTime(previewRecording.durationMs + TICK_MS * 3);

		// Player stops automatically after the recording ends
		expect(bridge.player.isActive()).toBe(false);
		expect(applied.at(-1)).toMatchObject({ replaying: false });

		// All three data frames applied
		const dataFrames = applied.filter((d) =>
			Object.keys(d).some((k) => k !== "replaying"),
		);
		expect(dataFrames.length).toBeGreaterThanOrEqual(3);
		expect(dataFrames[0]).toMatchObject({ crossfade: 0.2, intensity: 0.6 });
		expect(dataFrames[1]).toMatchObject({ intensity: 0.8 });
		expect(dataFrames[2]).toMatchObject({ crossfade: 0.6 });
	});

	test("MIDI CC trigger starts and stops playback on threshold crossing", () => {
		vi.setSystemTime(0);

		const log = makeStateLog(20);
		log.record(null, { palette: 0.5 } as Record<string, unknown>);
		vi.setSystemTime(300);
		log.record(
			{ palette: 0.5 } as Record<string, unknown>,
			{ palette: 0.8 } as Record<string, unknown>,
		);

		const applied: Record<string, unknown>[] = [];
		const bridge = makeAutomationBridge(
			(diff) => applied.push({ ...diff }),
			[
				{
					type: "midi-cc",
					cc: 80,
					channel: 0,
					threshold: 64,
					action: "toggle-loop",
				},
			],
			() => log.toArray(),
		);

		// Value at threshold → starts play-loop
		bridge.onMidiCc(80, 1, 64);
		expect(bridge.player.isActive()).toBe(true);

		// Value below threshold → no action
		bridge.onMidiCc(80, 1, 63);
		expect(bridge.player.isActive()).toBe(true);

		// Value at threshold again → toggle to stop
		bridge.onMidiCc(80, 1, 127);
		expect(bridge.player.isActive()).toBe(false);
	});

	test("OSC trigger replays recorded sequence end-to-end", () => {
		vi.setSystemTime(0);

		const log = makeStateLog(20);
		const frames = [
			{ ts: 0, state: { depth: 0.1 } },
			{ ts: 200, state: { depth: 0.4 } },
			{ ts: 600, state: { depth: 0.9 } },
		];

		let prev: Record<string, unknown> | null = null;
		for (const { ts, state } of frames) {
			vi.setSystemTime(ts);
			log.record(prev, state as Record<string, unknown>);
			prev = state as Record<string, unknown>;
		}

		const applied: Record<string, unknown>[] = [];
		const bridge = makeAutomationBridge(
			(diff) => applied.push({ ...diff }),
			[],
			() => log.toArray(),
		);

		vi.setSystemTime(0);
		bridge.onOscAddress("/bevyosc/automation/play");
		expect(bridge.player.isActive()).toBe(true);

		const recording = buildRecording(
			log.toArray(),
			CONTROL_STATE_SCHEMA_VERSION,
		);
		vi.advanceTimersByTime(recording.durationMs + 16 * 3);

		const dataFrames = applied.filter((d) =>
			Object.keys(d).some((k) => k !== "replaying"),
		);
		expect(dataFrames.length).toBeGreaterThanOrEqual(3);
		expect(dataFrames[0]).toMatchObject({ depth: 0.1 });
		expect(dataFrames.at(-1)).toMatchObject({ depth: 0.9 });

		// Manually stop — verifies stop works regardless of how playback ended
		bridge.onOscAddress("/bevyosc/automation/stop");
		expect(bridge.player.isActive()).toBe(false);
	});
});
