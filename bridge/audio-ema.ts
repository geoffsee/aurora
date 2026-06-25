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

/** Musically sensible per-band defaults: bass is heavy, highs/pulse attack fast. */
export const DEFAULT_AUDIO_EMA_ALPHAS: Readonly<AudioEmaAlphas> = {
	bass: 0.08,
	energy: 0.12,
	mid: 0.15,
	high: 0.65,
	pulse: 0.85,
};

/**
 * Per-band RELEASE alphas: how fast each band fades when the signal drops below
 * its current level. high/pulse attack fast (catch transients) but release
 * slowly here, so when the audio dies out between songs they fade out gracefully
 * instead of snapping to zero. bass/mid/energy release at their attack rate.
 */
export const DEFAULT_AUDIO_EMA_RELEASE_ALPHAS: Readonly<AudioEmaAlphas> = {
	bass: 0.08,
	energy: 0.12,
	mid: 0.15,
	high: 0.12,
	pulse: 0.15,
};

export function makeAudioEmaState(): AudioFeatures {
	return { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
}

/**
 * Apply one EMA step with per-band alphas — mutates `state` in place and returns
 * it. When `releaseAlphas` is supplied, a band that is falling (raw below the
 * current state) uses its release alpha instead of its attack alpha, giving a
 * fast-attack / slow-release envelope. Omitting `releaseAlphas` keeps the
 * original symmetric behaviour.
 */
export function stepAudioEma(
	state: AudioFeatures,
	raw: Readonly<AudioFeatures>,
	alphas: Readonly<AudioEmaAlphas>,
	releaseAlphas?: Readonly<AudioEmaAlphas>,
): AudioFeatures {
	const step = (cur: number, target: number, attack: number, release: number) => {
		const a = target >= cur ? attack : release;
		return a * target + (1 - a) * cur;
	};
	state.energy = step(
		state.energy,
		raw.energy,
		alphas.energy,
		releaseAlphas?.energy ?? alphas.energy,
	);
	state.bass = step(
		state.bass,
		raw.bass,
		alphas.bass,
		releaseAlphas?.bass ?? alphas.bass,
	);
	state.mid = step(state.mid, raw.mid, alphas.mid, releaseAlphas?.mid ?? alphas.mid);
	state.high = step(
		state.high,
		raw.high,
		alphas.high,
		releaseAlphas?.high ?? alphas.high,
	);
	state.pulse = step(
		state.pulse,
		raw.pulse,
		alphas.pulse,
		releaseAlphas?.pulse ?? alphas.pulse,
	);
	return state;
}
