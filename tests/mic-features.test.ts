import { describe, expect, test } from "vitest";
import { makeAudioControlRouter } from "../audio-control-router.ts";
import type { AudioFeatures } from "../audio-ema.ts";
import {
	extractMicFeatures,
	micSecureContextError,
} from "../mic-features.ts";

// AnalyserNode defaults used by the controls page capture path.
const SAMPLE_RATE = 48000;
const FFT_SIZE = 2048;
const BINS = FFT_SIZE / 2; // getFloatFrequencyData length
const MIN_DB = -100;
const MAX_DB = -30;

// Build a dB spectrum that is "loud" (== MAX_DB) only inside [loHz, hiHz) and
// silent (== MIN_DB) elsewhere, matching getFloatFrequencyData semantics.
const spectrumInBand = (loHz: number, hiHz: number): Float32Array => {
	const hzPerBin = SAMPLE_RATE / FFT_SIZE;
	const arr = new Float32Array(BINS);
	for (let i = 0; i < BINS; i++) {
		const hz = i * hzPerBin;
		arr[i] = hz >= loHz && hz < hiHz ? MAX_DB : MIN_DB;
	}
	return arr;
};

const opts = {
	sampleRate: SAMPLE_RATE,
	fftSize: FFT_SIZE,
	minDecibels: MIN_DB,
	maxDecibels: MAX_DB,
};

const inRange01 = (f: AudioFeatures) =>
	Object.values(f).every((v) => Number.isFinite(v) && v >= 0 && v <= 1);

describe("micSecureContextError", () => {
	test("allows secure contexts and loopback hosts", () => {
		expect(
			micSecureContextError({ isSecureContext: true, hostname: "vj.example" }),
		).toBeNull();
		expect(
			micSecureContextError({ isSecureContext: false, hostname: "localhost" }),
		).toBeNull();
		expect(
			micSecureContextError({ isSecureContext: false, hostname: "127.0.0.1" }),
		).toBeNull();
	});

	test("blocks plain-HTTP LAN origins with an explicit message", () => {
		const err = micSecureContextError({
			isSecureContext: false,
			hostname: "192.168.1.42",
		});
		expect(err).toBeTypeOf("string");
		expect(err).toContain("192.168.1.42");
		expect(err).toMatch(/HTTPS or localhost/i);
	});
});

describe("extractMicFeatures", () => {
	test("always returns all five bands clamped to 0..1", () => {
		expect(inRange01(extractMicFeatures(spectrumInBand(0, 9999), opts))).toBe(
			true,
		);
		// Degenerate inputs degrade to silence rather than NaN/throw.
		expect(extractMicFeatures(new Float32Array(0), opts)).toEqual({
			energy: 0,
			bass: 0,
			mid: 0,
			high: 0,
			pulse: 0,
		});
		expect(
			extractMicFeatures(spectrumInBand(0, 9999), { ...opts, sampleRate: 0 }),
		).toEqual({ energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 });
	});

	test("routes energy into the band whose frequency range is excited", () => {
		const bass = extractMicFeatures(spectrumInBand(20, 250), opts);
		expect(bass.bass).toBeGreaterThan(0.9);
		expect(bass.mid).toBe(0);
		expect(bass.high).toBe(0);

		const high = extractMicFeatures(spectrumInBand(2000, 8000), opts);
		expect(high.high).toBeGreaterThan(0.9);
		expect(high.bass).toBe(0);
		// pulse is the high-band peak, so a loud high band lights pulse too.
		expect(high.pulse).toBeGreaterThan(0.9);
	});

	test("normalises decibels across [minDecibels, maxDecibels]", () => {
		// A flat spectrum at the midpoint dB → ~0.5 everywhere.
		const mid = new Float32Array(BINS).fill((MIN_DB + MAX_DB) / 2);
		const f = extractMicFeatures(mid, opts);
		expect(f.energy).toBeCloseTo(0.5, 5);
		expect(f.bass).toBeCloseTo(0.5, 5);
	});
});

describe("router contract", () => {
	// The whole point of Phase 2 is that extracted mic features drive the same
	// Phase-1 router as the demo loop. Feed real extractor output through the
	// router and assert it produces the expected continuous + threshold diffs.
	test("extracted features drive continuous and threshold mappings", () => {
		const state: Record<string, unknown> = { flashVersion: 0 };
		const diffs: Record<string, unknown>[] = [];
		const router = makeAudioControlRouter(
			(diff) => {
				diffs.push(diff);
				Object.assign(state, diff);
			},
			() => state,
		);
		router.setMappings([
			{
				source: "energy",
				target: "intensity",
				mode: "continuous",
				targetMin: 0,
				targetMax: 1,
				level: 0.5,
				offDelayMs: 200,
				increment: false,
			},
			{
				source: "pulse",
				target: "flashVersion",
				mode: "threshold",
				targetMin: 0,
				targetMax: 1,
				level: 0.75,
				offDelayMs: 200,
				increment: true,
			},
		]);
		router.setEnabled(true);

		// Loud high band → high pulse → threshold fires; broadband energy moves
		// the continuous intensity mapping.
		const loud = extractMicFeatures(spectrumInBand(0, 9999), opts);
		expect(router.onFeatures(loud, 0)).toBe(true);
		expect(state.flashVersion).toBe(1);
		expect(typeof state.intensity).toBe("number");
		expect(state.intensity as number).toBeGreaterThan(0);

		// Silence: pulse drops below level, so a later loud frame is a fresh edge.
		router.onFeatures(extractMicFeatures(spectrumInBand(0, 0), opts), 500);
		expect(router.onFeatures(loud, 800)).toBe(true);
		expect(state.flashVersion).toBe(2);
	});
});
