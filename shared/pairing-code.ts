/**
 * Human-typable pairing codes for relay sessions.
 *
 * The code is what an operator reads off a projector and types into a phone.
 * It is *not* a credential: it is redeemed once, over a rate-limited endpoint,
 * for a long random token that does the actual authenticating. Deriving session
 * identity from anything device-shaped (a fingerprint, say) would make it
 * guessable by anyone with a similar device — the point of a random code is
 * that similarity buys an attacker nothing.
 *
 * Length is 8 rather than the more common 6. 30^8 ≈ 6.6e11 makes blind guessing
 * irrelevant even without per-IP limiting, which is worth one extra typed
 * character given a code is entered once per show.
 */

/** Crockford-ish: no 0/1/I/L/O/U, so nothing is ambiguous on a dim projector. */
export const PAIRING_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PAIRING_CODE_LENGTH = 8;

/** Codes are short-lived; an unredeemed one dies with the set, not the session. */
export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

/** Typo budget before a code is burned (guards the small-space typo path). */
export const MAX_PAIR_ATTEMPTS = 5;

type RandomBytes = (length: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/**
 * Generate a code with rejection sampling.
 *
 * `byte % 30` would bias the first 16 letters of the alphabet upward; drawing
 * again for bytes at/above the largest multiple of 30 keeps it uniform.
 */
export function generatePairingCode(
  randomBytes: RandomBytes = defaultRandomBytes,
  length = PAIRING_CODE_LENGTH,
): string {
  const alphabet = PAIRING_CODE_ALPHABET;
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    const chunk = randomBytes(length);
    for (const byte of chunk) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Normalize operator input: uppercase, drop separators and whitespace.
 * Does not validate — call `isValidPairingCode` on the result.
 */
export function normalizePairingCode(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidPairingCode(code: string): boolean {
  if (typeof code !== 'string' || code.length !== PAIRING_CODE_LENGTH) return false;
  for (const char of code) {
    if (!PAIRING_CODE_ALPHABET.includes(char)) return false;
  }
  return true;
}

/** Display form — two groups of four are easier to read across a dark room. */
export function formatPairingCode(code: string): string {
  const clean = normalizePairingCode(code);
  if (clean.length !== PAIRING_CODE_LENGTH) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

/** Random URL-safe token for the credential a code is exchanged for. */
export function generateSessionToken(
  randomBytes: RandomBytes = defaultRandomBytes,
  byteLength = 32,
): string {
  const bytes = randomBytes(byteLength);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
