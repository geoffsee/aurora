import type { ControlState, OscMeters } from "./types.ts";
import { average, clamp01 } from "./math.ts";

export function trackDataValueStart(args: unknown[]): number {
	const fieldIndex = args.findIndex(
		(arg) =>
			typeof arg === "string" &&
			(arg === "track.output_meter_level" || arg.startsWith("track.")),
	);
	if (fieldIndex >= 0) return fieldIndex + 1;

	const allNumeric = args.every((arg) => Number.isFinite(Number(arg)));
	if (allNumeric && args.length >= 3) {
		const start = Number(args[0]);
		const count = Number(args[1]);
		if (
			Number.isInteger(start) &&
			Number.isInteger(count) &&
			count > 0 &&
			count <= args.length - 2
		) {
			return 2;
		}
	}
	if (allNumeric && args.length <= 32) return 0;

	return Math.min(2, args.length);
}

export function applyTrackData(
	args: unknown[],
	state: ControlState,
	osc: OscMeters,
) {
	const valueStart = trackDataValueStart(args);
	const values = args
		.slice(valueStart)
		.filter((value) => Number.isFinite(Number(value)))
		.slice(0, 32)
		.map((v) => clamp01(v));
	if (!values.length) return;

	const mapping = state.trackMapping;
	const mappedAverage = (start: number, count: number) =>
		average(values.slice(start, start + Math.max(1, count)));
	const mappedTrack = (index: number, fallback: number) =>
		Number.isFinite(values[index]) ? (values[index] as number) : fallback;
	const avg = average(values);
	const peak = Math.max(avg, ...values);
	const energyTarget = peak * 0.72 + avg * 0.28;
	const transient = Math.max(0, energyTarget - osc.previousEnergy);
	const now = performance.now();
	const dtMs = Math.max(16, Math.min(250, now - (osc.lastEnvelopeAt || now)));

	// Assign raw mapped meter values directly for a jagged, extremely responsive display.
	// EMA smoothing is applied upstream (bridge automation) and for visual rendering;
	// the meters panel should reflect the incoming signal without additional lag.
	osc.lastFrameAt = now;
	osc.energy = energyTarget;
	osc.bass = mappedTrack(mapping.bassTrack, energyTarget);
	osc.mid = mappedTrack(mapping.midTrack, avg);
	osc.high = Math.max(
		mappedTrack(mapping.highTrack, 0),
		Math.min(1, transient * 2.2),
	);
	osc.deckA = mappedAverage(mapping.deckAStart, mapping.deckACount) || avg;
	osc.deckB = mappedAverage(mapping.deckBStart, mapping.deckBCount) || avg;
	osc.previousEnergy = energyTarget;
	osc.lastEnvelopeAt = now;
}

export function applyBrowserAudio(
	frame: Record<string, unknown>,
	osc: OscMeters,
) {
	const energy = clamp01(frame.energy);
	const now = performance.now();
	osc.lastFrameAt = now;
	osc.lastBrowserAudioAt = now;
	osc.energy = energy;
	osc.bass = clamp01(frame.bass);
	osc.mid = clamp01(frame.mid);
	osc.high = clamp01(frame.high);
	osc.deckA = energy;
	osc.deckB = energy;
	osc.previousEnergy = energy;
	osc.lastEnvelopeAt = now;
}

export function applyDemo(
	frame: Record<string, unknown>,
	osc: OscMeters,
) {
	osc.lastFrameAt = performance.now();
	osc.energy = clamp01(frame.energy);
	osc.bass = clamp01(frame.bass);
	osc.mid = clamp01(frame.mid);
	osc.high = clamp01(frame.high);
	osc.deckA = clamp01(frame.deckA);
	osc.deckB = clamp01(frame.deckB);
}
