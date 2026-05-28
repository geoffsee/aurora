export const MIDI_CLOCK_TICK = 0xf8;
export const MIDI_CLOCKS_PER_BEAT = 24;
export const MIDI_CLOCK_WINDOW = 24;
export const MIDI_CLOCK_TIMEOUT_MS = 2000;

/**
 * Derives BPM from a sliding window of MIDI clock timestamps (milliseconds).
 * Returns null when there is insufficient data or the result falls outside [40, 240].
 */
export function deriveBpmFromTimestamps(timestamps: readonly number[]): number | null {
	if (timestamps.length < 3) return null;
	const oldest = timestamps[0] as number;
	const newest = timestamps[timestamps.length - 1] as number;
	const spanMs = newest - oldest;
	const clocks = timestamps.length - 1;
	const bpm = 60000 / ((spanMs / clocks) * MIDI_CLOCKS_PER_BEAT);
	if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) return null;
	return bpm;
}
