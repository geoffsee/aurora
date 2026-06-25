import type { AudioFeatures } from "./audio-ema.ts";

// ──────────────────────────────────────────────────────────────────────────
// Audio-Control Router — Phase 1 of "Audio as the Only Controller"
// (design spike: docs/spikes/audio-as-controller.md)
//
// Maps smoothed audio feature scalars (energy/bass/mid/high/pulse) onto
// ControlState mutations so a live set can be driven by audio alone. The
// router never owns ControlState: it emits diffs through `merge`, and the
// bridge's coerceControlState clamps every field — the router output is never
// trusted directly.
//
// PHASE 2 (browser-native audio capture, NOT implemented here): a future
// `getUserMedia` + Web Audio source in the controls page can feed this same
// router by sending `/bevyosc/audio/features`. That path has a hard
// deployment constraint — `getUserMedia` only resolves in a SECURE CONTEXT
// (HTTPS origin or `localhost`). Serving the controls page from a bare LAN IP
// (e.g. `192.168.x.x:3001`) over plain HTTP makes capture fail. Any
// non-localhost deployment of Phase 2 must terminate TLS or use a localhost
// tunnel. See docs/spikes/audio-as-controller.md "Phase 2 → Blocker".
// ──────────────────────────────────────────────────────────────────────────

export type AudioMappingSource = keyof AudioFeatures;
export type AudioMappingMode = "continuous" | "threshold";

export type AudioMapping = {
	/** Which audio feature band drives this mapping. */
	source: AudioMappingSource;
	/** ControlState field name to write. Unknown targets are dropped by coerce. */
	target: string;
	/** "continuous": lerp target across [targetMin,targetMax]. "threshold": fire on rising edge. */
	mode: AudioMappingMode;
	/** continuous: output floor. */
	targetMin: number;
	/** continuous: output ceil. threshold (set mode): value written on rise. */
	targetMax: number;
	/** threshold: source level (0..1) that triggers a rising edge. */
	level: number;
	/** threshold: minimum ms between successive fires (rising-edge debounce). */
	offDelayMs: number;
	/** threshold: when true, increment the current target value by 1 (counter targets like flashVersion). */
	increment: boolean;
};

const SOURCES: ReadonlySet<string> = new Set([
	"energy",
	"bass",
	"mid",
	"high",
	"pulse",
]);

// Continuous mappings only emit when the output moves more than this, so a
// steady audio level does not spam mergeControlState with no-op broadcasts.
const CONTINUOUS_EPSILON = 0.001;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const num = (v: unknown, fallback: number) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
};

/**
 * Normalise an untrusted JSON value (e.g. audio-mappings.json) into a clean
 * AudioMapping[]. Invalid entries are dropped so a malformed config degrades
 * gracefully rather than throwing. Missing optional fields take sane defaults.
 */
export function parseAudioMappings(raw: unknown): AudioMapping[] {
	if (!Array.isArray(raw)) return [];
	const out: AudioMapping[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const e = entry as Record<string, unknown>;
		if (!SOURCES.has(String(e.source))) continue;
		if (typeof e.target !== "string" || e.target.length === 0) continue;
		const mode = e.mode === "threshold" ? "threshold" : "continuous";
		out.push({
			source: e.source as AudioMappingSource,
			target: e.target,
			mode,
			targetMin: num(e.targetMin, 0),
			targetMax: num(e.targetMax, 1),
			level: clamp01(num(e.level, 0.5)),
			offDelayMs: Math.max(0, num(e.offDelayMs, 200)),
			increment: e.increment === true,
		});
	}
	return out;
}

export type AudioControlRouter = {
	setMappings(mappings: AudioMapping[]): void;
	setEnabled(enabled: boolean): void;
	isActive(): boolean;
	onFeatures(features: Readonly<AudioFeatures>, nowMs: number): boolean;
};

/**
 * Create a stateful audio→control router.
 *
 * `merge` receives a diff to fold into ControlState (same target as every other
 * state mutation). `getState` reads the current ControlState, used for
 * increment-mode counter targets (e.g. flashVersion + 1).
 *
 * The router is inert until both `setEnabled(true)` is called (mirrors
 * ControlState.audioControlMode) and at least one mapping is configured.
 */
export function makeAudioControlRouter(
	merge: (diff: Record<string, unknown>) => void,
	getState: () => Record<string, unknown>,
): AudioControlRouter {
	let mappings: AudioMapping[] = [];
	let enabled = false;
	// Per-mapping edge state, parallel to `mappings`.
	let wasAbove: boolean[] = [];
	let lastFiredMs: number[] = [];
	let lastOutput: number[] = [];

	const resetEdgeState = () => {
		wasAbove = mappings.map(() => false);
		lastFiredMs = mappings.map(() => -Infinity);
		lastOutput = mappings.map(() => Number.NaN);
	};

	return {
		setMappings(next) {
			mappings = next;
			resetEdgeState();
		},
		setEnabled(next) {
			enabled = next;
		},
		isActive() {
			return enabled && mappings.length > 0;
		},
		onFeatures(features, nowMs) {
			if (!enabled || mappings.length === 0) return false;

			let diff: Record<string, unknown> | null = null;
			const state = getState();

			for (let i = 0; i < mappings.length; i++) {
				const m = mappings[i];
				if (!m) continue;
				const raw = num(features[m.source], 0);

				if (m.mode === "continuous") {
					const out = m.targetMin + (m.targetMax - m.targetMin) * clamp01(raw);
					const prev = lastOutput[i] ?? Number.NaN;
					if (Number.isNaN(prev) || Math.abs(out - prev) > CONTINUOUS_EPSILON) {
						lastOutput[i] = out;
						(diff ??= {})[m.target] = out;
					}
					continue;
				}

				// threshold: fire once per rising edge above `level`, debounced.
				const above = raw >= m.level;
				const rising = above && !wasAbove[i];
				wasAbove[i] = above;
				if (!rising) continue;
				if (nowMs - (lastFiredMs[i] ?? -Infinity) < m.offDelayMs) continue;
				lastFiredMs[i] = nowMs;
				diff ??= {};
				if (m.increment) {
					diff[m.target] = num(state[m.target], 0) + 1;
				} else {
					diff[m.target] = m.targetMax;
				}
			}

			if (!diff) return false;
			merge(diff);
			return true;
		},
	};
}
