/**
 * Touch feedback for show controls.
 *
 * On a stage you are looking at the projection, not the phone. A short buzz on
 * a snap or a state change is the only confirmation available when the screen
 * is in your peripheral vision — and it is the one affordance a touchscreen has
 * that a fader wall does not need to fake.
 *
 * Deliberately conservative:
 * - Feature-detected, never assumed. iOS Safari does not implement `vibrate`,
 *   and calling it there is a silent no-op rather than an error.
 * - Never used for continuous motion. Buzzing on every frame of a drag is
 *   unpleasant and drains the battery an operator needs for the whole set.
 * - Respects `prefers-reduced-motion`, which is the closest standard signal for
 *   "do not add physical noise to my interactions".
 */

/** Confirmation that a control snapped to a detent or toggled. */
export const HAPTIC_TICK_MS = 8;

/** A heavier pulse for a state change that alters the projection. */
export const HAPTIC_COMMIT_MS = 18;

type Vibrator = { vibrate: (pattern: number | number[]) => boolean };

function reducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function vibrator(): Vibrator | null {
  try {
    if (typeof navigator === 'undefined') return null;
    const candidate = navigator as Partial<Vibrator>;
    return typeof candidate.vibrate === 'function' ? (candidate as Vibrator) : null;
  } catch {
    return null;
  }
}

/**
 * Fire a haptic pulse if the platform has one and the operator wants it.
 * Returns whether anything actually happened, which is what tests assert on.
 */
export function haptic(durationMs: number = HAPTIC_TICK_MS): boolean {
  if (durationMs <= 0) return false;
  if (reducedMotion()) return false;
  const device = vibrator();
  if (!device) return false;
  try {
    return device.vibrate(durationMs) !== false;
  } catch {
    return false;
  }
}
