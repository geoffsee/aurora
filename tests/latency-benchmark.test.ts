import { expect, test } from "vitest";
import { TEST_WS_PORT } from "./constants.js";

// Measures P95 round-trip latency for the OSC → bridge → WebSocket path.
// The test server in global-setup.ts mirrors the bridge's fan-out behaviour:
// a state message sent by one client is echoed back to all connected clients,
// including the sender — exactly as the real bridge does.  WASM consumption
// is represented by receipt at the subscriber socket.

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

function p95(samples: number[]): number {
	const sorted = [...samples].sort((a, b) => a - b);
	const idx = Math.min(Math.ceil(sorted.length * 0.95) - 1, sorted.length - 1);
	return sorted[idx] ?? 0;
}

test("E2E pipeline P95 latency is under 100ms", async () => {
	// Two sockets: sender simulates the controls page / OSC bridge input;
	// receiver simulates the projector page / WASM consumer.
	const [sender, receiver] = await Promise.all([
		openWebSocket(),
		openWebSocket(),
	]);

	const SAMPLES = 50;
	const SESSION = Math.floor(Math.random() * 1e9);
	const latencies: number[] = [];

	try {
		for (let i = 0; i < SAMPLES; i++) {
			const benchmarkId = SESSION * 1000 + i;
			const start = performance.now();

			await new Promise<void>((resolve, reject) => {
				const timerId = setTimeout(
					() => reject(new Error(`Sample ${i} timed out after 1000ms`)),
					1000,
				);

				const onMessage = (event: MessageEvent) => {
					try {
						const msg = JSON.parse(event.data as string) as {
							address: string;
							args: unknown[];
						};
						if (msg.address === "/bevyosc/control/state") {
							const state = msg.args[0] as Record<string, unknown>;
							if (state._benchmarkId === benchmarkId) {
								latencies.push(performance.now() - start);
								clearTimeout(timerId);
								receiver.removeEventListener("message", onMessage);
								resolve();
							}
						}
					} catch {
						// ignore parse errors
					}
				};

				receiver.addEventListener("message", onMessage);
				sender.send(
					JSON.stringify({
						address: "/bevyosc/control/state",
						args: [{ crossfade: 0.5, _benchmarkId: benchmarkId }],
					}),
				);
			});
		}

		const p95ms = p95(latencies);
		const sorted = [...latencies].sort((a, b) => a - b);
		const p50ms = sorted[Math.floor(sorted.length * 0.5)] ?? 0;

		console.log(
			`[latency-benchmark] OSC→bridge→WebSocket→WASM (simulated) ` +
				`P50=${p50ms.toFixed(2)}ms P95=${p95ms.toFixed(2)}ms (n=${SAMPLES})`,
		);

		expect(p95ms).toBeLessThan(100);
	} finally {
		sender.close();
		receiver.close();
	}
}, 30_000);

test("ping handler returns pong with matching id", async () => {
	const ws = await openWebSocket();
	try {
		const pong = await new Promise<{ address: string; id: number }>(
			(resolve, reject) => {
				const timerId = setTimeout(
					() => reject(new Error("pong not received within 1000ms")),
					1000,
				);
				ws.addEventListener("message", (event) => {
					try {
						const msg = JSON.parse(event.data as string) as {
							address: string;
							id: number;
						};
						if (msg.address === "/bevyosc/pong") {
							clearTimeout(timerId);
							resolve(msg);
						}
					} catch {
						// ignore parse errors
					}
				});
				ws.send(JSON.stringify({ address: "/bevyosc/ping", id: 42 }));
			},
		);
		expect(pong.address).toBe("/bevyosc/pong");
		expect(pong.id).toBe(42);
	} finally {
		ws.close();
	}
}, 5_000);
