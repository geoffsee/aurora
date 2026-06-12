// Minimal Ableton Link participant: discovery-plane wire codec and session
// tracking. Byte layout follows the reference implementation
// (github.com/Ableton/link, include/ableton/discovery/v1/Messages.hpp):
//
//   header   : "_asdp_v" + version byte (1)
//   message  : type u8 | ttl u8 | sessionGroupId u16 BE | nodeId 8 bytes
//   payload  : entries of [key u32 BE | size u32 BE | value], concatenated
//   'tmln'   : microsPerBeat i64 | beatOrigin µbeats i64 | timeOrigin µs i64
//   'sess'   : session id, 8 bytes
//   'stst'   : isPlaying u8 | beats µbeats i64 | timestamp µs i64
//
// This module implements the discovery plane only — enough to be seen as a
// peer and to follow the session timeline. The unicast ping/pong measurement
// plane (ghost-time alignment) is not implemented, so beat phase derived here
// advances at the exact session tempo but carries a constant unknown offset
// from the true session phase.

export const LINK_MULTICAST_ADDR = "224.76.78.75";
export const LINK_PORT = 20808;
export const LINK_MESSAGE_ALIVE = 1;
export const LINK_MESSAGE_RESPONSE = 2;
export const LINK_MESSAGE_BYEBYE = 3;
export const LINK_DEFAULT_TTL_SECONDS = 5;

const PROTOCOL_HEADER = new Uint8Array([
	0x5f, 0x61, 0x73, 0x64, 0x70, 0x5f, 0x76, 0x01,
]); // "_asdp_v" + version 1
const KEY_TIMELINE = 0x746d6c6e; // 'tmln'
const KEY_SESSION = 0x73657373; // 'sess'
const KEY_START_STOP = 0x73747374; // 'stst'

const MODERN_HEADER_SIZE = 20; // protocol header + type + ttl + groupId + nodeId
const LEGACY_HEADER_SIZE = 18; // pre-session-groups header without groupId

export type LinkTimeline = {
	microsPerBeat: number;
	beatOriginMicroBeats: number;
	timeOriginMicros: number;
};

export type LinkStartStop = {
	isPlaying: boolean;
	beatMicroBeats: number;
	timestampMicros: number;
};

export type LinkMessage = {
	messageType: number;
	ttl: number;
	groupId: number;
	nodeId: string;
	sessionId: string | null;
	timeline: LinkTimeline | null;
	isPlaying: boolean | null;
};

export const bytesToHex = (bytes: Uint8Array): string =>
	Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export const hexToBytes = (hex: string): Uint8Array => {
	const bytes = new Uint8Array(hex.length >> 1);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
};

export const bpmFromMicrosPerBeat = (microsPerBeat: number): number =>
	60e6 / microsPerBeat;

export const microsPerBeatFromBpm = (bpm: number): number =>
	Math.round(60e6 / bpm);

export const beatAtTime = (timeline: LinkTimeline, micros: number): number =>
	timeline.beatOriginMicroBeats / 1e6 +
	(micros - timeline.timeOriginMicros) / timeline.microsPerBeat;

export const phaseAtTime = (
	timeline: LinkTimeline,
	micros: number,
	quantum: number,
): number => {
	const beat = beatAtTime(timeline, micros) % quantum;
	return beat < 0 ? beat + quantum : beat;
};

// Live's tempo range is 20–999 BPM; anything outside is a malformed packet.
export const isValidLinkTimeline = (timeline: LinkTimeline): boolean =>
	Number.isFinite(timeline.microsPerBeat) &&
	Number.isFinite(timeline.beatOriginMicroBeats) &&
	Number.isFinite(timeline.timeOriginMicros) &&
	timeline.microsPerBeat >= 60_000 &&
	timeline.microsPerBeat <= 3_000_000;

type ParsedPayload = {
	sessionId: string | null;
	timeline: LinkTimeline | null;
	isPlaying: boolean | null;
	knownEntries: number;
};

const hexAt = (dv: DataView, offset: number, length: number): string => {
	let hex = "";
	for (let i = 0; i < length; i++) {
		hex += dv.getUint8(offset + i).toString(16).padStart(2, "0");
	}
	return hex;
};

const parsePayload = (dv: DataView, start: number): ParsedPayload | null => {
	const payload: ParsedPayload = {
		sessionId: null,
		timeline: null,
		isPlaying: null,
		knownEntries: 0,
	};
	let offset = start;
	const end = dv.byteLength;
	while (offset < end) {
		if (offset + 8 > end) return null;
		const key = dv.getUint32(offset);
		const size = dv.getUint32(offset + 4);
		offset += 8;
		if (offset + size > end) return null;
		if (key === KEY_TIMELINE && size === 24) {
			payload.timeline = {
				microsPerBeat: Number(dv.getBigInt64(offset)),
				beatOriginMicroBeats: Number(dv.getBigInt64(offset + 8)),
				timeOriginMicros: Number(dv.getBigInt64(offset + 16)),
			};
			payload.knownEntries++;
		} else if (key === KEY_SESSION && size === 8) {
			payload.sessionId = hexAt(dv, offset, 8);
			payload.knownEntries++;
		} else if (key === KEY_START_STOP && size === 17) {
			payload.isPlaying = dv.getUint8(offset) !== 0;
			payload.knownEntries++;
		}
		offset += size;
	}
	return payload;
};

// Returns null for anything that is not a parseable Link discovery message.
// Falls back to the pre-session-groups header layout (no groupId field) when
// the modern layout yields no recognizable payload entries.
export function parseLinkMessage(data: Uint8Array): LinkMessage | null {
	if (data.byteLength < LEGACY_HEADER_SIZE) return null;
	for (let i = 0; i < PROTOCOL_HEADER.length; i++) {
		if (data[i] !== PROTOCOL_HEADER[i]) return null;
	}
	const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const messageType = dv.getUint8(8);
	const ttl = dv.getUint8(9);
	if (
		messageType !== LINK_MESSAGE_ALIVE &&
		messageType !== LINK_MESSAGE_RESPONSE &&
		messageType !== LINK_MESSAGE_BYEBYE
	) {
		return null;
	}

	if (data.byteLength >= MODERN_HEADER_SIZE) {
		const payload = parsePayload(dv, MODERN_HEADER_SIZE);
		if (
			payload &&
			(payload.knownEntries > 0 || data.byteLength === MODERN_HEADER_SIZE)
		) {
			return {
				messageType,
				ttl,
				groupId: dv.getUint16(10),
				nodeId: hexAt(dv, 12, 8),
				sessionId: payload.sessionId,
				timeline: payload.timeline,
				isPlaying: payload.isPlaying,
			};
		}
	}

	const legacy = parsePayload(dv, LEGACY_HEADER_SIZE);
	if (
		legacy &&
		(legacy.knownEntries > 0 || data.byteLength === LEGACY_HEADER_SIZE)
	) {
		return {
			messageType,
			ttl,
			groupId: 0,
			nodeId: hexAt(dv, 10, 8),
			sessionId: legacy.sessionId,
			timeline: legacy.timeline,
			isPlaying: legacy.isPlaying,
		};
	}
	return null;
}

export function encodeLinkMessage(opts: {
	messageType: number;
	ttl: number;
	groupId: number;
	nodeId: Uint8Array;
	sessionId?: Uint8Array;
	timeline?: LinkTimeline;
	startStop?: LinkStartStop;
}): Uint8Array {
	const size =
		MODERN_HEADER_SIZE +
		(opts.timeline ? 32 : 0) +
		(opts.sessionId ? 16 : 0) +
		(opts.startStop ? 25 : 0);
	const out = new Uint8Array(size);
	const dv = new DataView(out.buffer);
	out.set(PROTOCOL_HEADER, 0);
	dv.setUint8(8, opts.messageType);
	dv.setUint8(9, opts.ttl);
	dv.setUint16(10, opts.groupId);
	out.set(opts.nodeId.subarray(0, 8), 12);
	let offset = MODERN_HEADER_SIZE;
	if (opts.timeline) {
		dv.setUint32(offset, KEY_TIMELINE);
		dv.setUint32(offset + 4, 24);
		dv.setBigInt64(offset + 8, BigInt(Math.round(opts.timeline.microsPerBeat)));
		dv.setBigInt64(
			offset + 16,
			BigInt(Math.round(opts.timeline.beatOriginMicroBeats)),
		);
		dv.setBigInt64(
			offset + 24,
			BigInt(Math.round(opts.timeline.timeOriginMicros)),
		);
		offset += 32;
	}
	if (opts.sessionId) {
		dv.setUint32(offset, KEY_SESSION);
		dv.setUint32(offset + 4, 8);
		out.set(opts.sessionId.subarray(0, 8), offset + 8);
		offset += 16;
	}
	if (opts.startStop) {
		dv.setUint32(offset, KEY_START_STOP);
		dv.setUint32(offset + 4, 17);
		dv.setUint8(offset + 8, opts.startStop.isPlaying ? 1 : 0);
		dv.setBigInt64(
			offset + 9,
			BigInt(Math.round(opts.startStop.beatMicroBeats)),
		);
		dv.setBigInt64(
			offset + 17,
			BigInt(Math.round(opts.startStop.timestampMicros)),
		);
	}
	return out;
}

export type LinkSessionEvent = {
	isNewPeer: boolean;
	timelineChanged: boolean;
};

// Tracks peers seen on the discovery plane and follows the most recently
// announced session timeline. All methods prune expired peers first, so the
// session degrades to inactive (tempo()/beatAt() return null) as soon as the
// last peer times out or says goodbye — callers fall back to other sources.
export function makeLinkSession(ownNodeIdHex: string) {
	type Peer = { lastSeenMs: number; ttlMs: number };
	const peers = new Map<string, Peer>();
	let adopted: { timeline: LinkTimeline; sessionId: string | null } | null =
		null;

	const ttlMsFrom = (ttl: number): number =>
		(ttl >= 1 && ttl <= 60 ? ttl : LINK_DEFAULT_TTL_SECONDS) * 1000;

	const prune = (nowMs: number): void => {
		for (const [id, peer] of peers) {
			if (nowMs - peer.lastSeenMs > peer.ttlMs) peers.delete(id);
		}
		if (peers.size === 0) adopted = null;
	};

	const isActive = (nowMs: number): boolean => {
		prune(nowMs);
		return adopted !== null;
	};

	return {
		onMessage(msg: LinkMessage, nowMs: number): LinkSessionEvent {
			prune(nowMs);
			if (msg.nodeId === ownNodeIdHex) {
				return { isNewPeer: false, timelineChanged: false };
			}
			if (msg.messageType === LINK_MESSAGE_BYEBYE) {
				peers.delete(msg.nodeId);
				if (peers.size === 0) adopted = null;
				return { isNewPeer: false, timelineChanged: false };
			}
			const isNewPeer = !peers.has(msg.nodeId);
			peers.set(msg.nodeId, { lastSeenMs: nowMs, ttlMs: ttlMsFrom(msg.ttl) });
			let timelineChanged = false;
			if (msg.timeline && isValidLinkTimeline(msg.timeline)) {
				timelineChanged =
					adopted === null ||
					adopted.timeline.microsPerBeat !== msg.timeline.microsPerBeat ||
					adopted.timeline.beatOriginMicroBeats !==
						msg.timeline.beatOriginMicroBeats ||
					adopted.timeline.timeOriginMicros !== msg.timeline.timeOriginMicros ||
					adopted.sessionId !== msg.sessionId;
				adopted = { timeline: { ...msg.timeline }, sessionId: msg.sessionId };
			}
			return { isNewPeer, timelineChanged };
		},
		isActive,
		peerCount(nowMs: number): number {
			prune(nowMs);
			return peers.size;
		},
		tempo(nowMs: number): number | null {
			if (!isActive(nowMs) || adopted === null) return null;
			return bpmFromMicrosPerBeat(adopted.timeline.microsPerBeat);
		},
		beatAt(localMicros: number, nowMs: number): number | null {
			if (!isActive(nowMs) || adopted === null) return null;
			return beatAtTime(adopted.timeline, localMicros);
		},
		adoptedTimeline(): LinkTimeline | null {
			return adopted ? { ...adopted.timeline } : null;
		},
		sessionIdHex(): string | null {
			return adopted?.sessionId ?? null;
		},
	};
}
