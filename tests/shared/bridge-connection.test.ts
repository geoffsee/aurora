import { describe, expect, test } from "vitest";
import {
	BRIDGE_FRAME_TTL_MS,
	isControlBridgeConnected,
	isOscBridgeConnected,
} from "../../shared/bridge-connection.ts";

describe("isOscBridgeConnected", () => {
	test("demo mode is always connected", () => {
		expect(
			isOscBridgeConnected({
				demoMode: true,
				bridgeReady: false,
				lastFrameAt: 0,
				now: 10_000,
			}),
		).toBe(true);
	});

	test("lastFrameAt=0 does not count as a recent OSC frame", () => {
		expect(
			isOscBridgeConnected({
				demoMode: false,
				bridgeReady: false,
				lastFrameAt: 0,
				now: 500,
			}),
		).toBe(false);
	});

	test("bridge-only preview stays connected until the first OSC frame", () => {
		expect(
			isOscBridgeConnected({
				demoMode: false,
				bridgeReady: true,
				lastFrameAt: 0,
				now: 60_000,
			}),
		).toBe(true);
	});

	test("live OSC times out after the TTL once frames have arrived", () => {
		const lastFrameAt = 1000;
		expect(
			isOscBridgeConnected({
				demoMode: false,
				bridgeReady: true,
				lastFrameAt,
				now: lastFrameAt + BRIDGE_FRAME_TTL_MS - 1,
			}),
		).toBe(true);
		expect(
			isOscBridgeConnected({
				demoMode: false,
				bridgeReady: true,
				lastFrameAt,
				now: lastFrameAt + BRIDGE_FRAME_TTL_MS,
			}),
		).toBe(false);
	});
});

describe("isControlBridgeConnected", () => {
	test("waits on bridgeReady before the first control snapshot", () => {
		expect(
			isControlBridgeConnected({
				bridgeReady: true,
				lastFrameAt: 0,
				now: 5000,
			}),
		).toBe(true);
		expect(
			isControlBridgeConnected({
				bridgeReady: false,
				lastFrameAt: 0,
				now: 5000,
			}),
		).toBe(false);
	});

	test("times out stale control snapshots", () => {
		const lastFrameAt = 2000;
		expect(
			isControlBridgeConnected({
				bridgeReady: true,
				lastFrameAt,
				now: lastFrameAt + BRIDGE_FRAME_TTL_MS - 1,
			}),
		).toBe(true);
		expect(
			isControlBridgeConnected({
				bridgeReady: true,
				lastFrameAt,
				now: lastFrameAt + BRIDGE_FRAME_TTL_MS,
			}),
		).toBe(false);
	});
});
