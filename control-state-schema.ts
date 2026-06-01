// Migrate a control state payload from an older schema version to the current one.
// Called before validateControlStateVersion so that old automation replays and
// legacy clients can still connect after a schema bump.
export const migrateControlState = (state: unknown): unknown => {
	if (!state || typeof state !== "object") return state;
	const s = state as Record<string, unknown>;
	// v1 → v2: add activeShader field
	if (s.schemaVersion === 1) {
		return { ...s, schemaVersion: 2, activeShader: 0 };
	}
	return state;
};
