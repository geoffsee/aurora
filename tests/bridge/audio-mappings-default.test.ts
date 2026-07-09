import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { makeAutomationBridge } from "../../bridge/automation-bridge.ts";
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
import { DEFAULT_TRANSIENT_CONFIG } from "../../bridge/audio-transient-trigger.ts";
import { makeStateLog } from "../../bridge/state-log.ts";
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

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// Mirror of the demo audio loop's raw feature envelope in bridge/index.ts — the
// single performer-less audio source. Every band oscillates so, after EMA
// smoothing, each shipped mapping has a live signal to react to. The pulse band
// is a sharp spike at the top of each bar then a short linear tail.
const demoRawFeatures = (nowSec: number): AudioFeatures => {
	const beat = ((nowSec * DEMO_BPM) / 60) % 4;
	const energy =
		0.45 +
		Math.sin(nowSec * 2.1) * 0.2 +
		Math.max(0, Math.sin(nowSec * 8.0)) * 0.25;
	return {
		energy: clamp01(energy),
		bass: clamp01(0.56 + Math.sin(nowSec * 2.4) * 0.36),
		mid: clamp01(0.45 + Math.sin(nowSec * 3.1 + 1.4) * 0.3),
		high: clamp01(Math.max(0, Math.sin(nowSec * 12.0)) * 0.9),
		pulse: beat < 0.18 ? 1 : Math.max(0, 1 - beat / 0.42),
	};
};

// Single-source the pulse envelope through the full demo generator above.
const demoRawPulse = (nowSec: number): number => demoRawFeatures(nowSec).pulse;

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

// ──────────────────────────────────────────────────────────────────────────
// #215: extend audio-only trustworthiness coverage over the WHOLE default set.
//
// #199 proved the single flash mapping is reachable. The deeper "announced but
// not honest" gap is that "audio is the only controller" was shipped without an
// end-to-end assertion that EVERY shipped default mapping actually drives a
// visual. This drives the full audio-mappings.json set through the real EMA +
// router against the demo envelope and asserts each mapping reaches its target,
// so a future dead-mapping regression fails here instead of at a show.
// ──────────────────────────────────────────────────────────────────────────

// Drive the entire shipped mapping set through the demo envelope + EMA and record
// every ControlState write, keyed by target, with the distinct values seen.
const driveFullDefaultSet = (windowMs: number) => {
	const shipped = parseAudioMappings(audioMappingsRaw);
	const state: Record<string, unknown> = { flashVersion: 0 };
	const writes = new Map<string, Set<number>>();
	const router = makeAudioControlRouter(
		(diff) => {
			Object.assign(state, diff);
			for (const [k, v] of Object.entries(diff)) {
				const seen = writes.get(k) ?? new Set<number>();
				seen.add(Number(v));
				writes.set(k, seen);
			}
		},
		() => state,
	);
	router.setMappings(shipped);
	router.setEnabled(true);

	const ema = makeAudioEmaState();
	for (let t = 0; t < windowMs; t += DEMO_LOOP_MS) {
		const smoothed = stepAudioEma(
			ema,
			demoRawFeatures(t / 1000),
			DEFAULT_AUDIO_EMA_ALPHAS,
			DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
		);
		router.onFeatures(smoothed, t);
	}
	return { shipped, writes, state };
};

describe("full default audio mapping set is reachable (#215)", () => {
	test("every shipped default mapping drives its target under the demo envelope", () => {
		const { shipped, writes, state } = driveFullDefaultSet(15000);
		// Guard against an empty/malformed config silently passing the loop below.
		expect(shipped.length).toBeGreaterThan(0);

		for (const m of shipped) {
			// Reachability: the mapping actually wrote its ControlState target.
			expect(writes.has(m.target)).toBe(true);
			if (m.mode === "continuous") {
				// A live continuous mapping moves across the window — not a dead constant.
				expect((writes.get(m.target) as Set<number>).size).toBeGreaterThan(1);
			} else {
				// A threshold counter (flashVersion) must have fired at least once.
				expect(Number(state[m.target])).toBeGreaterThan(0);
			}
		}
	});
});

// ──────────────────────────────────────────────────────────────────────────
// #215: the performer-less config's audio path must produce BOTH flash output
// and transient→automation output. The demo audio feed (the only performer-less
// source) fans out to two consumers in bridge/index.ts's demo tick: the
// audio-control router (flash) and, while audioTransientAutomation is armed, the
// automation bridge's transient detector (playback). This wires the same two
// consumers to the same demo envelope and asserts both fire.
// ──────────────────────────────────────────────────────────────────────────

describe("performer-less audio path drives flash + transient→automation (#215)", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("demo audio produces both a flash increment and automation playback", () => {
		vi.setSystemTime(0);
		const shipped = parseAudioMappings(audioMappingsRaw);

		// Consumer 1: the audio-control router carrying the shipped defaults. The
		// pulse→flashVersion threshold lives here.
		const controlState: Record<string, unknown> = { flashVersion: 0 };
		const router = makeAudioControlRouter(
			(diff) => Object.assign(controlState, diff),
			() => controlState,
		);
		router.setMappings(shipped);
		router.setEnabled(true);

		// Consumer 2: the automation bridge with the shipped DEFAULT transient
		// config. A seeded state log gives buildRecording real frames to replay.
		const log = makeStateLog(20);
		log.record(null, { intensity: 0.5 });
		vi.setSystemTime(300);
		log.record({ intensity: 0.5 }, { intensity: 0.8 });
		vi.setSystemTime(0);

		const automationMerges: Record<string, unknown>[] = [];
		const automation = makeAutomationBridge(
			(d) => automationMerges.push({ ...d }),
			[],
			() => log.toArray(),
			DEFAULT_TRANSIENT_CONFIG,
		);

		const ema = makeAudioEmaState();
		let transientFired = false;
		for (let t = 0; t < 15000; t += DEMO_LOOP_MS) {
			vi.setSystemTime(t);
			const smoothed = stepAudioEma(
				ema,
				demoRawFeatures(t / 1000),
				DEFAULT_AUDIO_EMA_ALPHAS,
				DEFAULT_AUDIO_EMA_RELEASE_ALPHAS,
			);
			router.onFeatures(smoothed, t);
			// Mirror maybeFeedAutomationAudio with audioTransientAutomation armed.
			if (automation.onAudioFeatures(smoothed, t)) transientFired = true;
		}

		// Flash output: pulse→flashVersion incremented over the window.
		expect(Number(controlState.flashVersion)).toBeGreaterThan(0);
		// Transient→automation output: a transient fired and drove playback.
		expect(transientFired).toBe(true);
		expect(automationMerges.some((d) => d.replaying === true)).toBe(true);

		// Release the player's tick interval before restoring real timers.
		automation.player.stop();
	});
});
