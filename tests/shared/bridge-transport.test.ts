import { afterEach, describe, expect, test, vi } from "vitest";
import {
	AURORA_BRIDGE_CHANNEL,
	createBroadcastChannelTransport,
	createBridgedTransport,
	createWebSocketTransport,
	type BridgeTransport,
	type OscFrame,
} from "../../shared/bridge-transport.ts";

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

afterEach(() => {
	MockBroadcastChannel.instances = [];
	vi.unstubAllGlobals();
});

describe("createBroadcastChannelTransport", () => {
	test("duplex peers exchange OSC frames", () => {
		vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);

		const publisher = createBroadcastChannelTransport({
			channelName: AURORA_BRIDGE_CHANNEL,
			role: "publish-only",
		});
		const subscriber = createBroadcastChannelTransport({
			channelName: AURORA_BRIDGE_CHANNEL,
			role: "subscribe-only",
		});
		const frames: OscFrame[] = [];
		subscriber.onMessage((frame) => frames.push(frame));
		publisher.connect();
		subscriber.connect();

		publisher.send({
			address: "/aurora/control/state",
			args: [{ crossfade: 0.25 }],
		});

		expect(frames).toHaveLength(1);
		expect(frames[0]?.address).toBe("/aurora/control/state");
	});

	test("subscribe-only transport ignores outbound send", () => {
		vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
		const subscriber = createBroadcastChannelTransport({ role: "subscribe-only" });
		subscriber.connect();
		expect(subscriber.send({ address: "/aurora/ping" })).toBe(false);
	});
});

describe("createBridgedTransport", () => {
	test("fans inbound and outbound frames to mirrors while listening on the bridge only", () => {
		vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);

		const bridgeFrames: OscFrame[] = [];
		const previewFrames: OscFrame[] = [];
		const bridgeListeners = new Set<(frame: OscFrame) => void>();
		const bridge: BridgeTransport & { receive(frame: OscFrame): void } = {
			get ready() {
				return true;
			},
			connect() {},
			close() {},
			send() {
				return true;
			},
			receive(frame) {
				for (const listener of bridgeListeners) listener(frame);
			},
			onOpen: () => () => {},
			onClose: () => () => {},
			onError: () => () => {},
			onMessage(listener) {
				bridgeListeners.add(listener);
				return () => bridgeListeners.delete(listener);
			},
		};

		const mirror = createBroadcastChannelTransport({ role: "publish-only" });
		const preview = createBroadcastChannelTransport({ role: "subscribe-only" });
		const bridged = createBridgedTransport({ bridge, fanout: [mirror] });

		bridged.onMessage((frame) => bridgeFrames.push(frame));
		preview.onMessage((frame) => previewFrames.push(frame));

		bridged.connect();
		preview.connect();

		bridge.receive({ address: "/live/song/get/beat", args: [3] });
		bridged.send({ address: "/aurora/control/state", args: [{ bpm: 128 }] });

		expect(bridgeFrames).toHaveLength(1);
		expect(bridgeFrames[0]?.address).toBe("/live/song/get/beat");
		expect(previewFrames).toHaveLength(2);
		expect(previewFrames.map((frame) => frame.address)).toEqual([
			"/live/song/get/beat",
			"/aurora/control/state",
		]);
	});
});

describe("createWebSocketTransport", () => {
	test("parses inbound JSON frames", () => {
		let socket: {
			onopen: (() => void) | null;
			onmessage: ((event: { data: string }) => void) | null;
			readyState: number;
			send: (data: string) => void;
		} | null = null;

		vi.stubGlobal("WebSocket", class {
			static OPEN = 1;
			onopen: (() => void) | null = null;
			onmessage: ((event: { data: string }) => void) | null = null;
			onclose: (() => void) | null = null;
			onerror: (() => void) | null = null;
			readyState = 0;
			constructor(_url: string) {
				socket = this;
			}
			send(data: string) {
				void data;
			}
			close() {
				this.readyState = 3;
			}
		});

		const transport = createWebSocketTransport("ws://127.0.0.1:3000/ws");
		const frames: OscFrame[] = [];
		transport.onMessage((frame) => frames.push(frame));
		transport.connect();
		socket!.readyState = 1;
		socket!.onopen?.();
		socket!.onmessage?.({
			data: JSON.stringify({ address: "/aurora/pong", id: 7 }),
		});

		expect(transport.ready).toBe(true);
		expect(frames[0]?.id).toBe(7);
	});
});
