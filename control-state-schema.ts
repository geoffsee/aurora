// Migrate a control state payload from an older schema version to the current one.
// Called before validateControlStateVersion so that old automation replays and
// legacy clients can still connect after a schema bump.
export const migrateControlState = (state: unknown): unknown => {
	if (!state || typeof state !== "object") return state;
	let s = state as Record<string, unknown>;
	// v1 → v2: add activeShader field
	if (s.schemaVersion === 1) {
		s = { ...s, schemaVersion: 2, activeShader: 0 };
	}
	// v2 → v3: add per-band EMA alpha fields
	if (s.schemaVersion === 2) {
		s = {
			...s,
			schemaVersion: 3,
			emaAlphaBass: 0.08,
			emaAlphaEnergy: 0.12,
			emaAlphaMid: 0.15,
			emaAlphaHigh: 0.22,
			emaAlphaPulse: 0.28,
		};
	}
	return s;
};
