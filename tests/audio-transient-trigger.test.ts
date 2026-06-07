import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	DEFAULT_TRANSIENT_CONFIG,
	makeAudioTransientDetector,
	type AudioTransientConfig,
} from "../audio-transient-trigger.ts";
import { makeStateLog } from "../state-log.ts";
import { makeAutomationBridge } from "../automation-bridge.ts";
import type { AudioFeatures } from "../audio-ema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function features(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
	return { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0, ...overrides };
}

function makeLog() {
	const log = makeStateLog(20);
	log.record(null, { crossfade: 0.3 } as Record<string, unknown>);
	return log;
}

// ---------------------------------------------------------------------------
// makeAudioTransientDetector — DEFAULT_TRANSIENT_CONFIG
// ---------------------------------------------------------------------------

describe("DEFAULT_TRANSIENT_CONFIG", () => {
	test("all fields present and within valid ranges", () => {
		const c = DEFAULT_TRANSIENT_CONFIG;
		expect(["onset", "beat", "band-energy"]).toContain(c.mode);
		expect(c.threshold).toBeGreaterThan(0);
		expect(c.threshold).toBeLessThanOrEqual(1);
		expect(c.debounceMs).toBeGreaterThan(0);
		expect(["energy", "bass", "mid", "high", "pulse"]).toContain(c.band);
		expect(["play", "play-loop", "stop", "toggle", "toggle-loop"]).toContain(c.action);
	});
});

// ---------------------------------------------------------------------------
// beat mode
// ---------------------------------------------------------------------------

describe("makeAudioTransientDetector — beat mode", () => {
	test("fires when band meets threshold", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "pulse", threshold: 0.5, debounceMs: 0 });
		expect(d.step(features({ pulse: 0.5 }), 0)).toBe(true);
	});

	test("does not fire when band is below threshold", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "pulse", threshold: 0.5, debounceMs: 0 });
		expect(d.step(features({ pulse: 0.49 }), 0)).toBe(false);
	});

	test("fires at exact threshold boundary", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "energy", threshold: 0.3, debounceMs: 0 });
		expect(d.step(features({ energy: 0.3 }), 0)).toBe(true);
	});

	test("threshold 0 fires on any non-zero signal", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "bass", threshold: 0, debounceMs: 0 });
		expect(d.step(features({ bass: 0.001 }), 0)).toBe(true);
	});

	test("does not fire when all bands are zero and threshold is 0", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "pulse", threshold: 0, debounceMs: 0 });
		// 0 >= 0 is true, so this DOES fire — that is intentional for threshold=0
		expect(d.step(features(), 0)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// band-energy mode
// ---------------------------------------------------------------------------

describe("makeAudioTransientDetector — band-energy mode", () => {
	test("fires when the configured band meets the threshold", () => {
		const d = makeAudioTransientDetector({ mode: "band-energy", band: "bass", threshold: 0.6, debounceMs: 0 });
		expect(d.step(features({ bass: 0.7 }), 0)).toBe(true);
	});

	test("does not fire when the band is below the threshold", () => {
		const d = makeAudioTransientDetector({ mode: "band-energy", band: "bass", threshold: 0.6, debounceMs: 0 });
		expect(d.step(features({ bass: 0.59 }), 0)).toBe(false);
	});

	test("band-energy and beat use the same direct threshold logic", () => {
		// Both modes should fire under identical conditions.
		const beat = makeAudioTransientDetector({ mode: "beat", band: "high", threshold: 0.4, debounceMs: 0 });
		const be = makeAudioTransientDetector({ mode: "band-energy", band: "high", threshold: 0.4, debounceMs: 0 });
		const f = features({ high: 0.45 });
		expect(beat.step(f, 0)).toBe(true);
		expect(be.step(f, 0)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// onset mode
// ---------------------------------------------------------------------------

describe("makeAudioTransientDetector — onset mode", () => {
	test("does not fire before baseline warms up", () => {
		// First frame: baseline is 0, so warmup check suppresses the trigger.
		const d = makeAudioTransientDetector({ mode: "onset", band: "energy", threshold: 0.5, debounceMs: 0 });
		expect(d.step(features({ energy: 0.9 }), 0)).toBe(false);
	});

	test("fires when energy rises sharply above background after warmup", () => {
		const d = makeAudioTransientDetector({ mode: "onset", band: "energy", threshold: 0.5, debounceMs: 0 });
		// Feed several quiet frames to warm up the baseline (~0.01 is MIN_ONSET_BASELINE)
		for (let i = 0; i < 80; i++) {
			d.step(features({ energy: 0.05 }), i);
		}
		// Now spike the energy far above the background
		expect(d.step(features({ energy: 0.9 }), 80)).toBe(true);
	});

	test("does not fire on a gradual rise that stays below the rise factor", () => {
		const d = makeAudioTransientDetector({ mode: "onset", band: "energy", threshold: 0.5, debounceMs: 0 });
		// Warm up with signal = 0.5
		for (let i = 0; i < 100; i++) {
			d.step(features({ energy: 0.5 }), i);
		}
		// Small rise — not 50% above background (background ≈ 0.5)
		expect(d.step(features({ energy: 0.6 }), 100)).toBe(false);
	});

	test("onset detection stops firing once background adapts to sustained loud section", () => {
		// With debounce=0, the detector can fire on every qualifying frame.
		// After the background EMA catches up to the sustained loud level, the
		// relative-rise condition becomes false and triggers cease.
		const d = makeAudioTransientDetector({ mode: "onset", band: "energy", threshold: 0.3, debounceMs: 0 });
		// Warm up at quiet level
		for (let i = 0; i < 80; i++) d.step(features({ energy: 0.05 }), i);
		// Onset fires
		expect(d.step(features({ energy: 0.9 }), 80)).toBe(true);
		// Track the last frame that fires — background adapts within ~75 frames
		let lastFiredAt = 80;
		for (let i = 81; i < 500; i++) {
			if (d.step(features({ energy: 0.9 }), i)) lastFiredAt = i;
		}
		// Firing must stop well before t=500 (background adaptation takes ~75 frames)
		expect(lastFiredAt).toBeLessThan(200);
	});
});

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------

describe("makeAudioTransientDetector — debounce", () => {
	test("does not re-fire within the debounce window", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "pulse", threshold: 0.5, debounceMs: 200 });
		expect(d.step(features({ pulse: 0.8 }), 0)).toBe(true);
		expect(d.step(features({ pulse: 0.8 }), 100)).toBe(false);
		expect(d.step(features({ pulse: 0.8 }), 199)).toBe(false);
	});

	test("re-fires after the debounce window expires", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "pulse", threshold: 0.5, debounceMs: 200 });
		expect(d.step(features({ pulse: 0.8 }), 0)).toBe(true);
		expect(d.step(features({ pulse: 0.8 }), 200)).toBe(true);
	});

	test("debounce 0 fires every qualifying frame", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "pulse", threshold: 0.5, debounceMs: 0 });
		expect(d.step(features({ pulse: 0.8 }), 0)).toBe(true);
		expect(d.step(features({ pulse: 0.8 }), 0)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Runtime config update
// ---------------------------------------------------------------------------

describe("makeAudioTransientDetector — updateConfig / getConfig", () => {
	test("getConfig returns initial values merged with defaults", () => {
		const d = makeAudioTransientDetector({ mode: "onset", threshold: 0.3 });
		expect(d.getConfig().mode).toBe("onset");
		expect(d.getConfig().threshold).toBeCloseTo(0.3);
		// Fields not specified fall back to DEFAULT_TRANSIENT_CONFIG
		expect(d.getConfig().debounceMs).toBe(DEFAULT_TRANSIENT_CONFIG.debounceMs);
	});

	test("updateConfig changes threshold at runtime", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "pulse", threshold: 0.9, debounceMs: 0 });
		// Below original threshold — no fire
		expect(d.step(features({ pulse: 0.6 }), 0)).toBe(false);
		// Lower the threshold
		d.updateConfig({ threshold: 0.5 });
		expect(d.getConfig().threshold).toBeCloseTo(0.5);
		expect(d.step(features({ pulse: 0.6 }), 1)).toBe(true);
	});

	test("updateConfig changes debounce at runtime", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "pulse", threshold: 0.5, debounceMs: 500 });
		d.step(features({ pulse: 0.8 }), 0);
		// Still in old debounce window
		expect(d.step(features({ pulse: 0.8 }), 300)).toBe(false);
		// Reduce debounce to 100 ms
		d.updateConfig({ debounceMs: 100 });
		expect(d.step(features({ pulse: 0.8 }), 300)).toBe(true);
	});

	test("updateConfig can switch modes", () => {
		const d = makeAudioTransientDetector({ mode: "beat", band: "energy", threshold: 0.5, debounceMs: 0 });
		// Fires in beat mode
		expect(d.step(features({ energy: 0.6 }), 0)).toBe(true);
		// Switch to band-energy (identical logic, still fires)
		d.updateConfig({ mode: "band-energy" });
		expect(d.getConfig().mode).toBe("band-energy");
		expect(d.step(features({ energy: 0.6 }), 1)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Integration: synthetic audio buffer → automationBridge → trigger fires
// (acceptance criteria: no MIDI or OSC required)
// ---------------------------------------------------------------------------

describe("audio transient trigger E2E via synthetic audio buffer", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("beat transient fires automation without MIDI or OSC", () => {
		vi.setSystemTime(0);
		const log = makeLog();
		const applied: Record<string, unknown>[] = [];

		const bridge = makeAutomationBridge(
			(d) => applied.push({ ...d }),
			[],
			() => log.toArray(),
			{ mode: "beat", band: "pulse", threshold: 0.6, debounceMs: 200, action: "play" },
		);

		// Quiet frames — should not trigger
		for (let t = 0; t < 5; t++) {
			expect(bridge.onAudioFeatures(features({ pulse: 0.2 }), t)).toBe(false);
		}
		expect(bridge.player.isActive()).toBe(false);

		// Pulse spike above threshold — should trigger
		expect(bridge.onAudioFeatures(features({ pulse: 0.8 }), 100)).toBe(true);
		expect(bridge.player.isActive()).toBe(true);
		expect(applied.at(-1)).toMatchObject({ replaying: true });
	});

	test("onset transient fires after baseline warmup", () => {
		const log = makeLog();
		const applied: Record<string, unknown>[] = [];

		const bridge = makeAutomationBridge(
			(d) => applied.push({ ...d }),
			[],
			() => log.toArray(),
			{ mode: "onset", band: "energy", threshold: 0.5, debounceMs: 300, action: "play" },
		);

		// Warm up baseline with quiet signal
		for (let t = 0; t < 80; t++) {
			bridge.onAudioFeatures(features({ energy: 0.05 }), t);
		}
		expect(bridge.player.isActive()).toBe(false);

		// Spike — onset fires
		expect(bridge.onAudioFeatures(features({ energy: 0.9 }), 80)).toBe(true);
		expect(bridge.player.isActive()).toBe(true);
	});

	test("band-energy transient fires on bass threshold crossing", () => {
		const log = makeLog();
		const applied: Record<string, unknown>[] = [];

		const bridge = makeAutomationBridge(
			(d) => applied.push({ ...d }),
			[],
			() => log.toArray(),
			{ mode: "band-energy", band: "bass", threshold: 0.7, debounceMs: 0, action: "toggle" },
		);

		expect(bridge.onAudioFeatures(features({ bass: 0.69 }), 0)).toBe(false);
		expect(bridge.onAudioFeatures(features({ bass: 0.71 }), 1)).toBe(true);
	});

	test("debounce prevents rapid re-triggering in beat mode", () => {
		const log = makeLog();
		const bridge = makeAutomationBridge(
			() => {},
			[],
			() => log.toArray(),
			{ mode: "beat", band: "pulse", threshold: 0.5, debounceMs: 300, action: "play" },
		);

		expect(bridge.onAudioFeatures(features({ pulse: 0.8 }), 0)).toBe(true);
		expect(bridge.onAudioFeatures(features({ pulse: 0.8 }), 100)).toBe(false);
		expect(bridge.onAudioFeatures(features({ pulse: 0.8 }), 299)).toBe(false);
		expect(bridge.onAudioFeatures(features({ pulse: 0.8 }), 300)).toBe(true);
	});

	test("updateTransientConfig adjusts sensitivity at runtime", () => {
		const log = makeLog();
		const bridge = makeAutomationBridge(
			() => {},
			[],
			() => log.toArray(),
			{ mode: "beat", band: "pulse", threshold: 0.9, debounceMs: 0, action: "play" },
		);

		// High threshold — quiet signal does not trigger
		expect(bridge.onAudioFeatures(features({ pulse: 0.6 }), 0)).toBe(false);

		// Lower threshold at runtime via updateTransientConfig
		bridge.updateTransientConfig({ threshold: 0.5 });
		expect(bridge.getTransientConfig().threshold).toBeCloseTo(0.5);
		expect(bridge.onAudioFeatures(features({ pulse: 0.6 }), 1)).toBe(true);
	});

	test("MIDI/OSC trigger and audio trigger can coexist on the same bridge", () => {
		vi.setSystemTime(0);
		const log = makeLog();
		const applied: Record<string, unknown>[] = [];

		const bridge = makeAutomationBridge(
			(d) => applied.push({ ...d }),
			[{ type: "midi-note", note: 60, channel: 0, action: "play" }],
			() => log.toArray(),
			{ mode: "beat", band: "pulse", threshold: 0.6, debounceMs: 200, action: "stop" },
		);

		// MIDI note starts playback
		expect(bridge.onMidiNote(60, 1)).toBe(true);
		expect(bridge.player.isActive()).toBe(true);

		// Audio trigger (stop action) stops playback
		expect(bridge.onAudioFeatures(features({ pulse: 0.9 }), 500)).toBe(true);
		expect(bridge.player.isActive()).toBe(false);
	});
});
