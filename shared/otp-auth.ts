/**
 * Wire contract for LAN one-time-password pairing (issue #281).
 *
 * Mirrors the relay's code→token exchange (`shared/relay-session.ts`) so an
 * operator learns one flow whether the show is running on a LAN bridge or the
 * Pages relay. The difference is only who mints: the bridge itself here, a
 * Cloudflare Durable Object there.
 *
 * Minting is gated by `AURORA_ACCESS_TOKEN`; redeeming is deliberately not, or
 * the phone would need the credential it is trying to avoid typing. The code's
 * short TTL, single use, and the bridge's attempt limits are what stand in for
 * that gate — see `bridge/otp-store.ts`.
 */

export const OTP_PATHS = {
  /** POST — Console (token-bearing) asks for a code to read out. */
  mint: '/api/auth/otp',
  /** POST — phone exchanges the code for a session token. Ungated. */
  redeem: '/api/auth/otp/redeem',
  /** POST — Console revokes every phone session. */
  revoke: '/api/auth/otp/revoke',
} as const;

export type OtpMintResponse = { code: string; expiresAt: number };
export type OtpRedeemResponse = { token: string; expiresAt: number };
export type OtpRevokeResponse = { revoked: number };

export type OtpResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseOtpMintResponse(raw: unknown): OtpMintResponse | null {
  if (!isRecord(raw)) return null;
  const code = typeof raw.code === 'string' ? raw.code.trim() : '';
  if (!code) return null;
  return { code, expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : 0 };
}

export function parseOtpRedeemResponse(raw: unknown): OtpRedeemResponse | null {
  if (!isRecord(raw)) return null;
  const token = typeof raw.token === 'string' ? raw.token.trim() : '';
  if (!token) return null;
  return { token, expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : 0 };
}

/** Server-side message when there is one, else a status summary. */
export function parseOtpError(raw: unknown, status: number): string {
  if (isRecord(raw) && typeof raw.error === 'string' && raw.error.trim()) {
    return raw.error.trim();
  }
  return `bridge HTTP ${status}`;
}

async function postOtp(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  const payload: unknown = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, payload };
}

/** Console: ask the bridge for a code to read out. Requires the access token. */
export async function mintOtp(
  origin: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<OtpResult<OtpMintResponse>> {
  try {
    const { ok, status, payload } = await postOtp(
      `${origin}${OTP_PATHS.mint}`,
      {},
      headers,
      fetchImpl,
    );
    if (!ok) return { ok: false, error: parseOtpError(payload, status) };
    const parsed = parseOtpMintResponse(payload);
    if (!parsed) return { ok: false, error: 'bridge returned an unusable code' };
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Phone: exchange a typed code for a session token. No credential needed. */
export async function redeemOtp(
  origin: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OtpResult<OtpRedeemResponse>> {
  try {
    const { ok, status, payload } = await postOtp(
      `${origin}${OTP_PATHS.redeem}`,
      { code },
      {},
      fetchImpl,
    );
    if (!ok) return { ok: false, error: parseOtpError(payload, status) };
    const parsed = parseOtpRedeemResponse(payload);
    if (!parsed) return { ok: false, error: 'bridge returned an unusable session' };
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Console: kick every paired phone (lost handset, end of night). */
export async function revokeOtpSessions(
  origin: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<OtpResult<OtpRevokeResponse>> {
  try {
    const { ok, status, payload } = await postOtp(
      `${origin}${OTP_PATHS.revoke}`,
      {},
      headers,
      fetchImpl,
    );
    if (!ok) return { ok: false, error: parseOtpError(payload, status) };
    const revoked = isRecord(payload) && typeof payload.revoked === 'number' ? payload.revoked : 0;
    return { ok: true, value: { revoked } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
