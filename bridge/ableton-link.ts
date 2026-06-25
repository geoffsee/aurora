// Ableton Link shared-clock integration helpers.
//
// The actual Link session is provided by the optional native `abletonlink`
// module, loaded lazily in index.ts only when ABLETON_LINK_ENABLED=1. The pure
// functions here turn a Link timeline snapshot into the tempo/beat values that
// flow onto the AbletonOSC mirror addresses, so they can be unit-tested without
// the native dependency.

export const LINK_TEMPO_MIN = 40;
export const LINK_TEMPO_MAX = 240;
export const LINK_DEFAULT_QUANTUM = 4;
// Poll cadence matches the AbletonOSC track/tempo poll in index.ts.
export const LINK_UPDATE_INTERVAL_MS = 50;
// A session counts as active while updates keep arriving within this window.
export const LINK_TIMEOUT_MS = 2000;

export type LinkSnapshot = {
	beat: number;
	phase: number;
	bpm: number;
	numPeers: number;
};

export type LinkFrame = {
	tempo: number;
	beat: number;
};

// Wrap a Link phase/beat into the [0, quantum) bar-relative range the renderer
// expects on /live/song/get/beat.
export function wrapPhase(phase: number, quantum: number): number {
	const q = Number.isFinite(quantum) && quantum > 0 ? quantum : LINK_DEFAULT_QUANTUM;
	if (!Number.isFinite(phase)) return 0;
	return ((phase % q) + q) % q;
}

// Convert a Link snapshot into the tempo + beat-phase frame for the OSC mirrors.
// Returns null when the tempo is outside the supported range so callers leave
// the existing mirror value untouched.
export function deriveLinkFrame(
	snapshot: LinkSnapshot,
	quantum: number = LINK_DEFAULT_QUANTUM,
): LinkFrame | null {
	const tempo = Number(snapshot.bpm);
	if (!Number.isFinite(tempo) || tempo < LINK_TEMPO_MIN || tempo > LINK_TEMPO_MAX) {
		return null;
	}
	return { tempo, beat: wrapPhase(snapshot.phase, quantum) };
}

// A Link session is "active" while it keeps producing updates. With zero peers
// Link still runs its own timeline, so peer count does not gate activity — this
// is what lets the bridge degrade gracefully when no peers are present.
export function isLinkActive(
	lastUpdateAt: number,
	now: number,
	timeoutMs: number = LINK_TIMEOUT_MS,
): boolean {
	return lastUpdateAt > 0 && now - lastUpdateAt < timeoutMs;
}
