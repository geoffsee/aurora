/**
 * Tab model for the mobile shell.
 *
 * Ordered by how often a hand reaches for them mid-show: Mix is the default
 * because crossfade is the one control you never want to be a tap away from.
 * The panic row lives outside the tabs entirely — see PanicBar.
 */

export const MOBILE_TABS = [
  { id: 'mix', label: 'Mix' },
  { id: 'cues', label: 'Cues' },
  { id: 'params', label: 'Params' },
] as const;

export type MobileTabId = (typeof MOBILE_TABS)[number]['id'];

export const DEFAULT_MOBILE_TAB: MobileTabId = 'mix';

export const MOBILE_TAB_KEY = 'aurora.mobile.tab';

export function isMobileTabId(value: unknown): value is MobileTabId {
  return typeof value === 'string' && MOBILE_TABS.some((tab) => tab.id === value);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Restore the last tab so a screen-locked phone reopens where the operator left it. */
export function loadMobileTab(storage: StorageLike | null = safeStorage()): MobileTabId {
  if (!storage) return DEFAULT_MOBILE_TAB;
  try {
    const raw = storage.getItem(MOBILE_TAB_KEY);
    return isMobileTabId(raw) ? raw : DEFAULT_MOBILE_TAB;
  } catch {
    return DEFAULT_MOBILE_TAB;
  }
}

export function saveMobileTab(tab: MobileTabId, storage: StorageLike | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(MOBILE_TAB_KEY, tab);
  } catch {
    /* private mode — the in-memory tab still works for this session */
  }
}
