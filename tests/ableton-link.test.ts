import { describe, expect, test } from "vitest";
import {
	LINK_MESSAGE_ALIVE,
	LINK_MESSAGE_BYEBYE,
	LINK_MESSAGE_RESPONSE,
	type LinkTimeline,
	beatAtTime,
	bpmFromMicrosPerBeat,
	bytesToHex,
	encodeLinkMessage,
	hexToBytes,
	isValidLinkTimeline,
	makeLinkSession,
	microsPerBeatFromBpm,
	parseLinkMessage,
	phaseAtTime,
} from "../ableton-link.ts";

const nodeId = (firstByte: number): Uint8Array => {
	const bytes = new Uint8Array(8);
	bytes[0] = firstByte;
	return bytes;
};

const timeline120: LinkTimeline = {
	microsPerBeat: 500_000,
	beatOriginMicroBeats: 0,
	timeOriginMicros: 1_000_000,
};

const aliveFrom = (
	peer: Uint8Array,
	timeline: LinkTimeline,
	ttl = 5,
): Uint8Array =>
	encodeLinkMessage({
		messageType: LINK_MESSAGE_ALIVE,
		ttl,
		groupId: 0,
		nodeId: peer,
		sessionId: peer,
		timeline,
	});

// Appends a well-formed entry with a key this parser does not recognize
// ('mep4', the measurement endpoint) — the shape of real Live announcements.
const withUnknownEntry = (msg: Uint8Array): Uint8Array => {
	const entry = new Uint8Array(8 + 6);
	const dv = new DataView(entry.buffer);
	dv.setUint32(0, 0x6d657034); // 'mep4'
	dv.setUint32(4, 6);
	entry.set([0xc0, 0xa8, 0x01, 0x42, 0x4e, 0x21], 8); // 192.168.1.66:20001
	const out = new Uint8Array(msg.length + entry.length);
	out.set(msg, 0);
	out.set(entry, msg.length);
	return out;
};

describe("tempo conversions", () => {
	test("120 bpm round-trips through micros-per-beat", () => {
		expect(microsPerBeatFromBpm(120)).toBe(500_000);
		expect(bpmFromMicrosPerBeat(500_000)).toBeCloseTo(120, 9);
	});

	test("174 bpm round-trips within float tolerance", () => {
		expect(bpmFromMicrosPerBeat(microsPerBeatFromBpm(174))).toBeCloseTo(174, 3);
	});
});

describe("timeline math", () => {
	test("beatAtTime projects beats from the timeline origin", () => {
		expect(beatAtTime(timeline120, 1_000_000)).toBeCloseTo(0, 9);
		expect(beatAtTime(timeline120, 2_000_000)).toBeCloseTo(2, 9);
		expect(beatAtTime(timeline120, 2_250_000)).toBeCloseTo(2.5, 9);
	});

	test("beatAtTime honours a non-zero beat origin", () => {
		const tl = { ...timeline120, beatOriginMicroBeats: 8_000_000 };
		expect(beatAtTime(tl, 1_000_000)).toBeCloseTo(8, 9);
	});

	test("phaseAtTime wraps into [0, quantum) including negative beats", () => {
		expect(phaseAtTime(timeline120, 3_500_000, 4)).toBeCloseTo(1, 9);
		expect(phaseAtTime(timeline120, 0, 4)).toBeCloseTo(2, 9);
	});

	test("isValidLinkTimeline rejects out-of-range tempi", () => {
		expect(isValidLinkTimeline(timeline120)).toBe(true);
		expect(isValidLinkTimeline({ ...timeline120, microsPerBeat: 0 })).toBe(
			false,
		);
		expect(
			isValidLinkTimeline({ ...timeline120, microsPerBeat: 10_000_000 }),
		).toBe(false);
	});
});

describe("message codec", () => {
	test("ALIVE with timeline + session round-trips", () => {
		const peer = nodeId(0xaa);
		const parsed = parseLinkMessage(aliveFrom(peer, timeline120));
		expect(parsed).not.toBeNull();
		expect(parsed!.messageType).toBe(LINK_MESSAGE_ALIVE);
		expect(parsed!.ttl).toBe(5);
		expect(parsed!.groupId).toBe(0);
		expect(parsed!.nodeId).toBe(bytesToHex(peer));
		expect(parsed!.sessionId).toBe(bytesToHex(peer));
		expect(parsed!.timeline).toEqual(timeline120);
	});

	test("start/stop state round-trips isPlaying", () => {
		const msg = encodeLinkMessage({
			messageType: LINK_MESSAGE_RESPONSE,
			ttl: 5,
			groupId: 0,
			nodeId: nodeId(1),
			startStop: {
				isPlaying: true,
				beatMicroBeats: 4_000_000,
				timestampMicros: 123,
			},
		});
		expect(parseLinkMessage(msg)!.isPlaying).toBe(true);
	});

	test("BYEBYE without payload parses", () => {
		const msg = encodeLinkMessage({
			messageType: LINK_MESSAGE_BYEBYE,
			ttl: 0,
			groupId: 0,
			nodeId: nodeId(2),
		});
		const parsed = parseLinkMessage(msg);
		expect(parsed!.messageType).toBe(LINK_MESSAGE_BYEBYE);
		expect(parsed!.timeline).toBeNull();
	});

	test("rejects short buffers, bad magic, and unknown message types", () => {
		expect(parseLinkMessage(new Uint8Array(4))).toBeNull();
		const badMagic = aliveFrom(nodeId(3), timeline120);
		badMagic[0] = 0x58;
		expect(parseLinkMessage(badMagic)).toBeNull();
		const badType = aliveFrom(nodeId(3), timeline120);
		badType[8] = 9;
		expect(parseLinkMessage(badType)).toBeNull();
	});

	test("rejects payload entries that overrun the datagram", () => {
		const truncated = aliveFrom(nodeId(4), timeline120).slice(0, 40);
		expect(parseLinkMessage(truncated)).toBeNull();
	});

	test("parses legacy header layout without the groupId field", () => {
		const modern = aliveFrom(nodeId(5), timeline120);
		// Strip the 2-byte groupId at offset 10 to emulate pre-session-groups peers.
		const legacy = new Uint8Array(modern.length - 2);
		legacy.set(modern.subarray(0, 10), 0);
		legacy.set(modern.subarray(12), 10);
		const parsed = parseLinkMessage(legacy);
		expect(parsed).not.toBeNull();
		expect(parsed!.nodeId).toBe(bytesToHex(nodeId(5)));
		expect(parsed!.timeline).toEqual(timeline120);
	});

	test("hand-assembled wire fixture parses independently of the encoder", () => {
		// Byte-for-byte from the reference layout (Messages.hpp), NOT built with
		// encodeLinkMessage, so a mutual encoder/parser misunderstanding of the
		// wire format fails here. Includes an unrecognized measurement-endpoint
		// entry the way real Live announcements do.
		const fixture = hexToBytes(
			[
				"5f617364705f7601", // "_asdp_v" + version 1
				"01", // message type: ALIVE
				"05", // ttl: 5 s
				"0000", // session group id: 0
				"e6b72b4d1e8e0a61", // node id
				"746d6c6e", // 'tmln'
				"00000018", // size 24
				"000000000007a120", // microsPerBeat 500000 (120 BPM)
				"0000000000f42400", // beatOrigin 16e6 µbeats (16 beats)
				"00000000000f4240", // timeOrigin 1e6 µs
				"73657373", // 'sess'
				"00000008", // size 8
				"a1b2c3d4e5f60718", // session id
				"6d657034", // 'mep4' — measurement endpoint, unknown to this parser
				"00000006", // size 6
				"c0a801424e21", // 192.168.1.66:20001
			].join(""),
		);
		const parsed = parseLinkMessage(fixture);
		expect(parsed).not.toBeNull();
		expect(parsed!.messageType).toBe(LINK_MESSAGE_ALIVE);
		expect(parsed!.ttl).toBe(5);
		expect(parsed!.groupId).toBe(0);
		expect(parsed!.nodeId).toBe("e6b72b4d1e8e0a61");
		expect(parsed!.sessionId).toBe("a1b2c3d4e5f60718");
		expect(parsed!.timeline).toEqual({
			microsPerBeat: 500_000,
			beatOriginMicroBeats: 16_000_000,
			timeOriginMicros: 1_000_000,
		});
		expect(bpmFromMicrosPerBeat(parsed!.timeline!.microsPerBeat)).toBeCloseTo(
			120,
			9,
		);
	});

	test("modern message with only unknown entries parses as modern", () => {
		// Regression for the modern/legacy fallback: a well-formed modern packet
		// whose payload carries no recognized keys must NOT be re-parsed at the
		// legacy offset (which would register a phantom peer under a garbage id).
		const peer = nodeId(6);
		const msg = withUnknownEntry(
			encodeLinkMessage({
				messageType: LINK_MESSAGE_RESPONSE,
				ttl: 5,
				groupId: 0,
				nodeId: peer,
			}),
		);
		const parsed = parseLinkMessage(msg);
		expect(parsed).not.toBeNull();
		expect(parsed!.nodeId).toBe(bytesToHex(peer));
		expect(parsed!.groupId).toBe(0);
		expect(parsed!.timeline).toBeNull();
		expect(parsed!.sessionId).toBeNull();
	});

	test("unknown entry alongside the timeline is skipped, timeline kept", () => {
		const peer = nodeId(7);
		const parsed = parseLinkMessage(
			withUnknownEntry(aliveFrom(peer, timeline120)),
		);
		expect(parsed).not.toBeNull();
		expect(parsed!.nodeId).toBe(bytesToHex(peer));
		expect(parsed!.timeline).toEqual(timeline120);
	});

	test("hex helpers round-trip", () => {
		const bytes = new Uint8Array([0, 1, 0xab, 0xcd, 0xef, 16, 32, 255]);
		expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
	});
});

describe("link session", () => {
	const self = nodeId(0x01);
	const peer = nodeId(0x02);

	test("adopts a peer timeline and reports tempo/beat", () => {
		const session = makeLinkSession(bytesToHex(self));
		expect(session.isActive(0)).toBe(false);
		expect(session.tempo(0)).toBeNull();
		expect(session.beatAt(0, 0)).toBeNull();

		const event = session.onMessage(
			parseLinkMessage(aliveFrom(peer, timeline120))!,
			1000,
		);
		expect(event).toEqual({ isNewPeer: true, timelineChanged: true });
		expect(session.isActive(1000)).toBe(true);
		expect(session.peerCount(1000)).toBe(1);
		expect(session.tempo(1000)).toBeCloseTo(120, 6);
		expect(session.beatAt(2_000_000, 1000)).toBeCloseTo(2, 9);
		expect(session.sessionIdHex()).toBe(bytesToHex(peer));
	});

	test("repeated identical announcements are not timeline changes", () => {
		const session = makeLinkSession(bytesToHex(self));
		const msg = parseLinkMessage(aliveFrom(peer, timeline120))!;
		session.onMessage(msg, 1000);
		const second = session.onMessage(msg, 2000);
		expect(second).toEqual({ isNewPeer: false, timelineChanged: false });
	});

	test("tempo change on the session timeline is a timeline change", () => {
		const session = makeLinkSession(bytesToHex(self));
		session.onMessage(parseLinkMessage(aliveFrom(peer, timeline120))!, 1000);
		const changed = session.onMessage(
			parseLinkMessage(
				aliveFrom(peer, { ...timeline120, microsPerBeat: 400_000 }),
			)!,
			2000,
		);
		expect(changed.timelineChanged).toBe(true);
		expect(session.tempo(2000)).toBeCloseTo(150, 6);
	});

	test("ignores its own announcements", () => {
		const session = makeLinkSession(bytesToHex(self));
		const event = session.onMessage(
			parseLinkMessage(aliveFrom(self, timeline120))!,
			1000,
		);
		expect(event).toEqual({ isNewPeer: false, timelineChanged: false });
		expect(session.isActive(1000)).toBe(false);
	});

	test("ignores malformed timelines but still tracks the peer", () => {
		const session = makeLinkSession(bytesToHex(self));
		const event = session.onMessage(
			parseLinkMessage(aliveFrom(peer, { ...timeline120, microsPerBeat: 1 }))!,
			1000,
		);
		expect(event.timelineChanged).toBe(false);
		expect(session.peerCount(1000)).toBe(1);
		expect(session.tempo(1000)).toBeNull();
	});

	test("degrades gracefully when the peer times out", () => {
		const session = makeLinkSession(bytesToHex(self));
		session.onMessage(parseLinkMessage(aliveFrom(peer, timeline120, 5))!, 1000);
		expect(session.isActive(5999)).toBe(true);
		expect(session.isActive(6001)).toBe(false);
		expect(session.tempo(6001)).toBeNull();
		expect(session.beatAt(2_000_000, 6001)).toBeNull();
		expect(session.peerCount(6001)).toBe(0);
	});

	test("degrades gracefully on BYEBYE", () => {
		const session = makeLinkSession(bytesToHex(self));
		session.onMessage(parseLinkMessage(aliveFrom(peer, timeline120))!, 1000);
		const bye = parseLinkMessage(
			encodeLinkMessage({
				messageType: LINK_MESSAGE_BYEBYE,
				ttl: 0,
				groupId: 0,
				nodeId: peer,
			}),
		)!;
		session.onMessage(bye, 2000);
		expect(session.isActive(2000)).toBe(false);
		expect(session.tempo(2000)).toBeNull();
	});

	test("a fresh session re-forms after total peer loss", () => {
		const session = makeLinkSession(bytesToHex(self));
		session.onMessage(parseLinkMessage(aliveFrom(peer, timeline120))!, 1000);
		expect(session.isActive(20_000)).toBe(false);
		const rejoin = session.onMessage(
			parseLinkMessage(aliveFrom(peer, timeline120))!,
			21_000,
		);
		expect(rejoin).toEqual({ isNewPeer: true, timelineChanged: true });
		expect(session.tempo(21_000)).toBeCloseTo(120, 6);
	});
});
