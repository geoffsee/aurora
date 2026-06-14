// Audio-Control Router (Phase 1 of "Audio as the Only Controller", see
// docs/spikes/audio-as-controller.md and issue #124).
//
// Routes smoothed AudioFeatures onto ControlState mutations through a set of
// configurable mappings. The bridge feeds the router from the demo-mode timer
// and from `/bevyosc/audio/features` WebSocket messages sent by the projector
// page. The router is inert unless `ControlState.audioControlMode` is true.
//
// Mapping config lives in `audio-mappings.json` (bridge-side, not part of
// ControlState) and is reloaded via the `/bevyosc/audio/config` WS address.
// Two mapping modes:
//
//   continuous — target = lerp(targetMin, targetMax, clamp(source, 0, 1));
//                merged only when the output moves by more than a small
//                epsilon, so steady signals do not spam broadcasts.
//   threshold  — fires once per rising edge of `source` through `level`,
//                debounced by `offDelay` ms. Counter targets (flashVersion,
//                resetVersion, cueVersion) are incremented, never set;
//                other targets are set to `value`.
//
// Example audio-mappings.json:
//   [
//     { "mode": "threshold", "source": "pulse", "target": "flashVersion",
//       "level": 0.75, "offDelay": 200 },
//     { "mode": "continuous", "source": "energy", "target": "intensity",
//       "targetMin": 0.4, "targetMax": 1.2 }
//   ]
//
// Phase 2 (browser-native audio capture) constraint for the follow-on
// implementer: `getUserMedia` requires a secure context — localhost or an
// HTTPS origin. Serving the controls page from a bare LAN IP without TLS
// (e.g. a rehearsal rig at 192.168.x.x:3001) fails silently with
// NotAllowedError. Any non-localhost deployment needs HTTPS or a localhost
// tunnel.

import type { AudioFeatures } from "./audio-ema.ts";

export type AudioFeatureSource = keyof AudioFeatures;

const AUDIO_FEATURE_SOURCES: ReadonlySet<string> = new Set([
	"energy",
	"bass",
	"mid",
	"high",
	"pulse",
]);

// Numeric ControlState fields a mapping may drive. coerceControlState in
// index.ts re-clamps every routed value, so this set only gates field names.
export const CONTINUOUS_AUDIO_TARGETS: ReadonlySet<string> = new Set([
	"crossfade",
	"bpm",
	"speed",
	"intensity",
	"feedback",
	"depth",
	"palette",
	"paletteSaturation",
	"paletteBrightness",
	"ringOpacity",
	"maxBrightness",
]);

// Edge-trigger counters: threshold mappings increment these rather than set
// them, so a routed flash behaves exactly like a Flash button press.
export const COUNTER_AUDIO_TARGETS: ReadonlySet<string> = new Set([
	"flashVersion",
	"resetVersion",
	"cueVersion",
]);

export const DEFAULT_OFF_DELAY_MS = 200;
export const CONTINUOUS_EPSILON = 0.001;

export type ContinuousAudioMapping = {
	mode: "continuous";
	source: AudioFeatureSource;
	target: string;
	targetMin: number;
	targetMax: number;
};

export type ThresholdAudioMapping = {
	mode: "threshold";
	source: AudioFeatureSource;
	target: string;
	level: number;
	offDelay: number;
	value?: number;
};

export type AudioMapping = ContinuousAudioMapping | ThresholdAudioMapping;

export type AudioRouterState = Record<string, unknown> & {
	audioControlMode: boolean;
};

export interface AudioControlRouter {
	setMappings(mappings: AudioMapping[]): void;
	getMappings(): readonly AudioMapping[];
	onFeatures(features: Readonly<AudioFeatures>, nowMs?: number): void;
	isActive(): boolean;
}

const finite = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);

function parseOneMapping(raw: unknown): AudioMapping | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const m = raw as Record<string, unknown>;
	const source = m.source;
	if (typeof source !== "string" || !AUDIO_FEATURE_SOURCES.has(source)) return null;
	const target = m.target;
	if (typeof target !== "string") return null;

	if (m.mode === "continuous") {
		if (!CONTINUOUS_AUDIO_TARGETS.has(target)) return null;
		if (!finite(m.targetMin) || !finite(m.targetMax)) return null;
		return {
			mode: "continuous",
			source: source as AudioFeatureSource,
			target,
			targetMin: m.targetMin,
			targetMax: m.targetMax,
		};
	}

	if (m.mode === "threshold") {
		const isCounter = COUNTER_AUDIO_TARGETS.has(target);
		if (!isCounter && !CONTINUOUS_AUDIO_TARGETS.has(target)) return null;
		if (!isCounter && !finite(m.value)) return null;
		if (!finite(m.level)) return null;
		const offDelay = finite(m.offDelay) ? Math.max(0, m.offDelay) : DEFAULT_OFF_DELAY_MS;
		return {
			mode: "threshold",
			source: source as AudioFeatureSource,
			target,
			level: Math.max(0, Math.min(1, m.level)),
			offDelay,
			...(finite(m.value) ? { value: m.value } : {}),
		};
	}

	return null;
}

/** Validate an already-parsed config value; invalid entries are dropped. */
export function parseAudioMappings(raw: unknown): AudioMapping[] {
	if (!Array.isArray(raw)) return [];
	const mappings: AudioMapping[] = [];
	for (const entry of raw) {
		const mapping = parseOneMapping(entry);
		if (mapping) {
			mappings.push(mapping);
		} else {
			console.warn("[audio-router] dropping invalid mapping:", JSON.stringify(entry));
		}
	}
	return mappings;
}

/** Parse a JSON config string. Returns [] on any parse error so the bridge degrades gracefully. */
export function parseAudioMappingsJson(json: string): AudioMapping[] {
	try {
		return parseAudioMappings(JSON.parse(json));
	} catch {
		console.warn("[audio-router] failed to parse audio mappings JSON");
		return [];
	}
}

type MappingRuntimeState = {
	lastSample: number;
	lastFiredAt: number;
	lastEmitted: number | null;
};

export function makeAudioControlRouter(
	getState: () => AudioRouterState,
	merge: (diff: Record<string, unknown>) => void,
): AudioControlRouter {
	let mappings: AudioMapping[] = [];
	let runtime: MappingRuntimeState[] = [];

	return {
		setMappings(next) {
			mappings = next;
			runtime = next.map(() => ({
				// Infinity so a signal already above the level when routing starts
				// does not fire until it drops below and rises again.
				lastSample: Number.POSITIVE_INFINITY,
				lastFiredAt: -Infinity,
				lastEmitted: null,
			}));
		},
		getMappings() {
			return mappings;
		},
		isActive() {
			return mappings.length > 0 && getState().audioControlMode === true;
		},
		onFeatures(features, nowMs = Date.now()) {
			const state = getState();
			if (state.audioControlMode !== true || mappings.length === 0) return;

			let diff: Record<string, unknown> | null = null;
			for (let i = 0; i < mappings.length; i += 1) {
				const mapping = mappings[i];
				const st = runtime[i];
				if (!mapping || !st) continue;
				const sample = Math.max(0, Math.min(1, features[mapping.source]));

				if (mapping.mode === "continuous") {
					const out =
						mapping.targetMin + (mapping.targetMax - mapping.targetMin) * sample;
					if (st.lastEmitted === null || Math.abs(out - st.lastEmitted) > CONTINUOUS_EPSILON) {
						st.lastEmitted = out;
						(diff ??= {})[mapping.target] = out;
					}
					continue;
				}

				const rising = st.lastSample < mapping.level && sample >= mapping.level;
				st.lastSample = sample;
				if (!rising) continue;
				if (nowMs - st.lastFiredAt < mapping.offDelay) continue;
				st.lastFiredAt = nowMs;
				if (COUNTER_AUDIO_TARGETS.has(mapping.target)) {
					// Prefer an increment already staged this tick so two mappings
					// onto the same counter both land, then fall back to state.
					const pending = diff?.[mapping.target];
					const current = Number(pending ?? state[mapping.target]);
					(diff ??= {})[mapping.target] = (Number.isFinite(current) ? current : 0) + 1;
				} else {
					(diff ??= {})[mapping.target] = mapping.value;
				}
			}

			if (diff) merge(diff);
		},
	};
}
