import { describe, expect, test } from "vitest";
import {
	makeAudioControlRouter,
	parseAudioMappings,
} from "../../bridge/audio-control-router.ts";
import {
	type AudioFeatures,
	DEFAULT_AUDIO_EMA_ALPHAS,
	DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
	makeAudioEmaState,
	stepAudioEma,
} from "../../bridge/audio-ema.ts";
import audioMappingsRaw from "../../bridge/audio-mappings.json" with {
	type: "json",
};

// ──────────────────────────────────────────────────────────────────────────
// Regression guard for #199: the shipped default `pulse→flashVersion` threshold
// mapping must be REACHABLE through the EMA smoothing that sits between the raw
// audio and the router. The dry-run (#193) surfaced that a `level` set above the
// smoothed pulse peak means the flash silently never fires, even though the
// config ships a mapping that implies it should.
//
// This drives the ACTUAL shipped audio-mappings.json through the ACTUAL demo
// pulse envelope + EMA, so a future config or smoothing retune that pushes the
// peak back below `level` fails here instead of going silent in a live set.
// ──────────────────────────────────────────────────────────────────────────

const DEMO_LOOP_MS = 50;
const DEMO_BPM = 124;

// Mirror of the demo audio loop's raw pulse envelope in bridge/index.ts: a sharp
// spike at the top of each bar, then a short linear tail.
const demoRawPulse = (nowSec: number): number => {
	const beat = ((nowSec * DEMO_BPM) / 60) % 4;
	return beat < 0.18 ? 1 : Math.max(0, 1 - beat / 0.42);
};

const zeroFeatures = (): AudioFeatures => ({
	energy: 0,
	bass: 0,
	mid: 0,
	high: 0,
	pulse: 0,
});

// Run the smoothed demo pulse through a router carrying only the shipped
// pulse→flashVersion mapping, and return how many times it fired over `windowMs`.
const countFlashesOverDemoWindow = (pulseAlpha: number, windowMs: number) => {
	const shipped = parseAudioMappings(audioMappingsRaw);
	const flashMapping = shipped.filter(
		(m) => m.source === "pulse" && m.target === "flashVersion",
	);
	const state: Record<string, unknown> = { flashVersion: 0 };
	const router = makeAudioControlRouter(
		(diff) => Object.assign(state, diff),
		() => state,
	);
	router.setMappings(flashMapping);
	router.setEnabled(true);

	const ema = makeAudioEmaState();
	const alphas = { ...DEFAULT_AUDIO_EMA_ALPHAS, pulse: pulseAlpha };
	let peak = 0;
	for (let t = 0; t < windowMs; t += DEMO_LOOP_MS) {
		const raw = zeroFeatures();
		raw.pulse = demoRawPulse(t / 1000);
		const smoothed = stepAudioEma(
			ema,
			raw,
			alphas,
			DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
		);
		peak = Math.max(peak, smoothed.pulse);
		router.onFeatures(smoothed, t);
	}
	return { fires: Number(state.flashVersion), peak };
};

describe("shipped default audio mappings (#199)", () => {
	test("a pulse→flashVersion threshold mapping is shipped", () => {
		const shipped = parseAudioMappings(audioMappingsRaw);
		const flash = shipped.find(
			(m) => m.source === "pulse" && m.target === "flashVersion",
		);
		expect(flash).toBeDefined();
		expect(flash?.mode).toBe("threshold");
		expect(flash?.increment).toBe(true);
	});

	// The pulse EMA alpha is user/env-tunable (bridge/index.ts). The mapping must
	// stay reachable across the plausible range — including the slow-attack 0.28
	// that originally hid this gap — so the flash never depends on a lucky alpha.
	test.each([
		0.28, 0.85,
	])("default flash fires under the demo pulse with pulse alpha %s", (pulseAlpha) => {
		const { fires, peak } = countFlashesOverDemoWindow(pulseAlpha, 15000);
		const level = parseAudioMappings(audioMappingsRaw).find(
			(m) => m.source === "pulse" && m.target === "flashVersion",
		)?.level;
		expect(level).toBeDefined();
		// The smoothed peak must clear the shipped level, or the flash is silent.
		expect(peak).toBeGreaterThanOrEqual(level as number);
		expect(fires).toBeGreaterThan(0);
	});
});
