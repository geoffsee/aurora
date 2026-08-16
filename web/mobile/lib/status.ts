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

export type ConnectionAlert = {
  title: string;
  detail: string;
  /** `error` reads as red, `warn` as amber. */
  tone: 'error' | 'warn';
};

export type ConnectionAlertInput = {
  status: BridgeStatus;
  /** The instance this phone is pointed at, for the "wrong box" case. */
  target: string;
  /** True when driving a bridge other than the origin that served the page. */
  remote: boolean;
};

/**
 * A full-width strip for when the phone is not actually driving anything.
 *
 * The status pills are correct but they are small, and on a bright stage a
 * grey "No bridge" chip is indistinguishable from a live one at arm's length.
 * The failure mode this prevents is an operator moving a fader for thirty
 * seconds before noticing the show is not responding — so a disconnected phone
 * says so across the full width, in words, with the address it is trying.
 *
 * Returns null while connected, which is almost always.
 */
export function describeConnectionAlert(input: ConnectionAlertInput): ConnectionAlert | null {
  switch (input.status) {
    case 'error':
      return {
        title: 'Not connected',
        detail: input.remote
          ? `Cannot reach ${input.target}. Check the address, and that this phone has accepted its certificate.`
          : `Cannot reach ${input.target}. The show machine may be off the network.`,
        tone: 'error',
      };
    case 'connecting':
      return { title: 'Reconnecting…', detail: `Trying ${input.target}.`, tone: 'warn' };
    case 'static':
      return {
        title: 'Preview only',
        detail: 'No bridge behind this page — controls move nothing until you pair or connect.',
        tone: 'warn',
      };
    default:
      return null;
  }
}
