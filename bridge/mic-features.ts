import type { AudioFeatures } from "./audio-ema.ts";

// ──────────────────────────────────────────────────────────────────────────
// Mic Features — Phase 2 of "Audio as the Only Controller"
// (design spike: docs/spikes/audio-as-controller.md)
//
// Pure, DOM-free feature extraction for browser-native microphone capture.
// The controls page wires `getUserMedia` → AudioContext → AnalyserNode and on
// each tick hands the AnalyserNode's frequency-domain magnitudes here. The
// resulting AudioFeatures are sent over the WS as `/aurora/audio/features`,
// feeding the same Phase-1 router contract (audio-control-router.ts) that the
// demo loop and live AbletonOSC path already use.
//
// This module is the testable mirror of the controls app capture math in
// web/controls/lib/mic.ts. Keep the two in sync — the controls-page copy must produce identical output so the unit
// tests here are a faithful contract check on what the browser ships.
// ──────────────────────────────────────────────────────────────────────────

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Band edges in Hz. Bins falling in each [lo, hi) range average into the band.
const BANDS = {
	bass: [20, 250],
	mid: [250, 2000],
	high: [2000, 8000],
} as const;

// Natural music spectra roll off toward higher frequencies (roughly pink, ~-3dB
// per octave, often steeper), and the wide high band averages many near-silent
// bins — so the raw averages come out bass >> mid >> high and the highs read as
// ~0. These per-band gains tilt the three bands back toward parity so the
// spectrum spreads evenly. bass is the reference (1.0); mid/high are lifted to
// compensate the rolloff plus the averaging dilution. Applied to the band
// values (and the high-band peak that feeds `pulse`), then re-clamped to 0..1.
// `high` reads the band *peak* (see HIGH_PEAK_BIAS), which is already several
// times larger than the diluted mean — so it needs only a gentle gain, not the
// big dilution-compensation factor mid (a mean) still needs. A larger high gain
// here just slams the meter to 1.0 on every hi-hat and then bleeds off.
const BAND_GAIN = {
	bass: 10 ** (-10 / 20), // -10 dB: pull the dominant low end back down
	mid: 10 ** (-10 / 20), // -10 dB: same trim on the mids
	high: 1.4 * 10 ** (-10 / 20), // peak-biased base, then -10 dB trim
} as const;

// The high band (2-8kHz) is wide and music rarely fills its top end, so a flat
// mean is dragged to ~0 by the dead upper bins. Bias the high value toward the
// band's loudest bin (peak) so hi-hats/cymbals actually register instead of
// being averaged away. 0 = pure mean, 1 = pure peak.
const HIGH_PEAK_BIAS = 0.65;

export type MicSecureContextInput = {
	isSecureContext: boolean;
	hostname: string;
};

/**
 * `getUserMedia` only resolves in a SECURE CONTEXT — an HTTPS origin or a
 * loopback host (`localhost`/`127.0.0.1`/`[::1]`). Serving the controls page
 * from a bare LAN IP over plain HTTP (e.g. `192.168.x.x:3001` at a rehearsal)
 * makes capture reject, historically with an opaque error. Call this before
 * requesting the mic and surface the returned message so the failure mode is
 * explicit rather than a silent dead toggle.
 *
 * Returns `null` when capture is allowed, or a human-readable reason string
 * when it is blocked.
 */
export function micSecureContextError(
	ctx: MicSecureContextInput,
): string | null {
	if (ctx.isSecureContext) return null;
	const host = ctx.hostname;
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

export type ExtractMicFeaturesOptions = {
	/** AudioContext sample rate (Hz), e.g. 48000. */
	sampleRate: number;
	/** AnalyserNode.fftSize (the time-domain window; bins = fftSize / 2). */
	fftSize: number;
	/** AnalyserNode.minDecibels (dB value mapping to 0). Default -100. */
	minDecibels?: number;
	/** AnalyserNode.maxDecibels (dB value mapping to 1). Default -30. */
	maxDecibels?: number;
};

/**
 * Derive `AudioFeatures` (energy/bass/mid/high/pulse, each 0..1) from a single
 * frame of `AnalyserNode.getFloatFrequencyData` output — an array of per-bin
 * magnitudes in decibels (typically minDecibels..maxDecibels, ~ -100..-30).
 *
 * Each dB bin is normalised to 0..1 across [minDecibels, maxDecibels]. Bands
 * average the normalised bins whose centre frequency lands in their range.
 * `energy` is the broadband average; `pulse` is the *peak* normalised bin in
 * the high band, a per-frame sharpness proxy the router's threshold mode reads
 * as transient onsets. All outputs are clamped to 0..1, so the result always
 * satisfies the router/coerce contract regardless of analyser configuration.
 */
export function extractMicFeatures(
	freqDb: ArrayLike<number>,
	opts: ExtractMicFeaturesOptions,
): AudioFeatures {
	const minDb = opts.minDecibels ?? -100;
	const maxDb = opts.maxDecibels ?? -30;
	const span = maxDb - minDb;
	const bins = freqDb.length;

	if (bins === 0 || span <= 0 || !(opts.sampleRate > 0) || !(opts.fftSize > 0)) {
		return { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
	}

	// getFloatFrequencyData yields fftSize/2 bins spanning 0..Nyquist. Each bin i
	// is centred at i * sampleRate / fftSize.
	const hzPerBin = opts.sampleRate / opts.fftSize;

	let energySum = 0;
	let bassSum = 0;
	let bassCount = 0;
	let midSum = 0;
	let midCount = 0;
	let highSum = 0;
	let highCount = 0;
	let highPeak = 0;

	for (let i = 0; i < bins; i++) {
		const norm = clamp01(((freqDb[i] ?? minDb) - minDb) / span);
		energySum += norm;
		const hz = i * hzPerBin;
		if (hz >= BANDS.bass[0] && hz < BANDS.bass[1]) {
			bassSum += norm;
			bassCount++;
		} else if (hz >= BANDS.mid[0] && hz < BANDS.mid[1]) {
			midSum += norm;
			midCount++;
		} else if (hz >= BANDS.high[0] && hz < BANDS.high[1]) {
			highSum += norm;
			highCount++;
			if (norm > highPeak) highPeak = norm;
		}
	}

	const highMean = highCount ? highSum / highCount : 0;
	const highValue = highMean * (1 - HIGH_PEAK_BIAS) + highPeak * HIGH_PEAK_BIAS;

	return {
		energy: clamp01(energySum / bins),
		bass: bassCount ? clamp01((bassSum / bassCount) * BAND_GAIN.bass) : 0,
		mid: midCount ? clamp01((midSum / midCount) * BAND_GAIN.mid) : 0,
		high: highCount ? clamp01(highValue * BAND_GAIN.high) : 0,
		pulse: clamp01(highPeak * BAND_GAIN.high),
	};
}
