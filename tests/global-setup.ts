import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { TEST_WS_PORT } from "./constants.js";

type OscMsg = { address: string; args?: unknown[] };

export async function setup(): Promise<() => Promise<void>> {
	const sockets = new Set<WebSocket>();
	let latestControlState: unknown = null;

	const wss = new WebSocketServer({ port: TEST_WS_PORT, host: "127.0.0.1" });

	// Vitest calls globalSetup once per internal project (node + browser instances).
	// If the port is already bound by an earlier setup() call, return a no-op teardown
	// so the already-running server continues to serve all test connections.
	const ready = await new Promise<boolean>((resolve, reject) => {
		wss.once("listening", () => resolve(true));
		wss.once("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") resolve(false);
			else reject(err);
		});
	});
	if (!ready) return async () => {};

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
				const parsed = JSON.parse(text) as Partial<OscMsg> & Record<string, unknown>;
				if (
					parsed.address === "/bevyosc/control/state" &&
					Array.isArray(parsed.args)
				) {
					const arg = parsed.args[0];
					// Cache state without _benchmarkId so new connections don't receive
					// stale probe fields as their initial state push.
					if (arg !== null && typeof arg === "object") {
						const { _benchmarkId: _, ...clean } = arg as Record<string, unknown>;
						latestControlState = clean;
					} else {
						latestControlState = arg ?? null;
					}
					// Broadcast the original payload so in-flight latency probes can correlate by id.
					const data = JSON.stringify({
						address: "/bevyosc/control/state",
						args: [arg],
					});
					sockets.forEach((s) => s.send(data));
				} else if (
					typeof parsed.address === "string" &&
					parsed.address.startsWith("/bevyosc/preset/")
				) {
					const data = JSON.stringify({ address: parsed.address, args: [] });
					sockets.forEach((s) => s.send(data));
				} else if (parsed.address === "/bevyosc/ping") {
					const id = typeof parsed.id === "number" ? parsed.id : 0;
					ws.send(JSON.stringify({ address: "/bevyosc/pong", id }));
				}
			} catch {
				// ignore malformed messages
			}
		});
	});

	return async () => {
		sockets.forEach((s) => s.terminate());
		sockets.clear();
		await new Promise<void>((res) => wss.close(() => res()));
	};
}
