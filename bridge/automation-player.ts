import type { StateLogEntry } from "./state-log.ts";

export type AutomationFrame = {
	tMs: number;
	diff: Record<string, unknown>;
};

export type AutomationRecording = {
	formatVersion: 1;
	controlStateSchemaVersion: number;
	capturedAt: number;
	durationMs: number;
	frames: AutomationFrame[];
};

// Volatile/edge-trigger fields excluded from recordings per spike #57.
// strobeLockout is a safety interlock and must never be automated.
export const RECORDING_EXCLUDED_FIELDS: ReadonlySet<string> = new Set([
	"schemaVersion",
	"replaying",
	"flashVersion",
	"resetVersion",
	"cueVersion",
	"strobeLockout",
]);

/**
 * Convert a StateLog entry array into a time-relative AutomationRecording.
 * Timestamps are rebased to zero from the first entry.
 * Entries whose diffs contain only excluded fields produce no frame.
 */
export function buildRecording(
	entries: StateLogEntry[],
	controlStateSchemaVersion: number,
): AutomationRecording {
	if (entries.length === 0) {
		return {
			formatVersion: 1,
			controlStateSchemaVersion,
			capturedAt: Date.now(),
			durationMs: 0,
			frames: [],
		};
	}

	const t0 = entries[0]!.ts;
	const frames: AutomationFrame[] = [];

	for (const entry of entries) {
		const diff: Record<string, unknown> = {};
		let any = false;
		for (const [k, v] of Object.entries(entry.diff)) {
			if (!RECORDING_EXCLUDED_FIELDS.has(k)) {
				diff[k] = v;
				any = true;
			}
		}
		if (any) frames.push({ tMs: entry.ts - t0, diff });
	}

	return {
		formatVersion: 1,
		controlStateSchemaVersion,
		capturedAt: t0,
		durationMs: entries[entries.length - 1]!.ts - t0,
		frames,
	};
}

/**
 * Create a playback engine that drains AutomationRecording frames through a
 * mergeControlState callback on a ~16 ms tick interval.
 */
export function makeAutomationPlayer(
	mergeControlState: (diff: Record<string, unknown>) => void,
): {
	load(recording: AutomationRecording): void;
	play(opts: { loop: boolean }): void;
	stop(): void;
	isActive(): boolean;
	positionMs(): number;
} {
	let recording: AutomationRecording | null = null;
	let active = false;
	let loopEnabled = false;
	let startedAt = 0;
	let cursor = 0;
	let timerId: ReturnType<typeof setInterval> | null = null;

	function tick() {
		if (!active || !recording) return;
		const elapsed = Date.now() - startedAt;

		while (cursor < recording.frames.length) {
			const frame = recording.frames[cursor]!;
			if (frame.tMs > elapsed) break;
			mergeControlState(frame.diff);
			cursor++;
		}

		if (elapsed >= recording.durationMs) {
			if (loopEnabled && recording.durationMs > 0) {
				startedAt = Date.now();
				cursor = 0;
			} else {
				stopPlayer();
			}
		}
	}

	function stopPlayer() {
		if (timerId !== null) {
			clearInterval(timerId);
			timerId = null;
		}
		active = false;
		mergeControlState({ replaying: false });
	}

	return {
		load(rec) {
			recording = rec;
			cursor = 0;
			if (active) startedAt = Date.now();
		},
		play(opts) {
			if (!recording) return;
			if (timerId !== null) {
				clearInterval(timerId);
				timerId = null;
			}
			active = true;
			loopEnabled = opts.loop;
			startedAt = Date.now();
			cursor = 0;
			mergeControlState({ replaying: true });
			timerId = setInterval(tick, 16);
		},
		stop() {
			stopPlayer();
		},
		isActive() {
			return active;
		},
		// In loop mode, resets to 0 at the start of each iteration.
		positionMs() {
			if (!active) return 0;
			return Date.now() - startedAt;
		},
	};
}
