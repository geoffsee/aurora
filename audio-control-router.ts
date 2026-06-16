import type { AudioFeatures } from "./audio-ema.ts";

// Phase 1 of "Audio as the Only Controller" (spike docs/spikes/audio-as-controller.md).
// The router turns smoothed audio feature vectors into ControlState mutations. It is
// deliberately decoupled from the ControlState type: it reads/writes through plain
// records so the bridge stays the single clamping authority (coerceControlState).

export const AUDIO_FEATURE_SOURCES = ["energy", "bass", "mid", "high", "pulse"] as const;
export type AudioFeatureSource = (typeof AUDIO_FEATURE_SOURCES)[number];

export type AudioMappingMode = "continuous" | "threshold";

export type AudioMapping = {
	source: AudioFeatureSource;
	target: string; // a ControlState field name; the bridge clamps the result
	mode: AudioMappingMode;

	// continuous: target = lerp(targetMin, targetMax, clamp(source, 0, 1))
	targetMin?: number;
	targetMax?: number;

	// threshold: fires once per rising edge above `level`, then waits `offDelay` ms
	level?: number;
	offDelay?: number;
	// On a rising edge, either set `riseValue` or, when `increment` is true, bump the
	// current target value by 1 (edge-trigger counters such as flashVersion).
	riseValue?: number;
	increment?: boolean;
};

export type ControlSnapshot = Record<string, number | boolean>;
export type ControlDiff = Record<string, number | boolean>;

export type AudioControlRouterOptions = {
	getControlState: () => ControlSnapshot;
	merge: (diff: ControlDiff) => void;
	now?: () => number;
	// Minimum change in a continuous output before re-emitting, to avoid no-op spam.
	epsilon?: number;
};

export interface AudioControlRouter {
	setMappings(mappings: AudioMapping[]): void;
	getMappings(): readonly AudioMapping[];
	setActive(active: boolean): void;
	isActive(): boolean;
	onFeatures(features: AudioFeatures): void;
}

const clamp01 = (value: number): number =>
	Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const isFeatureSource = (v: unknown): v is AudioFeatureSource =>
	typeof v === "string" && (AUDIO_FEATURE_SOURCES as readonly string[]).includes(v);

// Validate and normalise a raw JSON value (e.g. audio-mappings.json) into a clean
// AudioMapping[]. Invalid entries are dropped rather than throwing so a malformed
// config file degrades to "no routing" instead of crashing the bridge.
export const parseAudioMappings = (raw: unknown): AudioMapping[] => {
	if (!Array.isArray(raw)) return [];
	const out: AudioMapping[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const e = entry as Record<string, unknown>;
		if (!isFeatureSource(e.source)) continue;
		if (typeof e.target !== "string" || e.target.length === 0) continue;
		if (e.mode !== "continuous" && e.mode !== "threshold") continue;

		const mapping: AudioMapping = {
			source: e.source,
			target: e.target,
			mode: e.mode,
		};
		if (e.mode === "continuous") {
			mapping.targetMin = Number.isFinite(Number(e.targetMin)) ? Number(e.targetMin) : 0;
			mapping.targetMax = Number.isFinite(Number(e.targetMax)) ? Number(e.targetMax) : 1;
		} else {
			mapping.level = Number.isFinite(Number(e.level)) ? clamp01(Number(e.level)) : 0.5;
			mapping.offDelay = Number.isFinite(Number(e.offDelay)) ? Math.max(0, Number(e.offDelay)) : 0;
			if (e.increment === true) {
				mapping.increment = true;
			} else if (Number.isFinite(Number(e.riseValue))) {
				mapping.riseValue = Number(e.riseValue);
			} else {
				continue; // a threshold mapping with no effect is meaningless
			}
		}
		out.push(mapping);
	}
	return out;
};

type EdgeState = {
	wasAbove: boolean;
	lastFiredAt: number;
	lastOutput: number;
	hasOutput: boolean;
};

export const makeAudioControlRouter = (
	options: AudioControlRouterOptions,
): AudioControlRouter => {
	const now = options.now ?? Date.now;
	const epsilon = options.epsilon ?? 1e-3;
	let mappings: AudioMapping[] = [];
	let edges: EdgeState[] = [];
	let active = false;

	const resetEdges = () => {
		edges = mappings.map(() => ({
			wasAbove: false,
			lastFiredAt: -Infinity,
			lastOutput: 0,
			hasOutput: false,
		}));
	};

	return {
		setMappings(next) {
			mappings = next.slice();
			resetEdges();
		},
		getMappings() {
			return mappings;
		},
		setActive(next) {
			active = next;
		},
		isActive() {
			return active;
		},
		onFeatures(features) {
			if (!active || mappings.length === 0) return;

			const diff: ControlDiff = {};
			let stateSnapshot: ControlSnapshot | null = null;
			const t = now();

			for (let i = 0; i < mappings.length; i++) {
				const m = mappings[i];
				const edge = edges[i];
				if (!m || !edge) continue;
				const sourceValue = clamp01(features[m.source] ?? 0);

				if (m.mode === "continuous") {
					const lo = m.targetMin ?? 0;
					const hi = m.targetMax ?? 1;
					const out = lo + (hi - lo) * sourceValue;
					if (!edge.hasOutput || Math.abs(out - edge.lastOutput) > epsilon) {
						diff[m.target] = out;
						edge.lastOutput = out;
						edge.hasOutput = true;
					}
					continue;
				}

				// threshold: rising-edge detection with debounce
				const above = sourceValue >= (m.level ?? 0.5);
				if (above && !edge.wasAbove) {
					if (t - edge.lastFiredAt >= (m.offDelay ?? 0)) {
						if (m.increment) {
							if (stateSnapshot === null) stateSnapshot = options.getControlState();
							const base = Number(stateSnapshot[m.target] ?? 0);
							diff[m.target] = (Number.isFinite(base) ? base : 0) + 1;
						} else if (m.riseValue !== undefined) {
							diff[m.target] = m.riseValue;
						}
						edge.lastFiredAt = t;
					}
				}
				edge.wasAbove = above;
			}

			if (Object.keys(diff).length > 0) options.merge(diff);
		},
	};
};
