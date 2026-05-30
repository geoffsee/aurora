export const DEFAULT_AUDIO_EMA_ALPHA = 0.15;

export type AudioFeatures = {
	energy: number;
	bass: number;
	mid: number;
	high: number;
	pulse: number;
};

export function makeAudioEmaState(): AudioFeatures {
	return { energy: 0, bass: 0, mid: 0, high: 0, pulse: 0 };
}

/** Apply one EMA step — mutates `state` in place and returns it. */
export function stepAudioEma(
	state: AudioFeatures,
	raw: Readonly<AudioFeatures>,
	alpha: number,
): AudioFeatures {
	const beta = 1 - alpha;
	state.energy = alpha * raw.energy + beta * state.energy;
	state.bass = alpha * raw.bass + beta * state.bass;
	state.mid = alpha * raw.mid + beta * state.mid;
	state.high = alpha * raw.high + beta * state.high;
	state.pulse = alpha * raw.pulse + beta * state.pulse;
	return state;
}
