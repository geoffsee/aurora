import { DEFAULT_AUDIO_EMA_ALPHAS, type AudioEmaAlphas } from "./audio-ema.ts";
import { isAudioCurveShape, type AudioCurveShape } from "./osc-validation.ts";

// PRESET_BUNDLE_SCHEMA_VERSION tracks the stored preset bundle format.
// Bump when the { schemaVersion, name, state, curves } wire shape changes.
// v1: first versioned release — bundles activeShader, bandCurves, emaAlphas alongside numeric controls
export const PRESET_BUNDLE_SCHEMA_VERSION = 1;

export type BandCurves = {
	energy: AudioCurveShape;
	bass: AudioCurveShape;
	mid: AudioCurveShape;
	high: AudioCurveShape;
};

// A versioned preset bundle as stored in localStorage under bevyosc.presets.
export type PresetBundle = {
	schemaVersion: number;
	name: string;
	state: Record<string, unknown>;
	curves: Record<string, string>;
};

export function normalizeEmaAlphas(
	raw: Record<string, unknown> | null | undefined,
): AudioEmaAlphas {
	const ea = raw ?? {};
	const clamp = (v: unknown, def: number): number => {
		const n = Number(v);
		return Number.isFinite(n) && n >= 0.01 && n <= 1 ? n : def;
	};
	return {
		energy: clamp(ea.energy, DEFAULT_AUDIO_EMA_ALPHAS.energy),
		bass: clamp(ea.bass, DEFAULT_AUDIO_EMA_ALPHAS.bass),
		mid: clamp(ea.mid, DEFAULT_AUDIO_EMA_ALPHAS.mid),
		high: clamp(ea.high, DEFAULT_AUDIO_EMA_ALPHAS.high),
		pulse: clamp(ea.pulse, DEFAULT_AUDIO_EMA_ALPHAS.pulse),
	};
}

export function normalizeBandCurves(
	raw: Record<string, unknown> | null | undefined,
): BandCurves {
	const bc = raw ?? {};
	const c = (v: unknown): AudioCurveShape => (isAudioCurveShape(v) ? v : "linear");
	return {
		energy: c(bc.energy),
		bass: c(bc.bass),
		mid: c(bc.mid),
		high: c(bc.high),
	};
}

// Migrate a raw localStorage preset value to the current PresetBundle schema.
// Handles:
//   null / non-object                                    → null
//   legacy raw state (no "state" key, no schemaVersion) → v1
//   v0 unversioned { name?, state, curves? }             → v1
//   v1 (current)                                        → identity (normalised shape)
//   unknown future version                              → null (never downgrade)
export function migratePresetBundle(raw: unknown): PresetBundle | null {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;

	// Legacy: raw ControlState stored directly, no "state" wrapper key
	if (!("state" in r)) {
		return {
			schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION,
			name: "",
			state: r,
			curves: {},
		};
	}

	const state =
		r.state !== null && typeof r.state === "object"
			? (r.state as Record<string, unknown>)
			: {};
	const curves: Record<string, string> = {};
	if (r.curves !== null && typeof r.curves === "object" && !Array.isArray(r.curves)) {
		for (const [k, v] of Object.entries(r.curves as Record<string, unknown>)) {
			if (typeof v === "string") curves[k] = v;
		}
	}
	const name = typeof r.name === "string" ? r.name : "";

	// v0 unversioned: has "state" key but no schemaVersion
	if (!("schemaVersion" in r)) {
		return { schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION, name, state, curves };
	}

	// v1: already at current version — normalise shape and pass through
	if (r.schemaVersion === PRESET_BUNDLE_SCHEMA_VERSION) {
		return { schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION, name, state, curves };
	}

	// Unknown future version — refuse to downgrade
	return null;
}
