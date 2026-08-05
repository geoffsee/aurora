import { PREVIEW_ENABLED_KEY } from './constants.ts';

/**
 * Parse a stored preview-enabled preference.
 * Missing / invalid values default to false so the controls session stays light.
 */
export function parsePreviewEnabled(raw: string | null): boolean {
  if (raw === null) return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0' || normalized === '') return false;
  return false;
}

/** Load whether the embedded projector preview should mount. Defaults to off. */
export function loadPreviewEnabled(): boolean {
  try {
    return parsePreviewEnabled(localStorage.getItem(PREVIEW_ENABLED_KEY));
  } catch {
    return false;
  }
}

/** Persist the embedded preview toggle (best-effort). */
export function savePreviewEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PREVIEW_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // private mode / quota — persistence is best-effort
  }
}
