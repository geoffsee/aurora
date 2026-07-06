import { describe, expect, test } from "vitest";
import { generateDemoAudioFrame } from "../../shared/demo-audio.ts";

describe("generateDemoAudioFrame", () => {
	test("returns clamped feature fields", () => {
		const frame = generateDemoAudioFrame(124, 10);
		expect(frame.tempo).toBe(124);
		expect(frame.energy).toBeGreaterThanOrEqual(0);
		expect(frame.energy).toBeLessThanOrEqual(1);
		expect(frame.pulse).toBeGreaterThanOrEqual(0);
		expect(frame.pulse).toBeLessThanOrEqual(1);
	});

	test("beat advances with time", () => {
		const a = generateDemoAudioFrame(120, 0);
		const b = generateDemoAudioFrame(120, 1);
		expect(a.beat).not.toBe(b.beat);
	});
});
