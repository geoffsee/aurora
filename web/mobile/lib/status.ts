/**
 * Status derivations for the mobile header.
 *
 * Pure so the labels an operator squints at in a dark room are testable — the
 * console derives the same things inline in StatusHeader, but a phone has room
 * for roughly three pills, so the wording is shorter and the priority explicit.
 */

import type { PillState } from '../../controls/components/ui.tsx';
import type { BridgeStatus } from '../../controls/lib/types.ts';

export type StatusPillModel = { label: string; state: PillState };

/** Connection to the instance this phone is driving. */
export function describeBridge(status: BridgeStatus): StatusPillModel {
  switch (status) {
    case 'live':
      return { label: 'Live', state: 'live' };
    case 'static':
      return { label: 'Static', state: 'static' };
    case 'error':
      return { label: 'No bridge', state: 'error' };
    default:
      return { label: 'Connecting', state: 'connecting' };
  }
}

export type AudioSourceInput = {
  demoMode: boolean;
  /** Browser mic frames seen recently (this phone, or another client). */
  browserAudioLive: boolean;
  /** AbletonOSC frames seen recently. */
  oscLive: boolean;
};

/**
 * Priority mirrors the console: an explicit demo overrides everything, then
 * mic, then OSC. Phones normally run on mic, so "Mic" is the expected label.
 */
export function describeAudioSource(input: AudioSourceInput): StatusPillModel {
  if (input.demoMode) return { label: 'Demo', state: 'demo' };
  if (input.browserAudioLive) return { label: 'Mic', state: 'live' };
  if (input.oscLive) return { label: 'OSC', state: 'live' };
  return { label: 'No audio', state: 'idle' };
}

/**
 * Round-trip latency to the instance. Thresholds match the console so the same
 * number does not read "good" on one surface and "bad" on the other.
 */
export function describeLatency(latencyP95: number | null): StatusPillModel {
  if (latencyP95 === null) return { label: '— ms', state: 'info' };
  const label = `${Math.round(latencyP95)} ms`;
  if (latencyP95 < 30) return { label, state: 'live' };
  if (latencyP95 < 100) return { label, state: 'info' };
  return { label, state: 'warn' };
}

/** True when a timestamped feed counts as current. */
export function isFeedLive(lastFrameAt: number, now: number, windowMs = 3000): boolean {
  return now - lastFrameAt < windowMs;
}
