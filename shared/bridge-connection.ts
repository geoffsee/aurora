export const BRIDGE_FRAME_TTL_MS = 3000;

export type OscConnectionInput = {
	demoMode: boolean;
	bridgeReady: boolean;
	lastFrameAt: number;
	now: number;
};

/** True when live OSC/audio frames are recent, demo mode is on, or the bridge is up for preview. */
export function isOscBridgeConnected(input: OscConnectionInput): boolean {
	if (input.demoMode) return true;
	if (input.lastFrameAt > 0) {
		return input.now - input.lastFrameAt < BRIDGE_FRAME_TTL_MS;
	}
	return input.bridgeReady;
}

export type ControlConnectionInput = {
	bridgeReady: boolean;
	lastFrameAt: number;
	now: number;
};

/** True when control state has arrived recently, or the bridge is still waiting for the first snapshot. */
export function isControlBridgeConnected(input: ControlConnectionInput): boolean {
	if (input.lastFrameAt <= 0) return input.bridgeReady;
	return input.now - input.lastFrameAt < BRIDGE_FRAME_TTL_MS;
}
