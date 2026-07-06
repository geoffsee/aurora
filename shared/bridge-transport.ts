import { nextReconnectDelay } from "../src/reconnect.ts";

/** Shared fan-out channel for same-origin controls ↔ embedded projector preview. */
export const AURORA_BRIDGE_CHANNEL = "aurora-bridge";

export type OscFrame = {
	address?: string;
	args?: unknown[];
	error?: unknown;
	id?: number;
};

export type BridgeTransport = {
	readonly ready: boolean;
	connect(): void;
	close(): void;
	send(frame: OscFrame): boolean;
	onOpen(listener: () => void): () => void;
	onClose(listener: () => void): () => void;
	onError(listener: () => void): () => void;
	onMessage(listener: (frame: OscFrame) => void): () => void;
};

type Listener<T> = (value: T) => void;

function createEmitter<T>() {
	const listeners = new Set<Listener<T>>();
	return {
		emit(value: T) {
			for (const listener of listeners) listener(value);
		},
		subscribe(listener: Listener<T>) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

export type WebSocketTransportOptions = {
	reconnect?: boolean;
	initialReconnectDelayMs?: number;
	maxReconnectDelayMs?: number;
};

export function createWebSocketTransport(
	url: string | (() => string),
	options: WebSocketTransportOptions = {},
): BridgeTransport {
	const reconnect = options.reconnect ?? false;
	const getUrl = typeof url === "function" ? url : () => url;
	let ws: WebSocket | null = null;
	let intentionalClose = false;
	let reconnectDelay = options.initialReconnectDelayMs ?? 1000;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	const open = createEmitter<void>();
	const close = createEmitter<void>();
	const error = createEmitter<void>();
	const message = createEmitter<OscFrame>();

	const clearReconnectTimer = () => {
		if (reconnectTimer !== null) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	};

	const scheduleReconnect = () => {
		if (!reconnect || intentionalClose) return;
		clearReconnectTimer();
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			openSocket();
		}, reconnectDelay);
		reconnectDelay = nextReconnectDelay(
			reconnectDelay,
			options.maxReconnectDelayMs ?? 16000,
		);
	};

	const openSocket = () => {
		clearReconnectTimer();
		ws?.close();
		ws = new WebSocket(getUrl());
		ws.onopen = () => {
			reconnectDelay = options.initialReconnectDelayMs ?? 1000;
			open.emit();
		};
		ws.onclose = () => {
			close.emit();
			scheduleReconnect();
		};
		ws.onerror = () => error.emit();
		ws.onmessage = (event) => {
			try {
				message.emit(JSON.parse(String(event.data)) as OscFrame);
			} catch {
				// Ignore malformed bridge frames.
			}
		};
	};

	return {
		get ready() {
			return ws?.readyState === WebSocket.OPEN;
		},
		connect() {
			intentionalClose = false;
			reconnectDelay = options.initialReconnectDelayMs ?? 1000;
			openSocket();
		},
		close() {
			intentionalClose = true;
			clearReconnectTimer();
			ws?.close();
			ws = null;
		},
		send(frame) {
			if (!this.ready) return false;
			ws!.send(JSON.stringify(frame));
			return true;
		},
		onOpen: open.subscribe.bind(open),
		onClose: close.subscribe.bind(close),
		onError: error.subscribe.bind(error),
		onMessage: message.subscribe.bind(message),
	};
}

export type BroadcastChannelRole = "duplex" | "publish-only" | "subscribe-only";

export type BroadcastChannelTransportOptions = {
	channelName?: string;
	role?: BroadcastChannelRole;
};

export function createBroadcastChannelTransport(
	options: BroadcastChannelTransportOptions = {},
): BridgeTransport {
	const channelName = options.channelName ?? AURORA_BRIDGE_CHANNEL;
	const role = options.role ?? "duplex";
	let channel: BroadcastChannel | null = null;
	const open = createEmitter<void>();
	const close = createEmitter<void>();
	const error = createEmitter<void>();
	const message = createEmitter<OscFrame>();

	return {
		get ready() {
			return channel !== null && role !== "subscribe-only";
		},
		connect() {
			if (typeof BroadcastChannel === "undefined") {
				error.emit();
				close.emit();
				return;
			}
			channel?.close();
			channel = new BroadcastChannel(channelName);
			if (role !== "publish-only") {
				channel.onmessage = (event) => {
					if (!event.data || typeof event.data !== "object") return;
					message.emit(event.data as OscFrame);
				};
			}
			queueMicrotask(() => open.emit());
		},
		close() {
			channel?.close();
			channel = null;
			close.emit();
		},
		send(frame) {
			if (role === "subscribe-only" || !channel) return false;
			channel.postMessage(frame);
			return true;
		},
		onOpen: open.subscribe.bind(open),
		onClose: close.subscribe.bind(close),
		onError: error.subscribe.bind(error),
		onMessage: message.subscribe.bind(message),
	};
}

export type BridgedTransportOptions = {
	bridge: BridgeTransport;
	/** Receives a copy of every outbound frame (e.g. preview fan-out). */
	fanout?: BridgeTransport[];
};

/** Bridge transport with optional outbound mirrors; inbound traffic comes from `bridge` only. */
export function createBridgedTransport(
	options: BridgedTransportOptions,
): BridgeTransport {
	const { bridge, fanout = [] } = options;
	const open = createEmitter<void>();
	const close = createEmitter<void>();
	const error = createEmitter<void>();
	const message = createEmitter<OscFrame>();

	bridge.onOpen(() => open.emit());
	bridge.onClose(() => close.emit());
	bridge.onError(() => error.emit());
	bridge.onMessage((frame) => {
		message.emit(frame);
		for (const mirror of fanout) mirror.send(frame);
	});

	return {
		get ready() {
			return bridge.ready;
		},
		connect() {
			bridge.connect();
			for (const mirror of fanout) mirror.connect();
		},
		close() {
			bridge.close();
			for (const mirror of fanout) mirror.close();
		},
		send(frame) {
			const sent = bridge.send(frame);
			for (const mirror of fanout) mirror.send(frame);
			return sent;
		},
		onOpen: open.subscribe.bind(open),
		onClose: close.subscribe.bind(close),
		onError: error.subscribe.bind(error),
		onMessage: message.subscribe.bind(message),
	};
}
