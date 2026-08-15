/**
 * Surface routing — send handsets that land on Console to the mobile show
 * client (`/mobile/`) instead of the dense operator Console.
 *
 * The gap this closes is discovery, not capability: `/mobile/` has existed as
 * the touch-first surface, but the only things pointing a phone at it were the
 * CLI `phone` link and typing the path by hand. A QR to the host, a bookmark,
 * or the Pages nav all drop a phone on Console.
 *
 * Detection is capability-first (`pointer: coarse` plus a handset-sized short
 * edge) rather than UA sniffing, so it does not rot with every browser
 * release and does not sweep tablets or touchscreen laptops along with it.
 * Both overrides are honoured (`?mobile=1` / `?console=1`), and a declined
 * offer sticks per-device — the operator is never trapped on either surface.
 *
 * Like the other URL helpers here, every entry point takes a `Pick<Location, …>`
 * and an injected media matcher instead of reading globals, so the decision is
 * a pure function that tests can drive without a browser.
 */

import { staticModesApiBase } from './static-hosting.ts';

/** Query param that pins the visitor to Console (never auto-route). */
export const CONSOLE_OVERRIDE_PARAM = 'console';
/** Query param that forces the mobile client, even on a desktop (QA). */
export const MOBILE_OVERRIDE_PARAM = 'mobile';

/** Remembered per-device surface choice. */
export const SURFACE_PREFERENCE_KEY = 'aurora.surface-preference';

export type SurfacePreference = 'console' | 'mobile';

/**
 * Coarse pointer plus a short edge in handset territory.
 *
 * The `max-height` half is what keeps a phone in landscape classified as a
 * phone: rotating an iPhone takes it to ~932px wide, which no width-only query
 * can tell apart from a laptop. Checking either edge means "the small
 * dimension is phone-sized" in both orientations, while a tablet (~744px short
 * edge at the smallest) stays on Console.
 */
export const HANDSET_MEDIA_QUERY =
  '(pointer: coarse) and ((max-width: 540px) or (max-height: 540px))';

/** The slice of `matchMedia` this module needs. */
export type MediaMatcher = (query: string) => { matches: boolean };

type RoutingLocation = Pick<
  Location,
  'protocol' | 'hostname' | 'port' | 'pathname' | 'search' | 'hash'
>;

export type SurfaceDecision =
  /** Render Console as-is. */
  | { kind: 'stay' }
  /** Handset detected, no standing choice — ask before moving them. */
  | { kind: 'offer'; url: string }
  /** Explicit override or a remembered "mobile" choice — go straight there. */
  | { kind: 'redirect'; url: string };

function defaultMatcher(query: string): { matches: boolean } {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { matches: false };
  }
  try {
    return window.matchMedia(query);
  } catch {
    return { matches: false };
  }
}

/**
 * True when the client looks like a phone.
 * Anything we cannot measure (no `matchMedia`) reads as "not a handset" — an
 * undetected phone costs one tap on the CLI `phone` link; a false positive
 * bounces a laptop operator mid-show.
 */
export function isHandsetClient(matcher: MediaMatcher = defaultMatcher): boolean {
  return matcher(HANDSET_MEDIA_QUERY).matches === true;
}

/**
 * Mobile client URL for whatever origin/layout served this page.
 *
 * `staticModesApiBase` already resolves origin + site path prefix and strips
 * the `/controls` segment, so this lands on `/mobile/` locally, `/mobile/` on
 * the docker controls port, and `/aurora/mobile/` on project Pages.
 *
 * Search params carry over so an `?instance=…&token=…` (or `relay`) link keeps
 * working through the hop — that is the whole point of the QR/printed-link
 * onboarding path. The override params themselves are dropped so the phone
 * does not arrive with stale routing state.
 */
export function mobileClientUrl(loc: RoutingLocation): string {
  const base = staticModesApiBase(loc);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(loc.search ?? '');
  } catch {
    params = new URLSearchParams();
  }
  params.delete(CONSOLE_OVERRIDE_PARAM);
  params.delete(MOBILE_OVERRIDE_PARAM);
  const query = params.toString();
  const hash = loc.hash ?? '';
  return `${base}/mobile/${query ? `?${query}` : ''}${hash}`;
}

/**
 * Console URL from the mobile client — the escape hatch back.
 *
 * Carries `?console=1` so the operator does not get bounced straight back to
 * `/mobile/` on arrival; callers should also persist the `console` preference
 * so the choice outlives the query string.
 */
export function consoleClientUrl(loc: RoutingLocation): string {
  const base = staticModesApiBase(loc);
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(loc.search ?? '');
  } catch {
    params = new URLSearchParams();
  }
  params.delete(MOBILE_OVERRIDE_PARAM);
  params.set(CONSOLE_OVERRIDE_PARAM, '1');
  return `${base}/controls/?${params.toString()}${loc.hash ?? ''}`;
}

function overrideFlag(search: string, param: string): boolean {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? '');
  } catch {
    return false;
  }
  const raw = params.get(param);
  if (raw === null) return false;
  const normalized = raw.trim().toLowerCase();
  // A bare `?mobile` (empty value) reads as "yes" — operators type it by hand.
  return normalized === '' || normalized === '1' || normalized === 'true';
}

/**
 * Decide what a Console entry point should do for this visitor.
 *
 * Precedence, highest first:
 *   1. `?mobile=1`  — force mobile anywhere (QA on a desktop)
 *   2. `?console=1` — pin to Console for this visit
 *   3. stored preference
 *   4. handset detection → offer
 */
export function decideMobileSurface(input: {
  loc: RoutingLocation;
  handset: boolean;
  preference: SurfacePreference | null;
}): SurfaceDecision {
  const { loc, handset, preference } = input;
  const search = loc.search ?? '';

  if (overrideFlag(search, MOBILE_OVERRIDE_PARAM)) {
    return { kind: 'redirect', url: mobileClientUrl(loc) };
  }
  if (overrideFlag(search, CONSOLE_OVERRIDE_PARAM)) return { kind: 'stay' };
  if (preference === 'console') return { kind: 'stay' };
  if (!handset) return { kind: 'stay' };
  // Remembered "mobile" skips the interstitial on every later visit.
  if (preference === 'mobile') return { kind: 'redirect', url: mobileClientUrl(loc) };
  return { kind: 'offer', url: mobileClientUrl(loc) };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Read the remembered surface choice; unknown values read as "no choice". */
export function loadSurfacePreference(
  storage: StorageLike | null = safeStorage(),
): SurfacePreference | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SURFACE_PREFERENCE_KEY);
    return raw === 'console' || raw === 'mobile' ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the surface choice (best-effort); `null` forgets it. */
export function saveSurfacePreference(
  preference: SurfacePreference | null,
  storage: StorageLike | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    if (preference === null) storage.removeItem(SURFACE_PREFERENCE_KEY);
    else storage.setItem(SURFACE_PREFERENCE_KEY, preference);
  } catch {
    // private mode / quota — the choice still holds for this session
  }
}
