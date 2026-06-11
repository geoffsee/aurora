import { describe, expect, test, vi } from "vitest";
import {
	CONTINUOUS_EPSILON,
	DEFAULT_OFF_DELAY_MS,
	makeAudioControlRouter,
	parseAudioMappings,
	parseAudioMappingsJson,
	type AudioMapping,
} from "../audio-control-router.ts";
import type { AudioFeatures } from "../audio-ema.ts";

const features = (overrides: Partial<AudioFeatures> = {}): AudioFeatures => ({
	energy: 0,
	bass: 0,
	mid: 0,
	high: 0,
	pulse: 0,
	...overrides,
});

function makeHarness(initialState: Record<string, unknown> = {}) {
	let state: Record<string, unknown> & { audioControlMode: boolean } = {
		audioControlMode: true,
		crossfade: 0.5,
		intensity: 0.82,
		flashVersion: 0,
		cueVersion: 0,
		...initialState,
	} as Record<string, unknown> & { audioControlMode: boolean };
	const merges: Record<string, unknown>[] = [];
	const router = makeAudioControlRouter(
		() => state,
		(diff) => {
			merges.push(diff);
			state = { ...state, ...diff };
		},
	);
	return {
		router,
		merges,
		getState: () => state,
		setState: (patch: Record<string, unknown>) => {
			state = { ...state, ...patch };
		},
	};
}

const pulseFlashMapping: AudioMapping = {
	mode: "threshold",
	source: "pulse",
	target: "flashVersion",
	level: 0.75,
	offDelay: 200,
};

const energyIntensityMapping: AudioMapping = {
	mode: "continuous",
	source: "energy",
	target: "intensity",
	targetMin: 0.4,
	targetMax: 1.2,
};

describe("threshold mode", () => {
	test("fires once per rising edge and increments counter targets", () => {
		const h = makeHarness();
		h.router.setMappings([pulseFlashMapping]);
		h.router.onFeatures(features({ pulse: 0.2 }), 1000);
		expect(h.merges).toHaveLength(0);
		h.router.onFeatures(features({ pulse: 0.9 }), 1050);
		expect(h.merges).toEqual([{ flashVersion: 1 }]);
		// Sustained high signal is not a new rising edge.
		h.router.onFeatures(features({ pulse: 0.95 }), 2000);
		expect(h.merges).toHaveLength(1);
	});

	test("does not fire when the very first sample is already above the level", () => {
		const h = makeHarness();
		h.router.setMappings([pulseFlashMapping]);
		h.router.onFeatures(features({ pulse: 0.9 }), 1000);
		expect(h.merges).toHaveLength(0);
		// Drop below then rise again — now it fires.
		h.router.onFeatures(features({ pulse: 0.1 }), 1100);
		h.router.onFeatures(features({ pulse: 0.9 }), 1200);
		expect(h.merges).toEqual([{ flashVersion: 1 }]);
	});

	test("debounces rising edges within offDelay", () => {
		const h = makeHarness();
		h.router.setMappings([pulseFlashMapping]);
		h.router.onFeatures(features({ pulse: 0.1 }), 1000);
		h.router.onFeatures(features({ pulse: 0.9 }), 1010);
		h.router.onFeatures(features({ pulse: 0.1 }), 1050);
		h.router.onFeatures(features({ pulse: 0.9 }), 1100); // within 200 ms — suppressed
		expect(h.merges).toHaveLength(1);
		h.router.onFeatures(features({ pulse: 0.1 }), 1200);
		h.router.onFeatures(features({ pulse: 0.9 }), 1300); // 290 ms after fire — allowed
		expect(h.merges).toHaveLength(2);
		expect(h.getState().flashVersion).toBe(2);
	});

	test("counter increments are based on current state, not a static set", () => {
		const h = makeHarness({ flashVersion: 41 });
		h.router.setMappings([pulseFlashMapping]);
		h.router.onFeatures(features({ pulse: 0.1 }), 1000);
		h.router.onFeatures(features({ pulse: 0.9 }), 1100);
		expect(h.merges).toEqual([{ flashVersion: 42 }]);
	});

	test("non-counter threshold targets are set to the configured value", () => {
		const h = makeHarness();
		h.router.setMappings([
			{
				mode: "threshold",
				source: "bass",
				target: "crossfade",
				level: 0.5,
				offDelay: 0,
				value: 1,
			},
		]);
		h.router.onFeatures(features({ bass: 0.1 }), 1000);
		h.router.onFeatures(features({ bass: 0.8 }), 1100);
		expect(h.merges).toEqual([{ crossfade: 1 }]);
	});
});

describe("continuous mode", () => {
	test("lerps the clamped source into [targetMin, targetMax]", () => {
		const h = makeHarness();
		h.router.setMappings([energyIntensityMapping]);
		h.router.onFeatures(features({ energy: 0.5 }), 1000);
		expect(h.merges).toEqual([{ intensity: 0.8 }]);
	});

	test("clamps source outside [0, 1] to the target bounds", () => {
		const h = makeHarness();
		h.router.setMappings([energyIntensityMapping]);
		h.router.onFeatures(features({ energy: 7 }), 1000);
		expect(h.merges).toEqual([{ intensity: 1.2 }]);
		h.router.onFeatures(features({ energy: -3 }), 1050);
		expect(h.merges).toEqual([{ intensity: 1.2 }, { intensity: 0.4 }]);
	});

	test("suppresses no-op merges when the output moves less than epsilon", () => {
		const h = makeHarness();
		h.router.setMappings([energyIntensityMapping]);
		h.router.onFeatures(features({ energy: 0.5 }), 1000);
		h.router.onFeatures(features({ energy: 0.5 }), 1050);
		h.router.onFeatures(
			features({ energy: 0.5 + CONTINUOUS_EPSILON / 2 }),
			1100,
		);
		expect(h.merges).toHaveLength(1);
		h.router.onFeatures(features({ energy: 0.6 }), 1150);
		expect(h.merges).toHaveLength(2);
	});
});

describe("router gating", () => {
	test("empty mappings never merge", () => {
		const h = makeHarness();
		h.router.setMappings([]);
		h.router.onFeatures(features({ energy: 1, pulse: 1 }), 1000);
		h.router.onFeatures(features({ energy: 0.2, pulse: 0 }), 1050);
		expect(h.merges).toHaveLength(0);
		expect(h.router.isActive()).toBe(false);
	});

	test("disabled audioControlMode ignores all features", () => {
		const h = makeHarness({ audioControlMode: false });
		h.router.setMappings([pulseFlashMapping, energyIntensityMapping]);
		h.router.onFeatures(features({ pulse: 0.1, energy: 0.3 }), 1000);
		h.router.onFeatures(features({ pulse: 0.9, energy: 0.9 }), 1100);
		expect(h.merges).toHaveLength(0);
		expect(h.router.isActive()).toBe(false);
		// Enabling mid-stream activates routing.
		h.setState({ audioControlMode: true });
		expect(h.router.isActive()).toBe(true);
		h.router.onFeatures(features({ pulse: 0.1, energy: 0.5 }), 1200);
		h.router.onFeatures(features({ pulse: 0.9, energy: 0.5 }), 1500);
		expect(h.getState().flashVersion).toBe(1);
	});
});

describe("config parsing", () => {
	test("returns [] for malformed JSON and non-array payloads", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(parseAudioMappingsJson("not json {{{")).toEqual([]);
		expect(parseAudioMappingsJson('{"mappings": []}')).toEqual([]);
		expect(parseAudioMappings(null)).toEqual([]);
		warn.mockRestore();
	});

	test("keeps valid entries and drops invalid ones", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const parsed = parseAudioMappings([
			{
				mode: "continuous",
				source: "energy",
				target: "intensity",
				targetMin: 0.4,
				targetMax: 1.2,
			},
			{
				mode: "continuous",
				source: "energy",
				target: "schemaVersion",
				targetMin: 0,
				targetMax: 9,
			}, // bad target
			{
				mode: "continuous",
				source: "loudness",
				target: "intensity",
				targetMin: 0,
				targetMax: 1,
			}, // bad source
			{
				mode: "continuous",
				source: "energy",
				target: "intensity",
				targetMin: "0",
			}, // bad bounds
			{
				mode: "threshold",
				source: "pulse",
				target: "flashVersion",
				level: 0.75,
				offDelay: 200,
			},
			{ mode: "threshold", source: "pulse", target: "intensity", level: 0.75 }, // non-counter without value
			{ mode: "wiggle", source: "pulse", target: "flashVersion" }, // bad mode
			"nope",
		]);
		expect(parsed).toEqual([
			{
				mode: "continuous",
				source: "energy",
				target: "intensity",
				targetMin: 0.4,
				targetMax: 1.2,
			},
			{
				mode: "threshold",
				source: "pulse",
				target: "flashVersion",
				level: 0.75,
				offDelay: 200,
			},
		]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	test("threshold defaults offDelay and clamps level to [0, 1]", () => {
		const parsed = parseAudioMappings([
			{ mode: "threshold", source: "pulse", target: "flashVersion", level: 7 },
		]);
		expect(parsed).toEqual([
			{
				mode: "threshold",
				source: "pulse",
				target: "flashVersion",
				level: 1,
				offDelay: DEFAULT_OFF_DELAY_MS,
			},
		]);
	});
});

describe("demo-mode end-to-end", () => {
	test("a sample mapping config routes a synthesized demo waveform", () => {
		// Sample config mirroring the audio-control-router.ts header example.
		const mappings = parseAudioMappingsJson(
			JSON.stringify([
				{
					mode: "threshold",
					source: "pulse",
					target: "flashVersion",
					level: 0.75,
					offDelay: 200,
				},
				{
					mode: "continuous",
					source: "energy",
					target: "intensity",
					targetMin: 0.4,
					targetMax: 1.2,
				},
			]),
		);
		expect(mappings).toHaveLength(2);

		const h = makeHarness();
		h.router.setMappings(mappings);

		// Mimic the bridge demo timer: 50 ms ticks, beat-shaped pulse at 124 BPM.
		const bpm = 124;
		for (let tick = 0; tick < 100; tick += 1) {
			const nowMs = tick * 50;
			const now = nowMs / 1000;
			const beat = ((now * bpm) / 60) % 4;
			h.router.onFeatures(
				features({
					energy: 0.45 + Math.sin(now * 2.1) * 0.2,
					pulse: beat < 0.18 ? 1 : Math.max(0, 1 - beat / 0.42),
				}),
				nowMs,
			);
		}

		const flashes = h.getState().flashVersion as number;
		expect(flashes).toBeGreaterThanOrEqual(2); // multiple beats over 5 s
		const intensity = h.getState().intensity as number;
		expect(intensity).toBeGreaterThanOrEqual(0.4);
		expect(intensity).toBeLessThanOrEqual(1.2);
	});
});
