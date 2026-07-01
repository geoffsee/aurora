import { describe, expect, test } from "vitest";
import { CLOCK_PRIORITY, selectTempoSource } from "../../bridge/clock-arbiter.ts";

describe("selectTempoSource priority", () => {
	test("Link wins when active, even alongside MIDI clock", () => {
		expect(selectTempoSource({ linkActive: true, midiActive: true })).toBe(
			"link",
		);
		expect(selectTempoSource({ linkActive: true, midiActive: false })).toBe(
			"link",
		);
	});

	test("MIDI clock wins when Link is absent", () => {
		expect(selectTempoSource({ linkActive: false, midiActive: true })).toBe(
			"midi",
		);
	});

	test("internal is the floor when no external source is active", () => {
		expect(selectTempoSource({ linkActive: false, midiActive: false })).toBe(
			"internal",
		);
	});

	test("priority order is Link > MIDI > internal", () => {
		expect(CLOCK_PRIORITY).toEqual(["link", "midi", "internal"]);
	});
});

describe("graceful fallback as higher-priority sources drop", () => {
	test("Link -> MIDI -> internal as each drops out", () => {
		// All active: Link drives.
		expect(selectTempoSource({ linkActive: true, midiActive: true })).toBe(
			"link",
		);
		// Link drops: MIDI takes over with no gap.
		expect(selectTempoSource({ linkActive: false, midiActive: true })).toBe(
			"midi",
		);
		// MIDI drops too: internal is always available as the floor.
		expect(selectTempoSource({ linkActive: false, midiActive: false })).toBe(
			"internal",
		);
	});
});

describe("tempo mirror does not flap when sources disagree", () => {
	// Models the broadcast gating in index.ts: each source only publishes to the
	// mirror when selectTempoSource names it as authoritative. Link and MIDI run
	// concurrently and report different tempos; the mirror must follow exactly one.
	function runMirror(
		activity: { linkActive: boolean; midiActive: boolean },
		ticks: number,
	): number[] {
		const LINK_BPM = 124;
		const MIDI_BPM = 128;
		const INTERNAL_BPM = 120;
		const mirror: number[] = [];
		for (let i = 0; i < ticks; i++) {
			// Every source attempts to publish on every tick, in priority order.
			if (activity.linkActive && selectTempoSource(activity) === "link")
				mirror.push(LINK_BPM);
			if (activity.midiActive && selectTempoSource(activity) === "midi")
				mirror.push(MIDI_BPM);
			if (selectTempoSource(activity) === "internal") mirror.push(INTERNAL_BPM);
		}
		return mirror;
	}

	test("Link active suppresses MIDI so the mirror never flaps to MIDI's tempo", () => {
		const mirror = runMirror({ linkActive: true, midiActive: true }, 50);
		// Only ever Link's tempo — MIDI's 128 never reaches the mirror.
		expect(new Set(mirror)).toEqual(new Set([124]));
	});

	test("MIDI alone holds the mirror steady with no internal flap", () => {
		const mirror = runMirror({ linkActive: false, midiActive: true }, 50);
		expect(new Set(mirror)).toEqual(new Set([128]));
	});

	test("internal holds the mirror when no external clock is present", () => {
		const mirror = runMirror({ linkActive: false, midiActive: false }, 50);
		expect(new Set(mirror)).toEqual(new Set([120]));
	});
});
