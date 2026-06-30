// Continuous morph between two preset states. Reuses the snap/linear/ease
// transition-curve machinery that drives the controls-page preset transitions
// (controls.html applyCurve / INTERPOLATED_KEYS), but is positioned by an
// external OSC controller instead of a wall-clock timer: each message sets the
// morph position directly, so a fader sweep 0→1 sweeps the blend continuously.

export type MorphCurve = "snap" | "linear" | "ease";
export const MORPH_CURVES: readonly MorphCurve[] = ["snap", "linear", "ease"];
export const isMorphCurve = (v: unknown): v is MorphCurve =>
	v === "snap" || v === "linear" || v === "ease";

// Numeric ControlState fields the morph interpolates. Mirrors INTERPOLATED_KEYS
// in controls.html's preset-transition logic. Discrete fields (e.g. deckAMode/
// deckBMode) are intentionally excluded — they're modes, not continuous values,
// so a 0→1 sweep never carries them toward the target and the live deck modes
// are left untouched. A full sweep to a preset therefore does not fully reach it.
export const MORPH_KEYS = [
	"crossfade",
	"speed",
	"intensity",
	"feedback",
	"depth",
	"palette",
	"ringOpacity",
	"maxBrightness",
] as const;
export type MorphKey = (typeof MORPH_KEYS)[number];

// Clamp the external morph position into the unit interval. Non-finite input
// (missing arg, NaN) collapses to 0 so a malformed message holds the "from" end.
export const clampMorphPosition = (value: unknown): number => {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return n <= 0 ? 0 : n >= 1 ? 1 : n;
};

// Shape the morph position through the transition curve. Same formula as
// controls.html applyCurve: snap jumps straight to the target, ease is
// smoothstep, linear is the identity.
export const applyMorphCurve = (
	position: number,
	curve: MorphCurve,
): number => {
	const t = clampMorphPosition(position);
	if (curve === "snap") return 1;
	if (curve === "ease") return t * t * (3 - 2 * t);
	return t;
};

// Interpolate the morph-eligible fields between two preset states at the given
// position/curve. A non-finite endpoint falls back to the other side so a
// preset that omits a field still yields a sane blend.
export const morphPresetStates = (
	from: Partial<Record<MorphKey, number>>,
	to: Partial<Record<MorphKey, number>>,
	position: number,
	curve: MorphCurve,
): Record<MorphKey, number> => {
	const tv = applyMorphCurve(position, curve);
	const out = {} as Record<MorphKey, number>;
	for (const key of MORPH_KEYS) {
		const rawA = from[key];
		const rawB = to[key];
		const a = Number.isFinite(rawA)
			? (rawA as number)
			: Number.isFinite(rawB)
				? (rawB as number)
				: 0;
		const b = Number.isFinite(rawB) ? (rawB as number) : a;
		out[key] = a + (b - a) * tv;
	}
	return out;
};
