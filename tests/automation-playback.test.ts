import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeStateLog } from "../state-log.ts";
import {
	RECORDING_EXCLUDED_FIELDS,
	buildRecording,
	makeAutomationPlayer,
} from "../automation-player.ts";
import { CONTROL_STATE_SCHEMA_VERSION } from "../osc-validation.ts";

// Player tick interval — frames are applied at most this many ms late.
const TICK_MS = 16;

// Strip pure { replaying: ... } lifecycle frames so comparisons focus on data.
function dataFrames(
	applied: Record<string, unknown>[],
): Record<string, unknown>[] {
	return applied.filter((d) => Object.keys(d).some((k) => k !== "replaying"));
}

// ---------------------------------------------------------------------------
// buildRecording unit tests
// ---------------------------------------------------------------------------

describe("buildRecording", () => {
	test("empty entries produce a zero-frame recording", () => {
		const rec = buildRecording([], CONTROL_STATE_SCHEMA_VERSION);
		expect(rec.formatVersion).toBe(1);
		expect(rec.controlStateSchemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
		expect(rec.durationMs).toBe(0);
		expect(rec.frames).toHaveLength(0);
	});

	test("timestamps are zero-based relative to the first entry", () => {
		const entries = [
			{ ts: 5000, diff: { crossfade: 0.3 } },
			{ ts: 6200, diff: { palette: 0.7 } },
		];
		const rec = buildRecording(entries, CONTROL_STATE_SCHEMA_VERSION);
		expect(rec.frames[0]!.tMs).toBe(0);
		expect(rec.frames[1]!.tMs).toBe(1200);
		expect(rec.durationMs).toBe(1200);
		expect(rec.capturedAt).toBe(5000);
	});

	test("excluded fields are stripped from frame diffs", () => {
		const entries = [
			{
				ts: 0,
				diff: {
					crossfade: 0.5,
					schemaVersion: 1,
					replaying: false,
					flashVersion: 3,
					resetVersion: 1,
					cueVersion: 2,
					strobeLockout: true,
				},
			},
		];
		const rec = buildRecording(entries, CONTROL_STATE_SCHEMA_VERSION);
		expect(rec.frames).toHaveLength(1);
		expect(rec.frames[0]!.diff).toEqual({ crossfade: 0.5 });
	});

	test("entry whose diff is entirely excluded fields produces no frame", () => {
		const entries = [
			{ ts: 0, diff: { schemaVersion: 1, replaying: true } },
			{ ts: 500, diff: { crossfade: 0.3 } },
		];
		const rec = buildRecording(entries, CONTROL_STATE_SCHEMA_VERSION);
		expect(rec.frames).toHaveLength(1);
		expect(rec.frames[0]!.diff).toEqual({ crossfade: 0.3 });
	});

	test("RECORDING_EXCLUDED_FIELDS contains the six volatile keys", () => {
		for (const key of [
			"schemaVersion",
			"replaying",
			"flashVersion",
			"resetVersion",
			"cueVersion",
			"strobeLockout",
		]) {
			expect(RECORDING_EXCLUDED_FIELDS.has(key)).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// makeAutomationPlayer unit tests
// ---------------------------------------------------------------------------

describe("makeAutomationPlayer", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("play() emits replaying:true and stop emits replaying:false", () => {
		const applied: Record<string, unknown>[] = [];
		const player = makeAutomationPlayer((d) => applied.push({ ...d }));
		const rec = buildRecording(
			[{ ts: 0, diff: { crossfade: 0.5 } }],
			CONTROL_STATE_SCHEMA_VERSION,
		);

		player.load(rec);
		player.play({ loop: false });
		expect(applied[0]).toEqual({ replaying: true });

		vi.advanceTimersByTime(TICK_MS * 3);

		expect(applied[applied.length - 1]).toEqual({ replaying: false });
	});

	test("isActive() reflects play/stop state", () => {
		const player = makeAutomationPlayer(() => {});
		const rec = buildRecording(
			[{ ts: 0, diff: { crossfade: 0.5 } }],
			CONTROL_STATE_SCHEMA_VERSION,
		);

		player.load(rec);
		expect(player.isActive()).toBe(false);

		player.play({ loop: false });
		expect(player.isActive()).toBe(true);

		vi.advanceTimersByTime(TICK_MS * 3);
		expect(player.isActive()).toBe(false);
	});

	test("stop() halts mid-sequence and does not apply remaining frames", () => {
		const applied: Record<string, unknown>[] = [];
		const player = makeAutomationPlayer((d) => applied.push({ ...d }));
		const rec = buildRecording(
			[
				{ ts: 0, diff: { crossfade: 0.1 } },
				{ ts: 5000, diff: { crossfade: 0.9 } },
			],
			CONTROL_STATE_SCHEMA_VERSION,
		);

		player.load(rec);
		player.play({ loop: false });
		vi.advanceTimersByTime(100);
		player.stop();

		expect(player.isActive()).toBe(false);
		expect(applied[applied.length - 1]).toEqual({ replaying: false });
		expect(applied.some((d) => d["crossfade"] === 0.9)).toBe(false);
	});

	test("positionMs() returns elapsed ms during playback and 0 when stopped", () => {
		vi.setSystemTime(0);
		const player = makeAutomationPlayer(() => {});
		const rec = buildRecording(
			[
				{ ts: 0, diff: { crossfade: 0.5 } },
				{ ts: 2000, diff: { crossfade: 0.8 } },
			],
			CONTROL_STATE_SCHEMA_VERSION,
		);

		player.load(rec);
		expect(player.positionMs()).toBe(0);

		player.play({ loop: false });
		vi.advanceTimersByTime(500);
		expect(player.positionMs()).toBeGreaterThanOrEqual(500);
		expect(player.positionMs()).toBeLessThanOrEqual(520);

		player.stop();
		expect(player.positionMs()).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// E2E round-trip tests (issue #70 acceptance criteria)
// ---------------------------------------------------------------------------

describe("automation recorder E2E round-trip", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("all recorded ControlState diffs are replayed in order", () => {
		vi.setSystemTime(1_000_000);

		// --- record phase ---
		const log = makeStateLog(100);
		const s0 = { crossfade: 0.5, intensity: 0.82 };
		log.record(null, s0 as Record<string, unknown>);

		vi.setSystemTime(1_001_000);
		const s1 = { crossfade: 0.7, intensity: 0.82 };
		log.record(s0 as Record<string, unknown>, s1 as Record<string, unknown>);

		vi.setSystemTime(1_002_000);
		const s2 = { crossfade: 0.7, intensity: 1.0 };
		log.record(s1 as Record<string, unknown>, s2 as Record<string, unknown>);

		const recording = buildRecording(
			log.toArray(),
			CONTROL_STATE_SCHEMA_VERSION,
		);
		expect(recording.durationMs).toBe(2000);
		expect(recording.frames).toHaveLength(3);

		// --- replay phase ---
		const applied: Record<string, unknown>[] = [];
		const player = makeAutomationPlayer((d) => applied.push({ ...d }));

		player.load(recording);
		player.play({ loop: false });
		vi.advanceTimersByTime(recording.durationMs + TICK_MS * 2);

		// --- assert output matches input ---
		const diffs = dataFrames(applied);
		expect(diffs).toHaveLength(3);
		expect(diffs[0]).toMatchObject({ crossfade: 0.5, intensity: 0.82 });
		expect(diffs[1]).toMatchObject({ crossfade: 0.7 });
		expect(diffs[2]).toMatchObject({ intensity: 1.0 });

		// Verify no excluded fields leaked into playback
		for (const d of diffs) {
			for (const key of RECORDING_EXCLUDED_FIELDS) {
				expect(key in d).toBe(false);
			}
		}
	});

	test("playback output matches input within one tick interval (timing tolerance)", () => {
		vi.setSystemTime(0);

		const entries = [
			{ ts: 0, diff: { crossfade: 0.3 } },
			{ ts: 1000, diff: { palette: 0.7 } },
			{ ts: 2500, diff: { intensity: 1.2 } },
		];
		const recording = buildRecording(entries, CONTROL_STATE_SCHEMA_VERSION);

		// Capture the wall-clock time at which each field was applied.
		const capturedAt = new Map<string, number>();
		const player = makeAutomationPlayer((diff) => {
			const now = Date.now();
			for (const key of Object.keys(diff)) {
				if (key !== "replaying") capturedAt.set(key, now);
			}
		});

		player.load(recording);
		// playStartedAt == 0 because setSystemTime(0) above
		player.play({ loop: false });
		vi.advanceTimersByTime(recording.durationMs + TICK_MS * 2);

		// Every expected field must have been applied.
		expect(capturedAt.has("crossfade")).toBe(true);
		expect(capturedAt.has("palette")).toBe(true);
		expect(capturedAt.has("intensity")).toBe(true);

		// Each frame must be applied no earlier than its tMs and no later than
		// tMs + TICK_MS (one setInterval period).
		const cf = capturedAt.get("crossfade")!;
		expect(cf).toBeGreaterThanOrEqual(0);
		expect(cf).toBeLessThanOrEqual(TICK_MS);

		const pal = capturedAt.get("palette")!;
		expect(pal).toBeGreaterThanOrEqual(1000);
		expect(pal).toBeLessThanOrEqual(1000 + TICK_MS);

		const intens = capturedAt.get("intensity")!;
		expect(intens).toBeGreaterThanOrEqual(2500);
		expect(intens).toBeLessThanOrEqual(2500 + TICK_MS);
	});

	test("loop mode replays the full sequence multiple times", () => {
		vi.setSystemTime(0);

		const recording = buildRecording(
			[
				{ ts: 0, diff: { crossfade: 0.1 } },
				{ ts: 500, diff: { crossfade: 0.9 } },
			],
			CONTROL_STATE_SCHEMA_VERSION,
		);
		expect(recording.durationMs).toBe(500);

		const applied: Record<string, unknown>[] = [];
		const player = makeAutomationPlayer((d) => applied.push({ ...d }));

		player.load(recording);
		player.play({ loop: true });
		// Advance past two full loop iterations
		vi.advanceTimersByTime(recording.durationMs * 2 + TICK_MS * 2);
		player.stop();

		const diffs = dataFrames(applied);
		// At least 4 data frames: 2 frames × 2 loops
		expect(diffs.length).toBeGreaterThanOrEqual(4);
		// First frame of each loop must be crossfade: 0.1
		expect(diffs[0]).toMatchObject({ crossfade: 0.1 });
		expect(diffs[2]).toMatchObject({ crossfade: 0.1 });
	});

	test("no-change frames are not recorded (ring buffer deduplication)", () => {
		vi.setSystemTime(0);

		const log = makeStateLog(10);
		const state = { crossfade: 0.5, bpm: 124 };
		log.record(null, state as Record<string, unknown>);
		// Identical re-record must not produce a new entry
		log.record(
			state as Record<string, unknown>,
			{ ...state } as Record<string, unknown>,
		);
		log.record(
			state as Record<string, unknown>,
			{ ...state } as Record<string, unknown>,
		);
		expect(log.size).toBe(1);

		const recording = buildRecording(
			log.toArray(),
			CONTROL_STATE_SCHEMA_VERSION,
		);
		expect(recording.frames).toHaveLength(1);

		const applied: Record<string, unknown>[] = [];
		const player = makeAutomationPlayer((d) => applied.push({ ...d }));
		player.load(recording);
		player.play({ loop: false });
		vi.advanceTimersByTime(TICK_MS * 3);

		expect(dataFrames(applied)).toHaveLength(1);
	});
});
