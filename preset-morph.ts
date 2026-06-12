// Preset morphing: a continuous blend weight (0 = preset A, 1 = preset B)
// driven over OSC (/bevyosc/preset/morph) or a MIDI CC binding ("presetMorph").
// Canonical TypeScript source; controls.html carries an inline JavaScript
// mirror (morphCurveValue/computeMorphState) — keep both in sync.

// Same modes as the recall transition curves stored in preset bundles.
export type MorphCurveMode = "snap" | "linear" | "ease";
export const MORPH_CURVE_MODES: readonly MorphCurveMode[] = [
	"snap",
	"linear",
	"ease",
];

// Keys blended continuously — must match INTERPOLATED_KEYS in controls.html.
export const MORPH_INTERPOLATED_KEYS: readonly string[] = [
	"crossfade",
	"speed",
	"intensity",
	"feedback",
	"depth",
	"palette",
	"ringOpacity",
	"maxBrightness",
];

// Live counters owned by the running ControlState — never taken from a preset.
export const MORPH_VERSION_KEYS: readonly string[] = [
	"cueVersion",
	"flashVersion",
	"resetVersion",
];

export const clampMorphWeight = (raw: unknown): number | null => {
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	return Math.max(0, Math.min(1, n));
};

// Unlike recall (where missing curves default to "snap" for legacy bundles),
// a morph fader defaults to "linear": its whole point is the fade. Bundles
// that store "snap" curves opt back into the hard cut at the midpoint.
export const normalizeMorphCurve = (v: unknown): MorphCurveMode =>
	v === "snap" || v === "linear" || v === "ease" ? v : "linear";

// snap = cut at the midpoint; linear = direct fade; ease = smoothstep fade.
export const morphCurveValue = (
	weight: number,
	curve: MorphCurveMode,
): number => {
	if (curve === "snap") return weight < 0.5 ? 0 : 1;
	if (curve === "ease") return weight * weight * (3 - 2 * weight);
	return weight;
};

// Blends two preset-bundle states. Interpolated keys fade per their transition
// curve; every other (discrete) field cuts from A to B at weight 0.5. Version
// counters are stripped so the caller keeps its live values.
export function computeMorphState(
	from: Record<string, unknown>,
	to: Record<string, unknown>,
	curves: Record<string, string> | null | undefined,
	weight: number,
	keys: readonly string[] = MORPH_INTERPOLATED_KEYS,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...(weight < 0.5 ? from : to) };
	for (const key of MORPH_VERSION_KEYS) delete result[key];
	for (const key of keys) {
		const a =
			typeof from[key] === "number"
				? (from[key] as number)
				: typeof to[key] === "number"
					? (to[key] as number)
					: 0;
		const b = typeof to[key] === "number" ? (to[key] as number) : a;
		result[key] = a + (b - a) * morphCurveValue(weight, normalizeMorphCurve(curves?.[key]));
	}
	return result;
}
