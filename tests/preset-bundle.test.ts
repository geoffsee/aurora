import { describe, expect, test } from "vitest";
import { DEFAULT_AUDIO_EMA_ALPHAS, type AudioEmaAlphas } from "../audio-ema.ts";
import { isAudioCurveShape, type AudioCurveShape } from "../osc-validation.ts";
import { migrateControlState } from "../control-state-schema.ts";

// Mirror of the preset-relevant ControlState fields.
type PresetState = {
	activeShader: number;
	bandCurves: { energy: AudioCurveShape; bass: AudioCurveShape; mid: AudioCurveShape; high: AudioCurveShape };
	emaAlphas: AudioEmaAlphas;
	crossfade: number;
	intensity: number;
};

function normalizeEmaAlphas(raw: Record<string, unknown> | undefined): AudioEmaAlphas {
	const ea = raw ?? {};
	const clamp = (v: unknown, def: number) => {
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

function normalizeBandCurves(
	raw: Record<string, unknown> | undefined,
): PresetState["bandCurves"] {
	const bc = raw ?? {};
	const c = (v: unknown): AudioCurveShape => (isAudioCurveShape(v) ? v : "linear");
	return { energy: c(bc.energy), bass: c(bc.bass), mid: c(bc.mid), high: c(bc.high) };
}

// Mirror of controls.html cloneState + savePresetToSlot logic.
function savePreset(state: PresetState): { state: PresetState } {
	return { state: JSON.parse(JSON.stringify(state)) };
}

// Mirror of controls.html recallPreset atomic apply logic.
function recallPreset(
	preset: { state: PresetState },
	current: PresetState,
): PresetState {
	const to = preset.state;
	return {
		...current,
		activeShader: typeof to.activeShader === "number" ? to.activeShader : current.activeShader,
		bandCurves: normalizeBandCurves(to.bandCurves as Record<string, unknown>),
		emaAlphas: normalizeEmaAlphas(to.emaAlphas as Record<string, unknown>),
		crossfade: typeof to.crossfade === "number" ? to.crossfade : current.crossfade,
		intensity: typeof to.intensity === "number" ? to.intensity : current.intensity,
	};
}

// ── Preset bundles activeShader ────────────────────────────────────────────────

describe("preset bundles activeShader", () => {
	test("saved shader index is restored on recall", () => {
		const state: PresetState = {
			activeShader: 1,
			bandCurves: { energy: "linear", bass: "linear", mid: "linear", high: "linear" },
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const preset = savePreset(state);
		const current: PresetState = { ...state, activeShader: 0 };
		const after = recallPreset(preset, current);
		expect(after.activeShader).toBe(1);
	});
});

// ── Preset bundles bandCurves ──────────────────────────────────────────────────

describe("preset bundles bandCurves", () => {
	test("saved band curves are restored on recall", () => {
		const state: PresetState = {
			activeShader: 0,
			bandCurves: { energy: "exponential", bass: "logarithmic", mid: "linear", high: "exponential" },
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const preset = savePreset(state);
		const current: PresetState = {
			...state,
			bandCurves: { energy: "linear", bass: "linear", mid: "linear", high: "linear" },
		};
		const after = recallPreset(preset, current);
		expect(after.bandCurves.energy).toBe("exponential");
		expect(after.bandCurves.bass).toBe("logarithmic");
		expect(after.bandCurves.high).toBe("exponential");
	});
});

// ── Preset bundles emaAlphas ──────────────────────────────────────────────────

describe("preset bundles emaAlphas", () => {
	test("saved EMA alphas are restored on recall", () => {
		const customAlphas: AudioEmaAlphas = { energy: 0.4, bass: 0.2, mid: 0.35, high: 0.6, pulse: 0.5 };
		const state: PresetState = {
			activeShader: 0,
			bandCurves: { energy: "linear", bass: "linear", mid: "linear", high: "linear" },
			emaAlphas: customAlphas,
			crossfade: 0.5,
			intensity: 0.8,
		};
		const preset = savePreset(state);
		const current: PresetState = { ...state, emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS } };
		const after = recallPreset(preset, current);
		expect(after.emaAlphas.energy).toBeCloseTo(0.4);
		expect(after.emaAlphas.bass).toBeCloseTo(0.2);
		expect(after.emaAlphas.mid).toBeCloseTo(0.35);
		expect(after.emaAlphas.high).toBeCloseTo(0.6);
		expect(after.emaAlphas.pulse).toBeCloseTo(0.5);
	});

	test("invalid emaAlphas in preset fall back to defaults", () => {
		const after = recallPreset(
			{ state: { activeShader: 0, bandCurves: { energy: "linear", bass: "linear", mid: "linear", high: "linear" }, emaAlphas: undefined as unknown as AudioEmaAlphas, crossfade: 0.5, intensity: 0.8 } },
			{ activeShader: 0, bandCurves: { energy: "linear", bass: "linear", mid: "linear", high: "linear" }, emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS }, crossfade: 0.5, intensity: 0.8 },
		);
		expect(after.emaAlphas).toEqual(DEFAULT_AUDIO_EMA_ALPHAS);
	});
});

// ── Atomic application ────────────────────────────────────────────────────────

describe("recalling a preset applies all three fields atomically", () => {
	test("activeShader, bandCurves, and emaAlphas all change together", () => {
		const saved: PresetState = {
			activeShader: 1,
			bandCurves: { energy: "exponential", bass: "logarithmic", mid: "exponential", high: "logarithmic" },
			emaAlphas: { energy: 0.5, bass: 0.3, mid: 0.4, high: 0.7, pulse: 0.6 },
			crossfade: 0.75,
			intensity: 1.2,
		};
		const current: PresetState = {
			activeShader: 0,
			bandCurves: { energy: "linear", bass: "linear", mid: "linear", high: "linear" },
			emaAlphas: { ...DEFAULT_AUDIO_EMA_ALPHAS },
			crossfade: 0.5,
			intensity: 0.8,
		};
		const after = recallPreset(savePreset(saved), current);
		// All three fields updated atomically
		expect(after.activeShader).toBe(1);
		expect(after.bandCurves.energy).toBe("exponential");
		expect(after.emaAlphas.energy).toBeCloseTo(0.5);
		// Other state fields also restored
		expect(after.crossfade).toBeCloseTo(0.75);
		expect(after.intensity).toBeCloseTo(1.2);
	});
});

// ── Schema migration includes emaAlphas ────────────────────────────────────────

describe("schema migration preserves bundling intent", () => {
	test("v3 preset state migrates to v4 with default emaAlphas", () => {
		const v3State = {
			schemaVersion: 3,
			activeShader: 1,
			bandCurves: { energy: "exponential", bass: "linear", mid: "linear", high: "linear" },
		};
		const migrated = migrateControlState(v3State) as Record<string, unknown>;
		expect(migrated.schemaVersion).toBe(4);
		expect(migrated.emaAlphas).toEqual(DEFAULT_AUDIO_EMA_ALPHAS);
		expect(migrated.bandCurves).toEqual(v3State.bandCurves);
		expect(migrated.activeShader).toBe(1);
	});
});
