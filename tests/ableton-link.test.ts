import { describe, expect, test } from "vitest";
import {
	LINK_DEFAULT_QUANTUM,
	LINK_TEMPO_MAX,
	LINK_TEMPO_MIN,
	LINK_TIMEOUT_MS,
	deriveLinkFrame,
	isLinkActive,
	wrapPhase,
} from "../ableton-link.ts";

describe("wrapPhase", () => {
	test("passes through values already in range", () => {
		expect(wrapPhase(0, 4)).toBe(0);
		expect(wrapPhase(2.5, 4)).toBe(2.5);
	});

	test("wraps values at or beyond the quantum", () => {
		expect(wrapPhase(4, 4)).toBe(0);
		expect(wrapPhase(5.5, 4)).toBeCloseTo(1.5, 6);
	});

	test("wraps negative phases into the positive range", () => {
		expect(wrapPhase(-1, 4)).toBe(3);
	});

	test("falls back to the default quantum for invalid quantum", () => {
		expect(wrapPhase(5, 0)).toBe(5 % LINK_DEFAULT_QUANTUM);
		expect(wrapPhase(5, Number.NaN)).toBe(5 % LINK_DEFAULT_QUANTUM);
	});

	test("returns 0 for non-finite phase", () => {
		expect(wrapPhase(Number.NaN, 4)).toBe(0);
		expect(wrapPhase(Number.POSITIVE_INFINITY, 4)).toBe(0);
	});
});

describe("deriveLinkFrame", () => {
	test("returns tempo and wrapped beat phase for a valid snapshot", () => {
		const frame = deriveLinkFrame(
			{ beat: 9.5, phase: 1.5, bpm: 128, numPeers: 2 },
			4,
		);
		expect(frame).not.toBeNull();
		expect(frame!.tempo).toBe(128);
		expect(frame!.beat).toBeCloseTo(1.5, 6);
	});

	test("works with zero peers (graceful solo timeline)", () => {
		const frame = deriveLinkFrame(
			{ beat: 0, phase: 0, bpm: 120, numPeers: 0 },
			4,
		);
		expect(frame).not.toBeNull();
		expect(frame!.tempo).toBe(120);
	});

	test("accepts the tempo range boundaries", () => {
		expect(
			deriveLinkFrame(
				{ beat: 0, phase: 0, bpm: LINK_TEMPO_MIN, numPeers: 0 },
				4,
			)?.tempo,
		).toBe(LINK_TEMPO_MIN);
		expect(
			deriveLinkFrame(
				{ beat: 0, phase: 0, bpm: LINK_TEMPO_MAX, numPeers: 0 },
				4,
			)?.tempo,
		).toBe(LINK_TEMPO_MAX);
	});

	test("rejects tempo below the minimum", () => {
		expect(
			deriveLinkFrame({ beat: 0, phase: 0, bpm: 39, numPeers: 0 }, 4),
		).toBeNull();
	});

	test("rejects tempo above the maximum", () => {
		expect(
			deriveLinkFrame({ beat: 0, phase: 0, bpm: 241, numPeers: 0 }, 4),
		).toBeNull();
	});

	test("rejects non-finite tempo", () => {
		expect(
			deriveLinkFrame({ beat: 0, phase: 0, bpm: Number.NaN, numPeers: 0 }, 4),
		).toBeNull();
	});

	test("wraps the beat phase into the quantum", () => {
		const frame = deriveLinkFrame(
			{ beat: 0, phase: 4.25, bpm: 120, numPeers: 1 },
			4,
		);
		expect(frame!.beat).toBeCloseTo(0.25, 6);
	});

	test("defaults the quantum when omitted", () => {
		const frame = deriveLinkFrame({ beat: 0, phase: 5, bpm: 120, numPeers: 0 });
		expect(frame!.beat).toBe(5 % LINK_DEFAULT_QUANTUM);
	});
});

describe("isLinkActive", () => {
	test("is inactive before any update", () => {
		expect(isLinkActive(0, 1000)).toBe(false);
	});

	test("is active within the timeout window", () => {
		expect(isLinkActive(1000, 1000 + LINK_TIMEOUT_MS - 1)).toBe(true);
	});

	test("is inactive once the timeout elapses", () => {
		expect(isLinkActive(1000, 1000 + LINK_TIMEOUT_MS)).toBe(false);
		expect(isLinkActive(1000, 1000 + LINK_TIMEOUT_MS + 500)).toBe(false);
	});

	test("respects a custom timeout", () => {
		expect(isLinkActive(1000, 1100, 200)).toBe(true);
		expect(isLinkActive(1000, 1300, 200)).toBe(false);
	});
});
