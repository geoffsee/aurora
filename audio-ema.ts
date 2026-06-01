export const DEFAULT_AUDIO_EMA_ALPHA = 0.15;

export type AudioFeatures = {
	energy: number;
	bass: number;
	mid: number;
	high: number;
	pulse: number;
};

export type AudioEmaAlphas = {
	energy: number;
	bass: number;
	mid: number;
	high: number;
	pulse: number;
};

/** Musically sensible per-band defaults: longer decay for bass, shorter for highs. */
export const DEFAULT_AUDIO_EMA_ALPHAS: Readonly<AudioEmaAlphas> = {
	bass: 0.08,
	energy: 0.12,
	mid: 0.15,
	high: 0.22,
	pulse: 0.28,
};

export function makeAudioEmaState(): AudioFeatures {
	return { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
}

/** Apply one EMA step with per-band alphas — mutates `state` in place and returns it. */
export function stepAudioEma(
	state: AudioFeatures,
	raw: Readonly<AudioFeatures>,
	alphas: Readonly<AudioEmaAlphas>,
): AudioFeatures {
	state.energy = alphas.energy * raw.energy + (1 - alphas.energy) * state.energy;
	state.bass = alphas.bass * raw.bass + (1 - alphas.bass) * state.bass;
	state.mid = alphas.mid * raw.mid + (1 - alphas.mid) * state.mid;
	state.high = alphas.high * raw.high + (1 - alphas.high) * state.high;
	state.pulse = alphas.pulse * raw.pulse + (1 - alphas.pulse) * state.pulse;
	return state;
}
