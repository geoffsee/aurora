import { describe, expect, test } from 'vitest';
import {
  describeAudioSource,
  describeBridge,
  describeLatency,
  isFeedLive,
} from '../../web/mobile/lib/status.ts';
import {
  DEFAULT_MOBILE_TAB,
  isMobileTabId,
  loadMobileTab,
  MOBILE_TAB_KEY,
  MOBILE_TABS,
  saveMobileTab,
} from '../../web/mobile/lib/tabs.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('describeBridge', () => {
  test('maps every bridge status to a short label', () => {
    expect(describeBridge('live')).toEqual({ label: 'Live', state: 'live' });
    expect(describeBridge('static')).toEqual({ label: 'Static', state: 'static' });
    expect(describeBridge('error')).toEqual({ label: 'No bridge', state: 'error' });
    expect(describeBridge('connecting')).toEqual({ label: 'Connecting', state: 'connecting' });
  });
});

describe('describeAudioSource', () => {
  test('demo mode wins over every live feed', () => {
    expect(
      describeAudioSource({ demoMode: true, browserAudioLive: true, oscLive: true }).label,
    ).toBe('Demo');
  });

  test('mic outranks OSC — a phone normally runs on its own mic', () => {
    expect(
      describeAudioSource({ demoMode: false, browserAudioLive: true, oscLive: true }).label,
    ).toBe('Mic');
  });

  test('falls back to OSC, then to nothing', () => {
    expect(
      describeAudioSource({ demoMode: false, browserAudioLive: false, oscLive: true }).label,
    ).toBe('OSC');
    const silent = describeAudioSource({
      demoMode: false,
      browserAudioLive: false,
      oscLive: false,
    });
    expect(silent).toEqual({ label: 'No audio', state: 'idle' });
  });
});

describe('describeLatency', () => {
  test('unknown latency reads neutral', () => {
    expect(describeLatency(null)).toEqual({ label: '— ms', state: 'info' });
  });

  test('thresholds match the console (30 / 100 ms)', () => {
    expect(describeLatency(12).state).toBe('live');
    expect(describeLatency(29.6).label).toBe('30 ms');
    expect(describeLatency(30).state).toBe('info');
    expect(describeLatency(99).state).toBe('info');
    expect(describeLatency(100).state).toBe('warn');
  });
});

describe('isFeedLive', () => {
  test('a feed is live inside the window and stale outside it', () => {
    expect(isFeedLive(1000, 2000)).toBe(true);
    expect(isFeedLive(1000, 4000)).toBe(false);
    expect(isFeedLive(1000, 3999)).toBe(true);
  });
});

describe('mobile tabs', () => {
  test('mix is the default so crossfade is never a tap away', () => {
    expect(DEFAULT_MOBILE_TAB).toBe('mix');
    expect(MOBILE_TABS[0].id).toBe('mix');
  });

  test('validates tab ids', () => {
    expect(isMobileTabId('cues')).toBe(true);
    expect(isMobileTabId('nope')).toBe(false);
    expect(isMobileTabId(null)).toBe(false);
  });

  test('round-trips the last tab', () => {
    const storage = memoryStorage();
    saveMobileTab('params', storage);
    expect(loadMobileTab(storage)).toBe('params');
  });

  test('a junk or missing stored value falls back to the default', () => {
    const storage = memoryStorage();
    expect(loadMobileTab(storage)).toBe(DEFAULT_MOBILE_TAB);
    storage.setItem(MOBILE_TAB_KEY, 'garbage');
    expect(loadMobileTab(storage)).toBe(DEFAULT_MOBILE_TAB);
    expect(loadMobileTab(null)).toBe(DEFAULT_MOBILE_TAB);
  });
});
