import { describe, expect, test } from "vitest";
import {
	DEFAULT_AUDIO_EMA_ALPHA,
	DEFAULT_AUDIO_EMA_ALPHAS,
	type AudioEmaAlphas,
	makeAudioEmaState,
	stepAudioEma,
} from "../../bridge/audio-ema.ts";

/** Build a uniform AudioEmaAlphas with the same value for all bands. */
function uniform(alpha: number): AudioEmaAlphas {
	return { energy: alpha, bass: alpha, mid: alpha, high: alpha, pulse: alpha };
}

describe("makeAudioEmaState", () => {
	test("initialises all fields to zero", () => {
		const s = makeAudioEmaState();
		expect(s.energy).toBe(0);
		expect(s.bass).toBe(0);
		expect(s.mid).toBe(0);
		expect(s.high).toBe(0);
		expect(s.pulse).toBe(0);
	});
});

describe("stepAudioEma", () => {
	test("alpha=1 passes through raw values exactly", () => {
		const state = makeAudioEmaState();
		const raw = { energy: 0.8, bass: 0.6, mid: 0.4, high: 0.2, pulse: 1 };
		stepAudioEma(state, raw, uniform(1));
		expect(state.energy).toBeCloseTo(0.8);
		expect(state.bass).toBeCloseTo(0.6);
		expect(state.mid).toBeCloseTo(0.4);
		expect(state.high).toBeCloseTo(0.2);
		expect(state.pulse).toBeCloseTo(1);
	});

	test("alpha=0 holds state unchanged", () => {
		const state = makeAudioEmaState();
		state.energy = 0.5;
		state.bass = 0.3;
		stepAudioEma(
			state,
			{ energy: 1, bass: 1, mid: 1, high: 1, pulse: 1 },
			uniform(0),
		);
		expect(state.energy).toBeCloseTo(0.5);
		expect(state.bass).toBeCloseTo(0.3);
		expect(state.mid).toBeCloseTo(0);
	});

	test("single step with alpha=0.5 averages previous and raw", () => {
		const state = makeAudioEmaState();
		stepAudioEma(
			state,
			{ energy: 1, bass: 1, mid: 1, high: 1, pulse: 1 },
			uniform(0.5),
		);
		// 0.5 * 1 + 0.5 * 0 = 0.5
		expect(state.energy).toBeCloseTo(0.5);
		stepAudioEma(
			state,
			{ energy: 1, bass: 1, mid: 1, high: 1, pulse: 1 },
			uniform(0.5),
		);
		// 0.5 * 1 + 0.5 * 0.5 = 0.75
		expect(state.energy).toBeCloseTo(0.75);
	});

	test("converges within 5% of target after 30 steps at default alpha", () => {
		const state = makeAudioEmaState();
		const target = { energy: 1, bass: 1, mid: 1, high: 1, pulse: 1 };
		for (let i = 0; i < 30; i++) {
			stepAudioEma(state, target, uniform(DEFAULT_AUDIO_EMA_ALPHA));
		}
		expect(state.energy).toBeGreaterThan(0.95);
		expect(state.bass).toBeGreaterThan(0.95);
		expect(state.mid).toBeGreaterThan(0.95);
		expect(state.high).toBeGreaterThan(0.95);
		expect(state.pulse).toBeGreaterThan(0.95);
	});

	test("decays toward zero when raw is zero", () => {
		const state = makeAudioEmaState();
		state.energy = 1;
		const zero = { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
		for (let i = 0; i < 30; i++) {
			stepAudioEma(state, zero, uniform(DEFAULT_AUDIO_EMA_ALPHA));
		}
		expect(state.energy).toBeLessThan(0.05);
	});

	test("mutates and returns the same state object", () => {
		const state = makeAudioEmaState();
		const returned = stepAudioEma(
			state,
			{ energy: 1, bass: 1, mid: 1, high: 1, pulse: 1 },
			uniform(0.5),
		);
		expect(returned).toBe(state);
	});

	test("release alphas fade slower than attack on falling bands", () => {
		// Attack fast, release slow: a band shoots up quickly but, once the signal
		// drops, fades gently instead of snapping to zero (the between-songs case).
		const state = makeAudioEmaState();
		const attack = uniform(0.8);
		const release = uniform(0.1);
		// Rising: uses the fast attack alpha.
		stepAudioEma(state, { energy: 1, bass: 1, mid: 1, high: 1, pulse: 1 }, attack, release);
		expect(state.high).toBeCloseTo(0.8);
		// Falling: uses the slow release alpha, so most of the signal is retained.
		stepAudioEma(state, { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 }, attack, release);
		expect(state.high).toBeCloseTo(0.8 * (1 - 0.1));
	});

	test("omitting release alphas keeps symmetric attack/release", () => {
		const state = makeAudioEmaState();
		state.high = 1;
		stepAudioEma(state, { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 }, uniform(0.5));
		expect(state.high).toBeCloseTo(0.5);
	});

	test("per-band alphas apply independently", () => {
		const state = makeAudioEmaState();
		const raw = { energy: 1, bass: 1, mid: 1, high: 1, pulse: 1 };
		const alphas: AudioEmaAlphas = {
			energy: 0.1,
			bass: 0.5,
			mid: 0.3,
			high: 0.8,
			pulse: 1.0,
		};
		stepAudioEma(state, raw, alphas);
		expect(state.energy).toBeCloseTo(0.1);
		expect(state.bass).toBeCloseTo(0.5);
		expect(state.mid).toBeCloseTo(0.3);
		expect(state.high).toBeCloseTo(0.8);
		expect(state.pulse).toBeCloseTo(1.0);
	});

	test("bass decays slower than high at default alphas", () => {
		// After N steps decaying to zero, bass should retain more signal than high
		const state = makeAudioEmaState();
		state.bass = 1;
		state.high = 1;
		const zero = { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
		for (let i = 0; i < 20; i++) {
			stepAudioEma(state, zero, DEFAULT_AUDIO_EMA_ALPHAS);
		}
		expect(state.bass).toBeGreaterThan(state.high);
	});
});

describe("DEFAULT_AUDIO_EMA_ALPHA", () => {
	test("is a finite number strictly between 0 and 1", () => {
		expect(DEFAULT_AUDIO_EMA_ALPHA).toBeGreaterThan(0);
		expect(DEFAULT_AUDIO_EMA_ALPHA).toBeLessThan(1);
		expect(Number.isFinite(DEFAULT_AUDIO_EMA_ALPHA)).toBe(true);
	});
});

describe("DEFAULT_AUDIO_EMA_ALPHAS", () => {
	test("all band alphas are finite numbers strictly between 0 and 1", () => {
		for (const [band, alpha] of Object.entries(DEFAULT_AUDIO_EMA_ALPHAS)) {
			expect(Number.isFinite(alpha), `${band} alpha must be finite`).toBe(true);
			expect(alpha, `${band} alpha must be > 0`).toBeGreaterThan(0);
			expect(alpha, `${band} alpha must be < 1`).toBeLessThan(1);
		}
	});

	test("bass alpha is smaller than high alpha (longer bass decay)", () => {
		expect(DEFAULT_AUDIO_EMA_ALPHAS.bass).toBeLessThan(
			DEFAULT_AUDIO_EMA_ALPHAS.high,
		);
	});

	test("bass alpha is smaller than mid alpha", () => {
		expect(DEFAULT_AUDIO_EMA_ALPHAS.bass).toBeLessThan(
			DEFAULT_AUDIO_EMA_ALPHAS.mid,
		);
	});
});
