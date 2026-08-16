/**
 * Viewport-shape helpers for the phone show client.
 *
 * A phone in portrait has room to spend on 3.25 rem controls. The same phone
 * rotated has ~380 px of height, and the pinned panic bar plus tab bar eat
 * nearly two-fifths of it — the controls stop being generous and start being
 * the reason you cannot see the show. So the pinned furniture shrinks when the
 * viewport is short, and only then.
 *
 * Height, not orientation: a tablet in landscape is still tall enough for the
 * comfortable sizes, and a split-screen phone in portrait is not.
 */

import { useEffect, useState } from 'react';

/** Below this, pinned chrome switches to its compact sizing. */
export const COMPACT_LAYOUT_QUERY = '(max-height: 520px)';

export type CompactSizes = {
  /** Height of a pinned panic / tab control. */
  controlHeight: string;
  /** Gap between the panic row and the tab row. */
  separatorGap: number;
  /** Vertical padding inside the pinned footer. */
  footerPadding: number;
};

export const ROOMY_SIZES: CompactSizes = {
  controlHeight: '3.25rem',
  separatorGap: 3,
  footerPadding: 2,
};

export const COMPACT_SIZES: CompactSizes = {
  controlHeight: '2.5rem',
  separatorGap: 2,
  footerPadding: 1,
};

export function sizesFor(compact: boolean): CompactSizes {
  return compact ? COMPACT_SIZES : ROOMY_SIZES;
}

type MediaQueryListLike = {
  matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

/**
 * True while the viewport is short enough to need compact chrome.
 *
 * Subscribes rather than sampling once: rotating a phone mid-set is the exact
 * moment this needs to be right, and it does not remount anything.
 */
export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let query: MediaQueryListLike;
    try {
      query = window.matchMedia(COMPACT_LAYOUT_QUERY);
    } catch {
      return;
    }
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  return compact;
}
