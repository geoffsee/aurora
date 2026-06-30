import {
	migratePresetBundle,
	PRESET_BUNDLE_SCHEMA_VERSION,
	type PresetBundle,
} from "../../../shared/preset-bundle-schema.ts";
import type { ControlState, CurveMode } from "./types.ts";
import { syncPaletteFromHue, syncPaletteFromRgb } from "./palette.ts";
import { PRESETS_KEY } from "./constants.ts";

export {
	migratePresetBundle,
	PRESET_BUNDLE_SCHEMA_VERSION,
	type PresetBundle,
};

/** Alias kept for preset-bundle parity tests and legacy naming. */
export const normalizePreset = migratePresetBundle;

export const INTERPOLATED_KEYS = [
	"crossfade",
	"speed",
	"intensity",
	"feedback",
	"depth",
	"paletteR",
	"paletteG",
	"paletteB",
	"ringOpacity",
	"maxBrightness",
] as const;

export type InterpolatedKey = (typeof INTERPOLATED_KEYS)[number];

export const CURVE_MODES: readonly CurveMode[] = ["snap", "linear", "ease"];

export const CURVE_PARAM_LABELS: Record<InterpolatedKey, string> = {
	crossfade: "Crossfade",
	speed: "Speed",
	intensity: "Intensity",
	feedback: "Trails",
	depth: "3D Lines",
	paletteR: "Color R",
	paletteG: "Color G",
	paletteB: "Color B",
	ringOpacity: "Ring Opc",
	maxBrightness: "Max Bright",
};

export function applyCurve(
	t: number,
	curve: CurveMode,
	durationMs: number,
): number {
	if (curve === "snap" || durationMs <= 0) return 1;
	if (curve === "ease") return t * t * (3 - 2 * t);
	return t;
}

export function defaultPendingCurves(): Record<InterpolatedKey, CurveMode> {
	return Object.fromEntries(
		INTERPOLATED_KEYS.map((k) => [k, "snap" as CurveMode]),
	) as Record<InterpolatedKey, CurveMode>;
}

export function loadPresets(): Record<string, unknown> {
	try {
		return JSON.parse(localStorage.getItem(PRESETS_KEY) || "{}") as Record<
			string,
			unknown
		>;
	} catch {
		return {};
	}
}

export function savePresetsToStorage(presets: Record<string, unknown>) {
	localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export function cloneState(state: ControlState): ControlState {
	return JSON.parse(JSON.stringify(state)) as ControlState;
}

export function normalizePresetCurves(
	raw: Record<string, unknown> | undefined | null,
): Record<InterpolatedKey, CurveMode> {
	const out = defaultPendingCurves();
	for (const key of INTERPOLATED_KEYS) {
		const c = raw?.[key];
		out[key] = CURVE_MODES.includes(c as CurveMode)
			? (c as CurveMode)
			: "snap";
	}
	return out;
}

export function interpolatePresetState(
	from: ControlState,
	to: Partial<ControlState>,
	pendingCurves: Record<InterpolatedKey, CurveMode>,
	t: number,
	durationMs: number,
): Partial<ControlState> {
	const lerped: Partial<ControlState> = { ...to };
	const snapAll = durationMs <= 0;
	for (const key of INTERPOLATED_KEYS) {
		const a =
			typeof from[key] === "number"
				? from[key]
				: typeof to[key] === "number"
					? (to[key] as number)
					: 0;
		const b = typeof to[key] === "number" ? (to[key] as number) : a;
		const curve = pendingCurves[key] ?? "snap";
		const tv = applyCurve(t, curve === "snap" || snapAll ? "snap" : curve, durationMs);
		(lerped as Record<string, number>)[key] = a + (b - a) * tv;
	}
	return lerped;
}

export function preparePresetTarget(
	presetState: Record<string, unknown>,
): Partial<ControlState> {
	const to = { ...presetState } as Partial<ControlState>;
	if (to.paletteR === undefined) {
		syncPaletteFromHue(to as ControlState);
	}
	return to;
}

export function finalizeInterpolatedState(
	state: ControlState,
	lerped: Partial<ControlState>,
) {
	const { cueVersion, flashVersion, resetVersion, ...rest } = lerped;
	Object.assign(state, rest, { replaying: false });
	syncPaletteFromRgb(state);
}
