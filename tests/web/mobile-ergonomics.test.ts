import { afterEach, describe, expect, test, vi } from 'vitest';
import { HAPTIC_COMMIT_MS, HAPTIC_TICK_MS, haptic } from '../../web/mobile/lib/haptics.ts';
import {
  COMPACT_LAYOUT_QUERY,
  COMPACT_SIZES,
  ROOMY_SIZES,
  sizesFor,
} from '../../web/mobile/lib/layout.ts';
import { describeConnectionAlert } from '../../web/mobile/lib/status.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('compact layout sizing', () => {
  test('pinned chrome shrinks on a short viewport', () => {
    // A phone in landscape has ~380px of height; panic + tabs at roomy sizes
    // take nearly two-fifths of it, which is the point at which generous
    // controls become the reason you cannot see the show.
    expect(sizesFor(true)).toEqual(COMPACT_SIZES);
    expect(sizesFor(false)).toEqual(ROOMY_SIZES);
    expect(Number.parseFloat(COMPACT_SIZES.controlHeight)).toBeLessThan(
      Number.parseFloat(ROOMY_SIZES.controlHeight),
    );
  });

  test('keys off height, not orientation', () => {
    // A tablet in landscape is still tall enough for roomy sizing; a
    // split-screen phone in portrait is not.
    expect(COMPACT_LAYOUT_QUERY).toContain('max-height');
    expect(COMPACT_LAYOUT_QUERY).not.toContain('orientation');
  });

  test('both size sets keep panic separated from the tab row', () => {
    expect(COMPACT_SIZES.separatorGap).toBeGreaterThan(0);
    expect(ROOMY_SIZES.separatorGap).toBeGreaterThan(0);
  });
});

describe('haptics', () => {
  function stubVibrate(matches = false) {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal('window', { matchMedia: () => ({ matches }) });
    return vibrate;
  }

  test('fires when the platform supports it', () => {
    const vibrate = stubVibrate();
    expect(haptic()).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_TICK_MS);
  });

  test('a commit pulse is heavier than a tick', () => {
    expect(HAPTIC_COMMIT_MS).toBeGreaterThan(HAPTIC_TICK_MS);
  });

  test('no-ops where vibrate does not exist (iOS Safari)', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(haptic()).toBe(false);
  });

  test('respects prefers-reduced-motion', () => {
    // The closest standard signal for "do not add physical noise to my
    // interactions"; honouring it costs nothing.
    const vibrate = stubVibrate(true);
    expect(haptic()).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  test('survives a vibrate that throws', () => {
    vi.stubGlobal('navigator', {
      vibrate() {
        throw new Error('blocked');
      },
    });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(haptic()).toBe(false);
  });

  test('a zero-length pulse is not a pulse', () => {
    const vibrate = stubVibrate();
    expect(haptic(0)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('describeConnectionAlert', () => {
  const at = (status: 'live' | 'error' | 'connecting' | 'static', remote = false) =>
    describeConnectionAlert({ status, target: 'https://show.lan:8444', remote });

  test('stays out of the way while connected', () => {
    expect(at('live')).toBeNull();
  });

  test('names the address it cannot reach', () => {
    // The failure this prevents: moving a fader for thirty seconds before
    // noticing the show is not responding.
    const alert = at('error');
    expect(alert?.tone).toBe('error');
    expect(alert?.detail).toContain('show.lan:8444');
  });

  test('a remote instance gets the certificate hint, a local one does not', () => {
    expect(at('error', true)?.detail).toContain('certificate');
    expect(at('error', false)?.detail).not.toContain('certificate');
  });

  test('reconnecting is a warning, not an error', () => {
    expect(at('connecting')?.tone).toBe('warn');
  });

  test('static hosting says controls move nothing', () => {
    const alert = at('static');
    expect(alert?.tone).toBe('warn');
    expect(alert?.detail).toContain('move nothing');
  });
});
