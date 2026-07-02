const defaultBandCurves = () => ({
	energy: "linear" as const,
	bass: "linear" as const,
	mid: "linear" as const,
	high: "linear" as const,
});

import { hueToRgb } from "./palette-color.ts";

const defaultEmaAlphas = () => ({
	energy: 0.12,
	bass: 0.08,
	mid: 0.15,
	high: 0.65,
	pulse: 0.85,
});

// Migrate a control state payload from an older schema version to the current one.
// Called before validateControlStateVersion so that old automation replays and
// legacy clients can still connect after a schema bump.
export const migrateControlState = (state: unknown): unknown => {
	if (!state || typeof state !== "object") return state;
	const s = state as Record<string, unknown>;
	// v1 → v2: add activeShader field
	if (s.schemaVersion === 1) {
		return migrateControlState({ ...s, schemaVersion: 2, activeShader: 0 });
	}
	// v2 → v3: add bandCurves field
	if (s.schemaVersion === 2) {
		return migrateControlState({
			...s,
			schemaVersion: 3,
			bandCurves: defaultBandCurves(),
		});
	}
	// v3 → v4: add emaAlphas field (per-band EMA decay constants)
	// v3 states from PR #95 may carry flat emaAlpha* fields — preserve them.
	if (s.schemaVersion === 3) {
		const emaAlphas =
			typeof s.emaAlphaBass === "number"
				? {
						energy: s.emaAlphaEnergy as number,
						bass: s.emaAlphaBass as number,
						mid: s.emaAlphaMid as number,
						high: s.emaAlphaHigh as number,
						pulse: s.emaAlphaPulse as number,
					}
				: defaultEmaAlphas();
		return migrateControlState({ ...s, schemaVersion: 4, emaAlphas });
	}
	// v4 → v5: add morph field (OSC-controlled preset-morph fader position)
	if (s.schemaVersion === 4) {
		return migrateControlState({ ...s, schemaVersion: 5, morph: 0 });
	}
	// v5 → v6: add audioControlMode field (audio-control router global enable)
	if (s.schemaVersion === 5) {
		return migrateControlState({
			...s,
			schemaVersion: 6,
			audioControlMode: false,
		});
	}
	// v6 → v7: add paletteR/G/B (derive from legacy palette hue when absent)
	if (s.schemaVersion === 6) {
		const palette = typeof s.palette === "number" ? s.palette : 0;
		const rgb = hueToRgb(palette);
		return migrateControlState({
			...s,
			schemaVersion: 7,
			paletteR: rgb.r,
			paletteG: rgb.g,
			paletteB: rgb.b,
		});
	}
	// v7 → v8: add audioTransientAutomation field (opt-in audio→automation trigger)
	if (s.schemaVersion === 7) {
		return migrateControlState({
			...s,
			schemaVersion: 8,
			audioTransientAutomation: false,
		});
	}
	// v8 → v9: add outputs field (multi-output routing). Empty by default so the
	// single-projector path stays a no-op.
	if (s.schemaVersion === 8) {
		return migrateControlState({ ...s, schemaVersion: 9, outputs: [] });
	}
	// v9 → v10: add per-layer weight fields (layerWeight0..7). Zero by default so
	// an empty stack contributes nothing. Count mirrors PRESET_LAYER_MAX (8) in
	// bridge/preset-layers.ts; shared/ can't import bridge/ without a cycle.
	if (s.schemaVersion === 9) {
		const layerWeights: Record<string, number> = {};
		for (let i = 0; i < 8; i++) layerWeights[`layerWeight${i}`] = 0;
		return { ...s, schemaVersion: 10, ...layerWeights };
	}
	return state;
};
