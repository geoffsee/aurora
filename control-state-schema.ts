const defaultBandCurves = () => ({
	energy: "linear" as const,
	bass: "linear" as const,
	mid: "linear" as const,
	high: "linear" as const,
});

const defaultEmaAlphas = () => ({
	energy: 0.12,
	bass: 0.08,
	mid: 0.15,
	high: 0.22,
	pulse: 0.28,
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
		return migrateControlState({ ...s, schemaVersion: 3, bandCurves: defaultBandCurves() });
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
		return { ...s, schemaVersion: 4, emaAlphas };
	}
	return state;
};
