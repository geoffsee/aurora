// Clock-source arbitration for the OSC tempo mirror.
//
// A live set can run Ableton Link and MIDI clock at the same time, and both can
// disagree about the current tempo. Without a fixed priority the tempo mirror
// flaps between the two sources mid-set as each one keeps publishing. This module
// defines the single priority order every broadcast path consults.
//
// Priority (highest first): Link > MIDI clock > internal.
//   - "link"     — the Ableton Link shared session clock peers agree on.
//   - "midi"     — external MIDI clock, the next-best hardware/DAW sync.
//   - "internal" — the AbletonOSC / default tempo that flows when no external
//                  sync source is present. Always available as the floor.
//
// When a higher-priority source drops, the next one down takes over with no gap
// (graceful fallback): "internal" is always selectable, so selectTempoSource
// never returns null.

export type ClockSource = "link" | "midi" | "internal";

export const CLOCK_PRIORITY = ["link", "midi", "internal"] as const;

export type ClockActivity = {
	linkActive: boolean;
	midiActive: boolean;
};

// Pick the authoritative tempo source from the set of currently active sources.
export function selectTempoSource(activity: ClockActivity): ClockSource {
	if (activity.linkActive) return "link";
	if (activity.midiActive) return "midi";
	return "internal";
}
