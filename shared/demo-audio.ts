/** Synthetic audio features matching the bridge demo loop (`bridge/index.ts`). */

export type DemoAudioFrame = {
	tempo: number;
	beat: number;
	deckA: number;
	deckB: number;
	energy: number;
	bass: number;
	mid: number;
	high: number;
	pulse: number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function generateDemoAudioFrame(
	bpm: number,
	nowSeconds: number,
): DemoAudioFrame {
	const tempo = Math.max(40, Math.min(240, bpm));
	const beat = ((nowSeconds * tempo) / 60) % 4;
	const energy =
		0.45 +
		Math.sin(nowSeconds * 2.1) * 0.2 +
		Math.max(0, Math.sin(nowSeconds * 8.0)) * 0.25;

	return {
		tempo,
		beat,
		deckA: clamp(0.48 + Math.sin(nowSeconds * 1.7) * 0.42, 0, 1),
		deckB: clamp(0.48 + Math.cos(nowSeconds * 1.35) * 0.42, 0, 1),
		energy: clamp(energy, 0, 1),
		bass: clamp(0.56 + Math.sin(nowSeconds * 2.4) * 0.36, 0, 1),
		mid: clamp(0.45 + Math.sin(nowSeconds * 3.1 + 1.4) * 0.3, 0, 1),
		high: clamp(Math.max(0, Math.sin(nowSeconds * 12.0)) * 0.9, 0, 1),
		pulse: beat < 0.18 ? 1 : Math.max(0, 1 - beat / 0.42),
	};
}

export const DEMO_AUDIO_INTERVAL_MS = 50;
