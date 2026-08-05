import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PREVIEW_ENABLED_KEY } from '../../web/controls/lib/constants.ts';
import {
  loadPreviewEnabled,
  parsePreviewEnabled,
  savePreviewEnabled,
} from '../../web/controls/lib/preview-preference.ts';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
});

describe('parsePreviewEnabled', () => {
  test('defaults to false when missing', () => {
    expect(parsePreviewEnabled(null)).toBe(false);
  });

  test('accepts true / 1 (case-insensitive, trimmed)', () => {
    expect(parsePreviewEnabled('true')).toBe(true);
    expect(parsePreviewEnabled('TRUE')).toBe(true);
    expect(parsePreviewEnabled(' 1 ')).toBe(true);
  });

  test('rejects false, empty, and garbage', () => {
    expect(parsePreviewEnabled('false')).toBe(false);
    expect(parsePreviewEnabled('0')).toBe(false);
    expect(parsePreviewEnabled('')).toBe(false);
    expect(parsePreviewEnabled('yes')).toBe(false);
    expect(parsePreviewEnabled('on')).toBe(false);
  });
});

describe('loadPreviewEnabled / savePreviewEnabled', () => {
  test('load returns false when storage is empty', () => {
    expect(loadPreviewEnabled()).toBe(false);
  });

  test('round-trips true and false under the stable key', () => {
    savePreviewEnabled(true);
    expect(localStorage.getItem(PREVIEW_ENABLED_KEY)).toBe('true');
    expect(loadPreviewEnabled()).toBe(true);

    savePreviewEnabled(false);
    expect(localStorage.getItem(PREVIEW_ENABLED_KEY)).toBe('false');
    expect(loadPreviewEnabled()).toBe(false);
  });

  test('load treats corrupt values as disabled', () => {
    localStorage.setItem(PREVIEW_ENABLED_KEY, 'maybe');
    expect(loadPreviewEnabled()).toBe(false);
  });
});
