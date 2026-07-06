import { afterEach, describe, expect, test, vi } from "vitest";
import {
	AURORA_BRIDGE_CHANNEL,
	createBroadcastChannelTransport,
	type OscFrame,
} from "../../shared/bridge-transport.ts";
import { generateDemoAudioFrame } from "../../shared/demo-audio.ts";
import {
	attachProjectorTransport,
	createProjectorTransport,
	shouldSubscribeBroadcastChannel,
} from "../../web/projector-bridge.ts";

class MockBroadcastChannel {
	static instances: MockBroadcastChannel[] = [];
	onmessage: ((event: MessageEvent<OscFrame>) => void) | null = null;

	constructor(public readonly name: string) {
		MockBroadcastChannel.instances.push(this);
	}

	postMessage(data: OscFrame) {
		for (const peer of MockBroadcastChannel.instances) {
			if (peer === this) continue;
			peer.onmessage?.({ data } as MessageEvent<OscFrame>);
		}
	}

	close() {
		MockBroadcastChannel.instances = MockBroadcastChannel.instances.filter(
			(ch) => ch !== this,
		);
	}
}

const GEOFFSEE_CONTROLS = {
	href: "https://geoffsee.github.io/aurora/controls/",
	hostname: "geoffsee.github.io",
	protocol: "https:",
	origin: "https://geoffsee.github.io",
	search: "",
	host: "geoffsee.github.io",
	port: "",
} as const;

const GEOFFSEE_PROJECTOR = {
	href: "https://geoffsee.github.io/aurora/",
	hostname: "geoffsee.github.io",
	protocol: "https:",
	origin: "https://geoffsee.github.io",
	search: "",
	host: "geoffsee.github.io",
	port: "",
} as const;

/** Minimal applyControlState mirror from web/index.html for regression coverage. */
function applyControlState(
	controlState: { crossfade: number; demoMode: boolean; bpm: number },
	next: unknown,
) {
	if (!next || typeof next !== "object") return;
	const patch = next as Record<string, unknown>;
	if (typeof patch.crossfade === "number") {
		controlState.crossfade = Math.max(0, Math.min(1, patch.crossfade));
	}
	controlState.demoMode = Boolean(patch.demoMode);
	if (typeof patch.bpm === "number") {
		controlState.bpm = Math.max(40, Math.min(240, patch.bpm));
	}
}

afterEach(() => {
	MockBroadcastChannel.instances = [];
	vi.unstubAllGlobals();
});

describe("static hosting controls ↔ standalone projector BroadcastChannel sync", () => {
	test("standalone projector subscribes on Geoff See Pages", () => {
		vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
		expect(shouldSubscribeBroadcastChannel(GEOFFSEE_PROJECTOR)).toBe(true);
		expect(createProjectorTransport(GEOFFSEE_PROJECTOR).ready).toBe(false);
	});

	test("control panel publishes state and demo audio to an independent projector tab", () => {
		vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);

		const controls = createBroadcastChannelTransport({
			channelName: AURORA_BRIDGE_CHANNEL,
			role: "publish-only",
		});
		controls.connect();

		const controlState = { crossfade: 0.5, demoMode: false, bpm: 124 };
		const projectorFrames: OscFrame[] = [];
		const projectorTransport = createProjectorTransport(GEOFFSEE_PROJECTOR);
		attachProjectorTransport(projectorTransport, {
			onMessage: (frame) => {
				projectorFrames.push(frame);
				if (frame.address === "/aurora/control/state") {
					applyControlState(controlState, frame.args?.[0]);
				}
			},
		});

		expect(MockBroadcastChannel.instances).toHaveLength(2);
		expect(MockBroadcastChannel.instances.every((ch) => ch.name === AURORA_BRIDGE_CHANNEL)).toBe(
			true,
		);

		controls.send({
			address: "/aurora/control/state",
			args: [{ crossfade: 0.82, demoMode: true, bpm: 132 }],
		});

		const demo = generateDemoAudioFrame(132, 12.5);
		controls.send({
			address: "/aurora/demo/audio",
			args: [demo],
		});

		expect(projectorFrames.map((frame) => frame.address)).toEqual([
			"/aurora/control/state",
			"/aurora/demo/audio",
		]);
		expect(controlState).toEqual({
			crossfade: 0.82,
			demoMode: true,
			bpm: 132,
		});
		expect(projectorFrames[1]?.args?.[0]).toMatchObject({
			tempo: 132,
			energy: expect.any(Number),
		});
	});

	test("independent windows on the same origin share one channel name", () => {
		vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);

		const controlsWindow = createBroadcastChannelTransport({ role: "publish-only" });
		const projectorWindow = createProjectorTransport(GEOFFSEE_PROJECTOR);
		const embeddedPreview = createProjectorTransport({
			...GEOFFSEE_CONTROLS,
			search: "?embed=1",
		});

		controlsWindow.connect();
		projectorWindow.connect();
		embeddedPreview.connect();

		const projectorOnly: OscFrame[] = [];
		const embedded: OscFrame[] = [];
		projectorWindow.onMessage((frame) => projectorOnly.push(frame));
		embeddedPreview.onMessage((frame) => embedded.push(frame));

		controlsWindow.send({ address: "/aurora/control/state", args: [{ crossfade: 0.1 }] });

		expect(projectorOnly).toHaveLength(1);
		expect(embedded).toHaveLength(1);
		expect(projectorOnly[0]?.args?.[0]).toEqual({ crossfade: 0.1 });
	});

	test("local standalone projector still uses WebSocket transport", () => {
		const localProjector = {
			href: "http://127.0.0.1:3000/",
			hostname: "127.0.0.1",
			protocol: "http:",
			origin: "http://127.0.0.1:3000",
			search: "",
			host: "127.0.0.1:3000",
			port: "3000",
		} as const;

		expect(shouldSubscribeBroadcastChannel(localProjector)).toBe(false);
		expect(createProjectorTransport(localProjector).connect).toBeTypeOf("function");
	});
});
