import { describe, expect, test } from "vitest";
import { makeAudioControlRouter } from "../../bridge/audio-control-router.ts";
import type { AudioFeatures } from "../../bridge/audio-ema.ts";
import {
	extractMicFeatures,
	micSecureContextError,
} from "../../bridge/mic-features.ts";

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

// ── controls.html inline parity ───────────────────────────────────────────────
// The code that actually ships is the inline copy of extractMicFeatures /
// micSecureContextError in controls.html, but the tests above only exercise the
// mic-features.ts module. These replicas are byte-faithful transcriptions of the
// controls.html inline functions; asserting they match the module across a range
// of inputs guards the two copies against silent drift (same hazard the preset
// bundle solved with a parity test — see AGENTS.md). If you edit either copy,
// update this replica so the divergence shows up here instead of in production.

const INLINE_MIC_MIN_DB = -100;
const INLINE_MIC_MAX_DB = -30;
const INLINE_MIC_BANDS = {
	bass: [20, 250] as const,
	mid: [250, 2000] as const,
	high: [2000, 8000] as const,
} as const;

const inlineClamp = (
	value: number,
	min: number,
	max: number,
	fallback = min,
) => {
	const number = Number(value);
	return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
};
const inlineClamp01 = (value: number) => inlineClamp(value, 0, 1, 0);

// Mirror of micSecureContextError() in controls.html.
function inlineSecureContextError(
	isSecureContext: boolean,
	hostname: string,
): string | null {
	if (isSecureContext) return null;
	const host = hostname;
	if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
		return null;
	}
	return (
		`Live mic capture needs a secure context: this page is served from ` +
		`"${host || "an insecure origin"}" over plain HTTP. Browsers only allow ` +
		`getUserMedia on HTTPS or localhost. Open the controls page via localhost ` +
		`or terminate TLS / use a localhost tunnel for LAN deployments.`
	);
}

// Mirror of extractMicFeatures() in controls.html.
function inlineExtractMicFeatures(
	freqDb: ArrayLike<number>,
	sampleRate: number,
	fftSize: number,
): AudioFeatures {
	const span = INLINE_MIC_MAX_DB - INLINE_MIC_MIN_DB;
	const bins = freqDb.length;
	if (bins === 0 || span <= 0 || !(sampleRate > 0) || !(fftSize > 0)) {
		return { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
	}
	const hzPerBin = sampleRate / fftSize;
	let energySum = 0,
		bassSum = 0,
		bassCount = 0,
		midSum = 0,
		midCount = 0;
	let highSum = 0,
		highCount = 0,
		highPeak = 0;
	for (let i = 0; i < bins; i++) {
		const norm = inlineClamp01(((freqDb[i] ?? INLINE_MIC_MIN_DB) - INLINE_MIC_MIN_DB) / span);
		energySum += norm;
		const hz = i * hzPerBin;
		if (hz >= INLINE_MIC_BANDS.bass[0] && hz < INLINE_MIC_BANDS.bass[1]) {
			bassSum += norm;
			bassCount++;
		} else if (hz >= INLINE_MIC_BANDS.mid[0] && hz < INLINE_MIC_BANDS.mid[1]) {
			midSum += norm;
			midCount++;
		} else if (
			hz >= INLINE_MIC_BANDS.high[0] &&
			hz < INLINE_MIC_BANDS.high[1]
		) {
			highSum += norm;
			highCount++;
			if (norm > highPeak) highPeak = norm;
		}
	}
	return {
		energy: inlineClamp01(energySum / bins),
		bass: bassCount ? inlineClamp01(bassSum / bassCount) : 0,
		mid: midCount ? inlineClamp01(midSum / midCount) : 0,
		high: highCount ? inlineClamp01(highSum / highCount) : 0,
		pulse: highPeak,
	};
}

describe("controls.html inline parity", () => {
	test("extractMicFeatures matches the module across representative spectra", () => {
		const spectra: Float32Array[] = [
			spectrumInBand(0, 9999),
			spectrumInBand(20, 250),
			spectrumInBand(250, 2000),
			spectrumInBand(2000, 8000),
			spectrumInBand(0, 0),
			new Float32Array(BINS).fill((MIN_DB + MAX_DB) / 2),
			new Float32Array(0),
		];
		for (const spectrum of spectra) {
			expect(
				inlineExtractMicFeatures(spectrum, SAMPLE_RATE, FFT_SIZE),
			).toEqual(extractMicFeatures(spectrum, opts));
		}
		// Degenerate config degrades identically in both copies.
		expect(inlineExtractMicFeatures(spectrumInBand(0, 9999), 0, FFT_SIZE)).toEqual(
			extractMicFeatures(spectrumInBand(0, 9999), { ...opts, sampleRate: 0 }),
		);
	});

	test("micSecureContextError matches the module across host/context combos", () => {
		const cases: Array<[boolean, string]> = [
			[true, "vj.example"],
			[false, "localhost"],
			[false, "127.0.0.1"],
			[false, "[::1]"],
			[false, "192.168.1.42"],
			[false, ""],
		];
		for (const [isSecureContext, hostname] of cases) {
			expect(inlineSecureContextError(isSecureContext, hostname)).toBe(
				micSecureContextError({ isSecureContext, hostname }),
			);
		}
	});
});
