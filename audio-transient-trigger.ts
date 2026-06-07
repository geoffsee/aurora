import type { AudioFeatures } from "./audio-ema.ts";
import type { TriggerAction } from "./automation-trigger.ts";

export type TransientMode = "onset" | "beat" | "band-energy";

export type AudioTransientConfig = {
	/**
	 * Detection algorithm:
	 * - "onset": fires when the band rises significantly above a slow background estimate
	 * - "beat": fires when the band meets or exceeds the direct threshold (default band: "pulse")
	 * - "band-energy": fires when a specific band meets or exceeds the direct threshold
	 */
	mode: TransientMode;
	/**
	 * For "onset": the fractional rise required above background (0.5 → must be 50% above baseline).
	 * For "beat" / "band-energy": direct 0–1 comparison value.
	 */
	threshold: number;
	/** Minimum milliseconds between successive trigger firings (debounce). */
	debounceMs: number;
	/** Which AudioFeatures band to watch. Defaults: "pulse" for beat, "energy" for onset/band-energy. */
	band: keyof AudioFeatures;
	/** Automation action dispatched when a transient is detected. */
	action: TriggerAction;
};

export const DEFAULT_TRANSIENT_CONFIG: Readonly<AudioTransientConfig> = {
	mode: "beat",
	threshold: 0.5,
	debounceMs: 200,
	band: "energy",
	action: "toggle",
};

// Slow EMA alpha for onset background tracking. Low value keeps the background
// stable during sustained sections so single-frame spikes still register.
const ONSET_BACKGROUND_ALPHA = 0.03;
// Skip onset check until the background has accumulated a meaningful signal.
const MIN_ONSET_BASELINE = 0.01;
// Minimum absolute rise above the background required to fire onset detection.
// Prevents false positives during the background ramp-up phase when the baseline
// is very small and any quiet signal appears disproportionately large relative to it.
const MIN_ABSOLUTE_ONSET_RISE = 0.1;

/**
 * Create a stateful audio transient detector.
 *
 * Call step() once per audio frame with the latest smoothed AudioFeatures and
 * the current wall-clock timestamp in milliseconds. Returns true when a
 * transient is detected and the debounce window has elapsed since the last
 * firing. The caller is responsible for dispatching an action on true.
 *
 * updateConfig() allows runtime reconfiguration without recreating the detector.
 */
export function makeAudioTransientDetector(initialConfig: Partial<AudioTransientConfig> = {}): {
	step(features: Readonly<AudioFeatures>, nowMs: number): boolean;
	updateConfig(patch: Partial<AudioTransientConfig>): void;
	getConfig(): Readonly<AudioTransientConfig>;
} {
	let config: AudioTransientConfig = { ...DEFAULT_TRANSIENT_CONFIG, ...initialConfig };
	let baseline = 0;
	let lastFiredMs = -Infinity;

	return {
		step(features, nowMs) {
			const band = features[config.band];
			let triggered: boolean;

			if (config.mode === "onset") {
				// Check against background before updating it so the trigger sees the
				// pre-frame baseline, then advance the background with the new sample.
				// MIN_ABSOLUTE_ONSET_RISE prevents false positives during the early
				// baseline ramp-up where any quiet signal appears large relative to baseline.
				triggered = baseline >= MIN_ONSET_BASELINE &&
					band > baseline * (1 + config.threshold) &&
					band - baseline > MIN_ABSOLUTE_ONSET_RISE;
				baseline = ONSET_BACKGROUND_ALPHA * band + (1 - ONSET_BACKGROUND_ALPHA) * baseline;
			} else {
				// beat and band-energy both use a direct threshold comparison.
				triggered = band >= config.threshold;
			}

			if (!triggered) return false;
			if (nowMs - lastFiredMs < config.debounceMs) return false;
			lastFiredMs = nowMs;
			return true;
		},
		updateConfig(patch) {
			config = { ...config, ...patch };
		},
		getConfig() {
			return { ...config };
		},
	};
}
