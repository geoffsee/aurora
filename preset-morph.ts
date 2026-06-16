// OSC-controlled preset morphing: a continuous blend weight interpolates two
// preset bundles into a single output state. The blend weight itself lives on
// ControlState (clamped by coerceControlState in index.ts — the bridge is the
// single source of truth); this module owns the interpolation math.
//
// controls.html mirrors morphPresets inline — keep the two in sync.

// Numeric controls that morph continuously between presets. Mirrors the
// INTERPOLATED_KEYS list used by the transition-curve recall path.
export const MORPH_INTERPOLATED_KEYS = [
	"crossfade",
	"speed",
	"intensity",
	"feedback",
	"depth",
	"palette",
	"ringOpacity",
	"maxBrightness",
] as const;

export type MorphKey = (typeof MORPH_INTERPOLATED_KEYS)[number];

export const clampMorphWeight = (value: unknown, fallback = 0): number => {
	const n = Number(value);
	return Math.max(0, Math.min(1, Number.isFinite(n) ? n : fallback));
};

// Linearly interpolate the morph keys of two preset states by a blend weight.
// weight 0 → a, weight 1 → b. Non-numeric values on either side fall back to
// the other side so a partially-populated preset still morphs cleanly.
export const morphPresets = (
	a: Record<string, unknown>,
	b: Record<string, unknown>,
	weight: number,
	keys: readonly string[] = MORPH_INTERPOLATED_KEYS,
): Record<string, number> => {
	const w = clampMorphWeight(weight);
	const out: Record<string, number> = {};
	for (const key of keys) {
		const av = Number(a[key]);
		const bv = Number(b[key]);
		const from = Number.isFinite(av) ? av : bv;
		const to = Number.isFinite(bv) ? bv : av;
		if (!Number.isFinite(from)) continue;
		out[key] = from + (to - from) * w;
	}
	return out;
};
