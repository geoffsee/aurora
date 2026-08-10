import { describe, expect, test } from 'vitest';
import {
  formatPairingCode,
  generatePairingCode,
  generateSessionToken,
  isValidPairingCode,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
} from '../../shared/pairing-code.ts';

/** Deterministic byte source so generation is testable. */
function bytesFrom(values: number[]) {
  let cursor = 0;
  return (length: number) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      out[i] = values[cursor % values.length] ?? 0;
      cursor += 1;
    }
    return out;
  };
}

describe('alphabet', () => {
  test('excludes every visually ambiguous character', () => {
    for (const banned of ['0', '1', 'I', 'L', 'O', 'U']) {
      expect(PAIRING_CODE_ALPHABET).not.toContain(banned);
    }
  });

  test('is 30 characters, giving ~6.6e11 codes at length 8', () => {
    expect(PAIRING_CODE_ALPHABET.length).toBe(30);
    expect(PAIRING_CODE_LENGTH).toBe(8);
    expect(PAIRING_CODE_ALPHABET.length ** PAIRING_CODE_LENGTH).toBeGreaterThan(6e11);
  });
});

describe('generatePairingCode', () => {
  test('produces a valid code of the expected length', () => {
    const code = generatePairingCode();
    expect(code).toHaveLength(PAIRING_CODE_LENGTH);
    expect(isValidPairingCode(code)).toBe(true);
  });

  test('maps bytes through the alphabet', () => {
    expect(generatePairingCode(bytesFrom([0]), 4)).toBe('2222');
    expect(generatePairingCode(bytesFrom([0, 1, 2, 3]), 4)).toBe('2345');
  });

  test('rejects biased bytes rather than folding them in', () => {
    // 240 is the first byte at/above the largest multiple of 30 — taking it
    // would over-represent the first 16 letters. It must be skipped, so the
    // code comes entirely from the following byte.
    expect(generatePairingCode(bytesFrom([240, 0]), 2)).toBe('22');
    expect(generatePairingCode(bytesFrom([255, 5]), 1)).toBe('7');
  });

  test('draws from the whole alphabet over many codes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      for (const char of generatePairingCode()) seen.add(char);
    }
    expect(seen.size).toBe(PAIRING_CODE_ALPHABET.length);
  });

  test('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generatePairingCode()));
    expect(codes.size).toBe(200);
  });
});

describe('normalizePairingCode', () => {
  test('uppercases and strips separators', () => {
    expect(normalizePairingCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizePairingCode(' ab cd - ef gh ')).toBe('ABCDEFGH');
  });

  test('survives non-string input', () => {
    expect(normalizePairingCode(undefined as unknown as string)).toBe('');
  });
});

describe('isValidPairingCode', () => {
  test('accepts a well-formed code', () => {
    expect(isValidPairingCode('ABCD2345')).toBe(true);
  });

  test('rejects wrong length, ambiguous characters, and junk', () => {
    expect(isValidPairingCode('ABCD234')).toBe(false);
    expect(isValidPairingCode('ABCD23450')).toBe(false);
    // O and I are not in the alphabet precisely so they cannot be mistyped in.
    expect(isValidPairingCode('ABCDIOU2')).toBe(false);
    expect(isValidPairingCode('abcd2345')).toBe(false);
    expect(isValidPairingCode('')).toBe(false);
  });
});

describe('formatPairingCode', () => {
  test('groups into fours for reading at distance', () => {
    expect(formatPairingCode('ABCD2345')).toBe('ABCD-2345');
    expect(formatPairingCode('abcd2345')).toBe('ABCD-2345');
  });

  test('passes through partial input unchanged', () => {
    expect(formatPairingCode('ABC')).toBe('ABC');
  });
});

describe('generateSessionToken', () => {
  test('is URL-safe and unpadded', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  test('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
    expect(tokens.size).toBe(100);
  });
});
