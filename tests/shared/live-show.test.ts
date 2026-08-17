import { describe, expect, test } from 'vitest';
import {
  clampShowDuration,
  coalesceAudienceFrames,
  filterAudienceFrame,
  LIVE_SHOW_DEFAULT_DURATION_MS,
  LIVE_SHOW_MAX_DURATION_MS,
  LIVE_SHOW_MIN_DURATION_MS,
  resolveShowIngress,
} from '../../shared/live-show.ts';

describe('live-show audience contract', () => {
  test('allows renderer state and excludes diagnostics/control-plane frames', () => {
    expect(
      filterAudienceFrame({ address: '/aurora/control/state', args: [{ crossfade: 0.5 }] }),
    ).toEqual({ address: '/aurora/control/state', args: [{ crossfade: 0.5 }] });
    expect(
      filterAudienceFrame({ address: '/aurora/server/diagnostics', args: [{ sockets: 3 }] }),
    ).toBeNull();
    expect(
      filterAudienceFrame({ address: '/aurora/error', error: 'secret host failed' }),
    ).toBeNull();
    expect(filterAudienceFrame({ address: '/aurora/pong', id: 1 })).toBeNull();
    expect(filterAudienceFrame({ address: '/aurora/automation/play', args: [] })).toBeNull();
  });

  test('coalesces meters/state but retains ordered cue changes', () => {
    const frames = coalesceAudienceFrames([
      { address: '/live/song/get/track_data', args: [0.1] },
      { address: '/aurora/control/state', args: [{ cueVersion: 1, flashVersion: 0 }] },
      { address: '/live/song/get/track_data', args: [0.9] },
      { address: '/aurora/control/state', args: [{ cueVersion: 2, flashVersion: 0 }] },
      {
        address: '/aurora/control/state',
        args: [{ cueVersion: 2, flashVersion: 0, intensity: 1 }],
      },
    ]);
    expect(frames.filter((frame) => frame.address === '/live/song/get/track_data')).toEqual([
      { address: '/live/song/get/track_data', args: [0.9] },
    ]);
    expect(
      frames
        .filter((frame) => frame.address === '/aurora/control/state')
        .map((frame) => (frame.args?.[0] as { cueVersion?: number } | undefined)?.cueVersion),
    ).toEqual([1, 2]);
  });

  test('duration is immediate and bounded to 15 minutes through 24 hours', () => {
    expect(clampShowDuration(undefined)).toBe(LIVE_SHOW_DEFAULT_DURATION_MS);
    expect(clampShowDuration(1)).toBe(LIVE_SHOW_MIN_DURATION_MS);
    expect(clampShowDuration(Number.MAX_SAFE_INTEGER)).toBe(LIVE_SHOW_MAX_DURATION_MS);
  });

  test('selects external ingress without a connector and honors explicit mode', () => {
    expect(resolveShowIngress(undefined, false)).toBe('external');
    expect(resolveShowIngress(undefined, true)).toBe('cloudflare');
    expect(resolveShowIngress('external', true)).toBe('external');
    expect(resolveShowIngress('cloudflare', false)).toBe('cloudflare');
  });
});
