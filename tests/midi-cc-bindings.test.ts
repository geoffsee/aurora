import { describe, expect, test } from "vitest";

// Mirrors the inline controls.html MIDI CC binding logic for unit testing.
type MidiCcBinding = {
	cc: number;
	channel: number;
	param: string;
	ccMin: number;
	ccMax: number;
	paramMin: number;
	paramMax: number;
};

function scaleCcToParam(ccValue: number, binding: MidiCcBinding): number {
	const { ccMin, ccMax, paramMin, paramMax } = binding;
	const range = ccMax - ccMin;
	if (range === 0) return paramMin;
	const t = Math.max(0, Math.min(1, (ccValue - ccMin) / range));
	return paramMin + t * (paramMax - paramMin);
}

function matchesBinding(
	ccNumber: number,
	ccChannel: number,
	binding: MidiCcBinding,
): boolean {
	if (binding.cc !== ccNumber) return false;
	if (binding.channel !== 0 && binding.channel !== ccChannel) return false;
	return true;
}

describe("scaleCcToParam", () => {
	test("maps CC 0 to paramMin with full range", () => {
		const b: MidiCcBinding = {
			cc: 74, channel: 0, param: "intensity",
			ccMin: 0, ccMax: 127, paramMin: 0.05, paramMax: 1.5,
		};
		expect(scaleCcToParam(0, b)).toBeCloseTo(0.05, 5);
	});

	test("maps CC 127 to paramMax with full range", () => {
		const b: MidiCcBinding = {
			cc: 74, channel: 0, param: "intensity",
			ccMin: 0, ccMax: 127, paramMin: 0.05, paramMax: 1.5,
		};
		expect(scaleCcToParam(127, b)).toBeCloseTo(1.5, 5);
	});

	test("maps midpoint CC correctly", () => {
		const b: MidiCcBinding = {
			cc: 1, channel: 0, param: "crossfade",
			ccMin: 0, ccMax: 100, paramMin: 0, paramMax: 1,
		};
		expect(scaleCcToParam(50, b)).toBeCloseTo(0.5, 5);
	});

	test("clamps CC below ccMin to paramMin", () => {
		const b: MidiCcBinding = {
			cc: 7, channel: 0, param: "feedback",
			ccMin: 20, ccMax: 100, paramMin: 0, paramMax: 1,
		};
		expect(scaleCcToParam(0, b)).toBeCloseTo(0, 5);
	});

	test("clamps CC above ccMax to paramMax", () => {
		const b: MidiCcBinding = {
			cc: 7, channel: 0, param: "feedback",
			ccMin: 20, ccMax: 100, paramMin: 0, paramMax: 1,
		};
		expect(scaleCcToParam(127, b)).toBeCloseTo(1, 5);
	});

	test("zero CC range returns paramMin without division-by-zero", () => {
		const b: MidiCcBinding = {
			cc: 1, channel: 0, param: "depth",
			ccMin: 64, ccMax: 64, paramMin: 0.5, paramMax: 0.5,
		};
		expect(scaleCcToParam(64, b)).toBe(0.5);
	});

	test("inverted range: CC floor maps to paramMin, CC ceiling maps to paramMax", () => {
		// ccMin=127, ccMax=0: pulling the fader down increases the parameter
		const b: MidiCcBinding = {
			cc: 1, channel: 0, param: "crossfade",
			ccMin: 127, ccMax: 0, paramMin: 0, paramMax: 1,
		};
		expect(scaleCcToParam(127, b)).toBeCloseTo(0, 5);
		expect(scaleCcToParam(0, b)).toBeCloseTo(1, 5);
	});

	test("non-zero paramMin is preserved at CC floor", () => {
		const b: MidiCcBinding = {
			cc: 7, channel: 0, param: "bpm",
			ccMin: 0, ccMax: 127, paramMin: 60, paramMax: 180,
		};
		expect(scaleCcToParam(0, b)).toBeCloseTo(60, 5);
		expect(scaleCcToParam(127, b)).toBeCloseTo(180, 5);
	});

	test("partial CC range scales correctly within param range", () => {
		// Only use CC 64-127 to sweep the full param range
		const b: MidiCcBinding = {
			cc: 1, channel: 0, param: "speed",
			ccMin: 64, ccMax: 127, paramMin: 0.1, paramMax: 3,
		};
		expect(scaleCcToParam(64, b)).toBeCloseTo(0.1, 4);
		expect(scaleCcToParam(127, b)).toBeCloseTo(3, 4);
		// Midpoint of 64-127 is ~95.5; at CC=95 we expect ~midpoint of 0.1-3
		const mid = 0.1 + ((95 - 64) / (127 - 64)) * (3 - 0.1);
		expect(scaleCcToParam(95, b)).toBeCloseTo(mid, 4);
	});
});

describe("MIDI CC binding channel matching", () => {
	test("omni channel (0) matches any incoming MIDI channel", () => {
		const b: MidiCcBinding = {
			cc: 74, channel: 0, param: "intensity",
			ccMin: 0, ccMax: 127, paramMin: 0, paramMax: 1,
		};
		expect(matchesBinding(74, 1, b)).toBe(true);
		expect(matchesBinding(74, 7, b)).toBe(true);
		expect(matchesBinding(74, 16, b)).toBe(true);
	});

	test("specific channel only matches that channel", () => {
		const b: MidiCcBinding = {
			cc: 7, channel: 2, param: "feedback",
			ccMin: 0, ccMax: 127, paramMin: 0, paramMax: 1,
		};
		expect(matchesBinding(7, 2, b)).toBe(true);
		expect(matchesBinding(7, 1, b)).toBe(false);
		expect(matchesBinding(7, 3, b)).toBe(false);
	});

	test("wrong CC number never matches regardless of channel", () => {
		const b: MidiCcBinding = {
			cc: 74, channel: 0, param: "intensity",
			ccMin: 0, ccMax: 127, paramMin: 0, paramMax: 1,
		};
		expect(matchesBinding(7, 1, b)).toBe(false);
		expect(matchesBinding(0, 1, b)).toBe(false);
		expect(matchesBinding(127, 1, b)).toBe(false);
	});

	test("CC 0 (mod wheel) and CC 127 are legal binding targets", () => {
		const bLow: MidiCcBinding = {
			cc: 0, channel: 0, param: "crossfade",
			ccMin: 0, ccMax: 127, paramMin: 0, paramMax: 1,
		};
		const bHigh: MidiCcBinding = {
			cc: 127, channel: 0, param: "maxBrightness",
			ccMin: 0, ccMax: 127, paramMin: 0.1, paramMax: 1,
		};
		expect(matchesBinding(0, 1, bLow)).toBe(true);
		expect(matchesBinding(127, 1, bHigh)).toBe(true);
	});
});
