import { describe, expect, test } from "vitest";
import { DEFAULT_AUDIO_EMA_ALPHAS, type AudioEmaAlphas } from "../audio-ema.ts";
import { type AudioCurveShape } from "../osc-validation.ts";
import { migrateControlState } from "../control-state-schema.ts";
import {
	PRESET_BUNDLE_SCHEMA_VERSION,
	migratePresetBundle,
	normalizeEmaAlphas,
	normalizeBandCurves,
	type BandCurves,
	type PresetBundle,
} from "../preset-bundle-schema.ts";

// Mirror of the preset-relevant ControlState fields used by recall helpers below.
type PresetState = {
	activeShader: number;
	bandCurves: BandCurves;
	emaAlphas: AudioEmaAlphas;
	crossfade: number;
	intensity: number;
};

// Mirror of controls.html cloneState + savePresetToSlot logic (with schemaVersion).
function savePreset(state: PresetState): PresetBundle {
	return {
		schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION,
		name: "test",
		state: JSON.parse(JSON.stringify(state)) as Record<string, unknown>,
		curves: {},
	};
}

// Mirror of controls.html recallPreset atomic apply logic.
function recallPreset(bundle: PresetBundle, current: PresetState): PresetState {
	const to = bundle.state;
	return {
		...current,
		activeShader:
			typeof to.activeShader === "number"
				? to.activeShader
				: current.activeShader,
		bandCurves: normalizeBandCurves(to.bandCurves as Record<string, unknown>),
		emaAlphas: normalizeEmaAlphas(to.emaAlphas as Record<string, unknown>),
		crossfade:
			typeof to.crossfade === "number" ? to.crossfade : current.crossfade,
		intensity:
			typeof to.intensity === "number" ? to.intensity : current.intensity,
	};
}

// ── PRESET_BUNDLE_SCHEMA_VERSION ──────────────────────────────────────────────

describe("PRESET_BUNDLE_SCHEMA_VERSION", () => {
	// If this assertion fails, also bump the constant in controls.html.
	test("equals 1 (pin to catch controls.html drift)", () => {
		expect(PRESET_BUNDLE_SCHEMA_VERSION).toBe(1);
	});

	test("is a positive integer", () => {
		expect(Number.isInteger(PRESET_BUNDLE_SCHEMA_VERSION)).toBe(true);
		expect(PRESET_BUNDLE_SCHEMA_VERSION).toBeGreaterThan(0);
	});

	test("saved preset carries the current schema version", () => {
		const state: PresetState = {
			activeShader: 0,
			bandCurves: {
				energy: "linear",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const bundle = savePreset(state);
		expect(bundle.schemaVersion).toBe(PRESET_BUNDLE_SCHEMA_VERSION);
	});
});

// ── migratePresetBundle ───────────────────────────────────────────────────────

describe("migratePresetBundle — null / non-object inputs", () => {
	test("null returns null", () => {
		expect(migratePresetBundle(null)).toBeNull();
	});
	test("undefined returns null", () => {
		expect(migratePresetBundle(undefined)).toBeNull();
	});
	test("string returns null", () => {
		expect(migratePresetBundle("preset")).toBeNull();
	});
	test("number returns null", () => {
		expect(migratePresetBundle(42)).toBeNull();
	});
});

describe("migratePresetBundle — legacy raw state (no 'state' wrapper)", () => {
	test("wraps raw state in v1 bundle", () => {
		const raw = { activeShader: 1, crossfade: 0.75 };
		const result = migratePresetBundle(raw);
		expect(result).not.toBeNull();
		expect(result!.schemaVersion).toBe(PRESET_BUNDLE_SCHEMA_VERSION);
		expect(result!.state).toEqual(raw);
		expect(result!.name).toBe("");
		expect(result!.curves).toEqual({});
	});
});

describe("migratePresetBundle — v0 unversioned bundle", () => {
	test("promotes to v1 preserving state, name, and curves", () => {
		const raw = {
			name: "Drop",
			state: {
				activeShader: 1,
				bandCurves: {
					energy: "exponential",
					bass: "linear",
					mid: "linear",
					high: "linear",
				},
				emaAlphas: { energy: 0.4, bass: 0.2, mid: 0.3, high: 0.5, pulse: 0.6 },
				crossfade: 0.9,
			},
			curves: { crossfade: "ease", intensity: "linear" },
		};
		const result = migratePresetBundle(raw);
		expect(result).not.toBeNull();
		expect(result!.schemaVersion).toBe(PRESET_BUNDLE_SCHEMA_VERSION);
		expect(result!.name).toBe("Drop");
		expect(result!.state).toEqual(raw.state);
		expect(result!.curves).toEqual(raw.curves);
	});

	test("handles missing optional name and curves gracefully", () => {
		const raw = { state: { activeShader: 0 } };
		const result = migratePresetBundle(raw);
		expect(result).not.toBeNull();
		expect(result!.name).toBe("");
		expect(result!.curves).toEqual({});
	});

	test("handles null curves field", () => {
		const raw = { name: "Test", state: { crossfade: 0.5 }, curves: null };
		const result = migratePresetBundle(raw);
		expect(result).not.toBeNull();
		expect(result!.curves).toEqual({});
	});
});

describe("migratePresetBundle — v1 current version", () => {
	test("returns normalised v1 bundle unchanged", () => {
		const raw: PresetBundle = {
			schemaVersion: 1,
			name: "Warmup",
			state: { activeShader: 0, crossfade: 0.5 },
			curves: { intensity: "ease" },
		};
		const result = migratePresetBundle(raw);
		expect(result).not.toBeNull();
		expect(result!.schemaVersion).toBe(1);
		expect(result!.name).toBe("Warmup");
		expect(result!.state).toEqual(raw.state);
		expect(result!.curves).toEqual(raw.curves);
	});
});

describe("migratePresetBundle — unknown future version", () => {
	test("returns null rather than downgrading", () => {
		const raw = { schemaVersion: 999, name: "Future", state: {}, curves: {} };
		expect(migratePresetBundle(raw)).toBeNull();
	});
});

// ── save + load round-trip ────────────────────────────────────────────────────

describe("preset save and load round-trip (integration)", () => {
	test("serialising through JSON (localStorage sim) and migrating preserves all three bundle fields", () => {
		const state: PresetState = {
			activeShader: 1,
			bandCurves: {
				energy: "exponential",
				bass: "logarithmic",
				mid: "linear",
				high: "exponential",
			},
			emaAlphas: { energy: 0.4, bass: 0.2, mid: 0.35, high: 0.6, pulse: 0.5 },
			crossfade: 0.75,
			intensity: 1.1,
		};

		// Save — mirrors savePresetToSlot in controls.html
		const saved = savePreset(state);

		// Serialise → deserialise to simulate localStorage round-trip
		const fromStorage = JSON.parse(JSON.stringify(saved)) as unknown;

		// Migrate (handles both v1 and legacy on load)
		const bundle = migratePresetBundle(fromStorage);
		expect(bundle).not.toBeNull();
		expect(bundle!.schemaVersion).toBe(PRESET_BUNDLE_SCHEMA_VERSION);

		// Recall
		const current: PresetState = {
			activeShader: 0,
			bandCurves: {
				energy: "linear",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const recalled = recallPreset(bundle!, current);

		expect(recalled.activeShader).toBe(1);
		expect(recalled.bandCurves.energy).toBe("exponential");
		expect(recalled.bandCurves.bass).toBe("logarithmic");
		expect(recalled.emaAlphas.energy).toBeCloseTo(0.4);
		expect(recalled.emaAlphas.bass).toBeCloseTo(0.2);
		expect(recalled.crossfade).toBeCloseTo(0.75);
		expect(recalled.intensity).toBeCloseTo(1.1);
	});

	test("v0 legacy preset loaded from storage migrates and recalls correctly", () => {
		// Pre-versioning format: { name, state, curves } with no schemaVersion
		const legacyStored = {
			name: "Legacy preset",
			state: {
				activeShader: 1,
				bandCurves: {
					energy: "exponential",
					bass: "linear",
					mid: "linear",
					high: "linear",
				},
				emaAlphas: {
					energy: 0.3,
					bass: 0.1,
					mid: 0.25,
					high: 0.45,
					pulse: 0.55,
				},
				crossfade: 0.6,
				intensity: 1.0,
			},
			curves: { crossfade: "linear" },
		};

		const bundle = migratePresetBundle(legacyStored);
		expect(bundle).not.toBeNull();
		expect(bundle!.schemaVersion).toBe(PRESET_BUNDLE_SCHEMA_VERSION);

		const current: PresetState = {
			activeShader: 0,
			bandCurves: {
				energy: "linear",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const recalled = recallPreset(bundle!, current);
		expect(recalled.activeShader).toBe(1);
		expect(recalled.bandCurves.energy).toBe("exponential");
		expect(recalled.emaAlphas.energy).toBeCloseTo(0.3);
	});
});

// ── Preset bundles activeShader ────────────────────────────────────────────────

describe("preset bundles activeShader", () => {
	test("saved shader index is restored on recall", () => {
		const state: PresetState = {
			activeShader: 1,
			bandCurves: {
				energy: "linear",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const bundle = savePreset(state);
		const current: PresetState = { ...state, activeShader: 0 };
		const after = recallPreset(bundle, current);
		expect(after.activeShader).toBe(1);
	});
});

// ── Preset bundles bandCurves ──────────────────────────────────────────────────

describe("preset bundles bandCurves", () => {
	test("saved band curves are restored on recall", () => {
		const state: PresetState = {
			activeShader: 0,
			bandCurves: {
				energy: "exponential",
				bass: "logarithmic",
				mid: "linear",
				high: "exponential",
			},
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const bundle = savePreset(state);
		const current: PresetState = {
			...state,
			bandCurves: {
				energy: "linear",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
		};
		const after = recallPreset(bundle, current);
		expect(after.bandCurves.energy).toBe("exponential");
		expect(after.bandCurves.bass).toBe("logarithmic");
		expect(after.bandCurves.high).toBe("exponential");
	});
});

// ── Preset bundles emaAlphas ──────────────────────────────────────────────────

describe("preset bundles emaAlphas", () => {
	test("saved EMA alphas are restored on recall", () => {
		const customAlphas: AudioEmaAlphas = {
			energy: 0.4,
			bass: 0.2,
			mid: 0.35,
			high: 0.6,
			pulse: 0.5,
		};
		const state: PresetState = {
			activeShader: 0,
			bandCurves: {
				energy: "linear",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
			emaAlphas: customAlphas,
			crossfade: 0.5,
			intensity: 0.8,
		};
		const bundle = savePreset(state);
		const current: PresetState = {
			...state,
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
		};
		const after = recallPreset(bundle, current);
		expect(after.emaAlphas.energy).toBeCloseTo(0.4);
		expect(after.emaAlphas.bass).toBeCloseTo(0.2);
		expect(after.emaAlphas.mid).toBeCloseTo(0.35);
		expect(after.emaAlphas.high).toBeCloseTo(0.6);
		expect(after.emaAlphas.pulse).toBeCloseTo(0.5);
	});

	test("missing emaAlphas in preset bundle fall back to defaults on recall", () => {
		const bundle: PresetBundle = {
			schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION,
			name: "old",
			state: {
				activeShader: 0,
				bandCurves: {
					energy: "linear",
					bass: "linear",
					mid: "linear",
					high: "linear",
				},
				crossfade: 0.5,
				intensity: 0.8,
			},
			curves: {},
		};
		const current: PresetState = {
			activeShader: 0,
			bandCurves: {
				energy: "linear",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const after = recallPreset(bundle, current);
		expect(after.emaAlphas).toEqual(DEFAULT_AUDIO_EMA_ALPHAS);
	});
});

// ── Atomic application ────────────────────────────────────────────────────────

describe("recalling a preset applies all three fields atomically", () => {
	test("activeShader, bandCurves, and emaAlphas all change together", () => {
		const saved: PresetState = {
			activeShader: 1,
			bandCurves: {
				energy: "exponential",
				bass: "logarithmic",
				mid: "exponential",
				high: "logarithmic",
			},
			emaAlphas: { energy: 0.5, bass: 0.3, mid: 0.4, high: 0.7, pulse: 0.6 },
			crossfade: 0.75,
			intensity: 1.2,
		};
		const current: PresetState = {
			activeShader: 0,
			bandCurves: {
				energy: "linear",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const after = recallPreset(savePreset(saved), current);
		// All three fields updated atomically
		expect(after.activeShader).toBe(1);
		expect(after.bandCurves.energy).toBe("exponential");
		expect(after.emaAlphas.energy).toBeCloseTo(0.5);
		// Numeric state fields also restored
		expect(after.crossfade).toBeCloseTo(0.75);
		expect(after.intensity).toBeCloseTo(1.2);
	});
});

// ── Schema migration includes emaAlphas ────────────────────────────────────────

describe("schema migration preserves bundling intent", () => {
	test("v3 control state migrates to v4 with default emaAlphas", () => {
		const v3State = {
			schemaVersion: 3,
			activeShader: 1,
			bandCurves: {
				energy: "exponential",
				bass: "linear",
				mid: "linear",
				high: "linear",
			},
		};
		const migrated = migrateControlState(v3State) as Record<string, unknown>;
		expect(migrated.schemaVersion).toBe(4);
		expect(migrated.emaAlphas).toEqual(DEFAULT_AUDIO_EMA_ALPHAS);
		expect(migrated.bandCurves).toEqual(v3State.bandCurves);
		expect(migrated.activeShader).toBe(1);
	});
});

// ── normalizeBandCurves ───────────────────────────────────────────────────────

describe("normalizeBandCurves", () => {
	test("defaults all bands to linear when given null", () => {
		const bc = normalizeBandCurves(null);
		expect(bc).toEqual({
			energy: "linear",
			bass: "linear",
			mid: "linear",
			high: "linear",
		});
	});

	test("defaults all bands to linear when given undefined", () => {
		const bc = normalizeBandCurves(undefined);
		expect(bc).toEqual({
			energy: "linear",
			bass: "linear",
			mid: "linear",
			high: "linear",
		});
	});

	test("passes through valid curve shapes", () => {
		const bc = normalizeBandCurves({
			energy: "exponential",
			bass: "logarithmic",
			mid: "linear",
			high: "exponential",
		});
		expect(bc.energy).toBe("exponential");
		expect(bc.bass).toBe("logarithmic");
	});

	test("replaces invalid curve shape with linear", () => {
		const bc = normalizeBandCurves({
			energy: "invalid" as AudioCurveShape,
			bass: "linear",
			mid: "linear",
			high: "linear",
		});
		expect(bc.energy).toBe("linear");
	});
});

// ── normalizeEmaAlphas ────────────────────────────────────────────────────────

describe("normalizeEmaAlphas", () => {
	test("defaults all bands when given null", () => {
		const ea = normalizeEmaAlphas(null);
		expect(ea).toEqual(DEFAULT_AUDIO_EMA_ALPHAS);
	});

	test("defaults all bands when given undefined", () => {
		const ea = normalizeEmaAlphas(undefined);
		expect(ea).toEqual(DEFAULT_AUDIO_EMA_ALPHAS);
	});

	test("passes through valid alphas", () => {
		const ea = normalizeEmaAlphas({
			energy: 0.5,
			bass: 0.3,
			mid: 0.4,
			high: 0.6,
			pulse: 0.7,
		});
		expect(ea.energy).toBeCloseTo(0.5);
		expect(ea.bass).toBeCloseTo(0.3);
		expect(ea.pulse).toBeCloseTo(0.7);
	});

	test("replaces out-of-range alpha with band default", () => {
		const ea = normalizeEmaAlphas({
			energy: 0,
			bass: 1.5,
			mid: -0.1,
			high: 0.22,
			pulse: 0.28,
		});
		expect(ea.energy).toBe(DEFAULT_AUDIO_EMA_ALPHAS.energy);
		expect(ea.bass).toBe(DEFAULT_AUDIO_EMA_ALPHAS.bass);
		expect(ea.mid).toBe(DEFAULT_AUDIO_EMA_ALPHAS.mid);
		expect(ea.high).toBeCloseTo(0.22);
	});
});

// ── normalizePreset (controls.html) / migratePresetBundle parity ──────────────
// If this suite fails after a schema bump, update normalizePreset in controls.html too.

describe("normalizePreset (controls.html) parity with migratePresetBundle", () => {
	// Inline replica of normalizePreset from controls.html.
	function normalizePreset(raw: unknown): PresetBundle | null {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
		const r = raw as Record<string, unknown>;
		if (!("state" in r))
			return {
				schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION,
				name: "",
				state: r,
				curves: {},
			};
		const state =
			r.state && typeof r.state === "object"
				? (r.state as Record<string, unknown>)
				: {};
		const curvesRaw = r.curves;
		const curves: Record<string, string> =
			curvesRaw && typeof curvesRaw === "object" && !Array.isArray(curvesRaw)
				? Object.fromEntries(
						Object.entries(curvesRaw as Record<string, unknown>).filter(
							([, v]) => typeof v === "string",
						) as [string, string][],
					)
				: {};
		const name = typeof r.name === "string" ? r.name : "";
		if (
			!("schemaVersion" in r) ||
			r.schemaVersion === PRESET_BUNDLE_SCHEMA_VERSION
		) {
			return {
				schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION,
				name,
				state,
				curves,
			};
		}
		return null;
	}

	test("null → null", () =>
		expect(normalizePreset(null)).toEqual(migratePresetBundle(null)));
	test("undefined → null", () =>
		expect(normalizePreset(undefined)).toEqual(migratePresetBundle(undefined)));
	test("string → null", () =>
		expect(normalizePreset("preset")).toEqual(migratePresetBundle("preset")));
	test("legacy raw state (no state key)", () => {
		const raw = { activeShader: 1, crossfade: 0.75 };
		expect(normalizePreset(raw)).toEqual(migratePresetBundle(raw));
	});
	test("v0 unversioned bundle", () => {
		const raw = {
			name: "Drop",
			state: { activeShader: 1 },
			curves: { crossfade: "ease" },
		};
		expect(normalizePreset(raw)).toEqual(migratePresetBundle(raw));
	});
	test("v0 with null curves", () => {
		const raw = { name: "Test", state: { crossfade: 0.5 }, curves: null };
		expect(normalizePreset(raw)).toEqual(migratePresetBundle(raw));
	});
	test("v1 current bundle", () => {
		const raw: PresetBundle = {
			schemaVersion: 1,
			name: "Warmup",
			state: { crossfade: 0.5 },
			curves: { intensity: "ease" },
		};
		expect(normalizePreset(raw)).toEqual(migratePresetBundle(raw));
	});
	test("unknown future version → null", () => {
		const raw = { schemaVersion: 999, name: "Future", state: {}, curves: {} };
		expect(normalizePreset(raw)).toEqual(migratePresetBundle(raw));
	});
});
