import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { TEST_WS_PORT } from "./constants.js";

type OscMsg = { address: string; args?: unknown[] };

export async function setup(): Promise<() => Promise<void>> {
	const sockets = new Set<WebSocket>();
	let latestControlState: unknown = null;

	const wss = new WebSocketServer({ port: TEST_WS_PORT, host: "127.0.0.1" });

	wss.on("connection", (ws, request) => {
		if (request.url !== "/ws") {
			ws.close();
			return;
		}

		sockets.add(ws);
		if (latestControlState !== null) {
			ws.send(
				JSON.stringify({
					address: "/bevyosc/control/state",
					args: [latestControlState],
				}),
			);
		}

		ws.on("close", () => {
			sockets.delete(ws);
		});

		ws.on("message", (raw) => {
			try {
				const text = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
				const parsed = JSON.parse(text) as Partial<OscMsg>;
				if (
					parsed.address === "/bevyosc/control/state" &&
					Array.isArray(parsed.args)
				) {
					latestControlState = parsed.args[0] ?? null;
					const data = JSON.stringify({
						address: "/bevyosc/control/state",
						args: [latestControlState],
					});
					sockets.forEach((s) => s.send(data));
				}
			} catch {
				// ignore malformed messages
			}
		});
	});

	await new Promise<void>((resolve) => wss.once("listening", resolve));

	return async () => {
		sockets.forEach((s) => s.terminate());
		sockets.clear();
		await new Promise<void>((res) => wss.close(() => res()));
	};
}
