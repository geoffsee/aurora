import { expect, test } from "vitest";
import { TEST_WS_PORT } from "./constants.js";

const WS_URL = `ws://localhost:${TEST_WS_PORT}/ws`;

function openWebSocket(): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(WS_URL);
		ws.addEventListener("open", () => resolve(ws));
		ws.addEventListener("error", () =>
			reject(new Error(`WebSocket connection to ${WS_URL} failed`)),
		);
	});
}

function waitForControlStateWithCrossfade(
	ws: WebSocket,
	crossfade: number,
	timeoutMs = 500,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const timerId = setTimeout(
			() =>
				reject(
					new Error(
						`No control state with crossfade≈${crossfade} received within ${timeoutMs}ms`,
					),
				),
			timeoutMs,
		);

		function onMessage(event: MessageEvent) {
			const msg = JSON.parse(event.data as string) as {
				address: string;
				args: unknown[];
			};
			if (msg.address === "/bevyosc/control/state") {
				const state = msg.args[0] as Record<string, unknown>;
				if (Math.abs((state["crossfade"] as number) - crossfade) < 1e-9) {
					clearTimeout(timerId);
					ws.removeEventListener("message", onMessage);
					resolve(state);
				}
			}
		}

		ws.addEventListener("message", onMessage);
	});
}

test("controls-page state mutation is reflected on projector page within 500ms", async () => {
	const [projectorWs, controlsWs] = await Promise.all([
		openWebSocket(),
		openWebSocket(),
	]);

	try {
		const received = waitForControlStateWithCrossfade(projectorWs, 0.33);

		controlsWs.send(
			JSON.stringify({
				address: "/bevyosc/control/state",
				args: [{ crossfade: 0.33 }],
			}),
		);

		const state = await received;
		expect(state["crossfade"]).toBe(0.33);
	} finally {
		projectorWs.close();
		controlsWs.close();
	}
});

test("preset recall command is broadcast to all connected clients", async () => {
	const [senderWs, observerWs] = await Promise.all([
		openWebSocket(),
		openWebSocket(),
	]);

	try {
		const received = new Promise<string>((resolve, reject) => {
			const timerId = setTimeout(
				() => reject(new Error("No preset recall message received within 500ms")),
				500,
			);
			function onMessage(event: MessageEvent) {
				const msg = JSON.parse(event.data as string) as {
					address: string;
					args: unknown[];
				};
				if (msg.address === "/bevyosc/preset/recall/3") {
					clearTimeout(timerId);
					observerWs.removeEventListener("message", onMessage);
					resolve(msg.address);
				}
			}
			observerWs.addEventListener("message", onMessage);
		});

		senderWs.send(
			JSON.stringify({ address: "/bevyosc/preset/recall/3", args: [] }),
		);

		const address = await received;
		expect(address).toBe("/bevyosc/preset/recall/3");
	} finally {
		senderWs.close();
		observerWs.close();
	}
});

test("second simultaneous controls-page client receives the same state update", async () => {
	const [projectorWs, controlsWs, observerWs] = await Promise.all([
		openWebSocket(),
		openWebSocket(),
		openWebSocket(),
	]);

	try {
		const projectorReceived = waitForControlStateWithCrossfade(
			projectorWs,
			0.67,
		);
		const observerReceived = waitForControlStateWithCrossfade(observerWs, 0.67);

		controlsWs.send(
			JSON.stringify({
				address: "/bevyosc/control/state",
				args: [{ crossfade: 0.67 }],
			}),
		);

		const [projectorState, observerState] = await Promise.all([
			projectorReceived,
			observerReceived,
		]);

		expect(projectorState["crossfade"]).toBe(0.67);
		expect(observerState["crossfade"]).toBe(0.67);
		expect(projectorState["crossfade"]).toBe(observerState["crossfade"]);
	} finally {
		projectorWs.close();
		controlsWs.close();
		observerWs.close();
	}
});
