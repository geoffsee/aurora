/**
 * Pure helpers for the dynamic per-deck mode launchpad (#241).
 * Grouping is by preset `uiGroup` (not fixed CATEGORY_RANGES int slices).
 */

import type { AuthoredPackage } from '../../../shared/package-channel.ts';
import { type ModeCategory, VISUAL_MODE_CATALOG } from '../../../shared/visual-mode-catalog.ts';

export type MenuCatalogEntry = {
  slug: string;
  id?: string;
  label?: string;
  uiGroup?: string;
  legacyIndex?: number;
  source?: string;
};

/** Merge Studio-authored packages into both decks of a public catalog snapshot. */
export function mergeAuthoredPackagesIntoCatalog(
  catalog: MenuCatalogSnapshot,
  packages: readonly AuthoredPackage[],
): MenuCatalogSnapshot {
  if (packages.length === 0) return catalog;
  const authored: MenuCatalogEntry[] = packages.map((p) => ({
    slug: p.slug,
    id: p.slug,
    label: p.label,
    uiGroup: p.uiGroup ?? 'field-motion',
    source: 'authored',
  }));
  const mergeDeck = (entries: MenuCatalogEntry[]): MenuCatalogEntry[] => {
    const bySlug = new Map(entries.map((e) => [e.slug, e]));
    for (const a of authored) {
      bySlug.set(a.slug, a);
    }
    return [...bySlug.values()].sort((a, b) =>
      (a.label ?? a.slug).localeCompare(b.label ?? b.slug),
    );
  };
  return {
    ...catalog,
    contentHash: `${catalog.contentHash ?? 'catalog'}+authored:${packages.map((p) => p.slug).join(',')}`,
    decks: {
      'deck-a': mergeDeck(catalog.decks['deck-a'] ?? []),
      'deck-b': mergeDeck(catalog.decks['deck-b'] ?? []),
    },
  };
}

export type MenuCatalogSnapshot = {
  epoch: number;
  scannedAt?: string;
  contentHash?: string;
  decks: {
    'deck-a': MenuCatalogEntry[];
    'deck-b': MenuCatalogEntry[];
  };
};

export type DeckId = 'deck-a' | 'deck-b';

export type MenuGroup = {
  /** Stable group key (raw uiGroup or synthetic). */
  key: string;
  /** Operator-facing label. */
  label: string;
  entries: MenuCatalogEntry[];
};

/** Friendly labels for known ModeCategory / uiGroup strings. */
export const UI_GROUP_LABELS: Readonly<Record<string, string>> = {
  'field-motion': 'Field Motion',
  'structured-space': 'Structured Space',
  'continuous-space': 'Continuous Space',
  'discrete-structure': 'Discrete Structure',
  'abstract-character': 'Abstract',
  figure: '3D',
  original: 'Core',
  geometry: 'Geometry',
  fractals: 'Fractals',
  algebra: 'Algebra',
  combinatorics: 'Combinatorics',
  dynamics: 'Dynamics',
  logic: 'Logic',
  other: 'Other',
};

const CATEGORY_ORDER: readonly ModeCategory[] = [
  'field-motion',
  'figure',
  'structured-space',
  'continuous-space',
  'discrete-structure',
  'abstract-character',
] as const;

function titleCaseFromKey(key: string): string {
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function uiGroupLabel(key: string): string {
  if (!key) return UI_GROUP_LABELS.other ?? 'Other';
  return UI_GROUP_LABELS[key] ?? titleCaseFromKey(key);
}

/**
 * Group catalog entries by `uiGroup`. Missing/empty → "other".
 * Groups ordered by known ModeCategory order, then alpha; entries by label then slug.
 */
export function groupCatalogByUiGroup(entries: readonly MenuCatalogEntry[]): MenuGroup[] {
  const buckets = new Map<string, MenuCatalogEntry[]>();
  for (const entry of entries) {
    const key =
      typeof entry.uiGroup === 'string' && entry.uiGroup.trim() !== ''
        ? entry.uiGroup.trim()
        : 'other';
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }

  const keys = [...buckets.keys()];
  keys.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a as ModeCategory);
    const ib = CATEGORY_ORDER.indexOf(b as ModeCategory);
    const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    if (ra !== rb) return ra - rb;
    if (a === 'other') return 1;
    if (b === 'other') return -1;
    return a.localeCompare(b);
  });

  return keys.map((key) => {
    const list = buckets.get(key) ?? [];
    list.sort((a, b) => {
      const la = (a.label ?? a.slug).localeCompare(b.label ?? b.slug);
      if (la !== 0) return la;
      return a.slug.localeCompare(b.slug);
    });
    return { key, label: uiGroupLabel(key), entries: list };
  });
}

/** Build synthetic menu entries from the legacy VISUAL_MODE_CATALOG (graceful degradation). */
export function legacyFallbackMenuEntries(): MenuCatalogEntry[] {
  return VISUAL_MODE_CATALOG.map((mode) => ({
    slug: `legacy-${mode.id}`,
    id: `legacy-${mode.id}`,
    label: mode.label,
    uiGroup: mode.category,
    legacyIndex: mode.id,
    source: 'legacy-fallback',
  }));
}

export type ActiveSlugStatus = 'ok' | 'missing' | 'empty';

/** Whether the selected slug still exists in the current menu catalog. */
export function activeSlugStatus(
  selectedSlug: string | undefined | null,
  entries: readonly MenuCatalogEntry[],
): ActiveSlugStatus {
  const slug = typeof selectedSlug === 'string' ? selectedSlug.trim() : '';
  if (!slug) return 'empty';
  return entries.some((e) => e.slug === slug) ? 'ok' : 'missing';
}

export type HeldCompiled = {
  wire: unknown;
  epoch: number;
  slug: string;
  deck: DeckId;
};

/**
 * When the menu catalog updates, keep `activeCompiled` unless the operator
 * reselects/reloads. Only updates the menu epoch; never auto-swaps the held wire.
 */
export function applyMenuCatalogUpdate(
  previous: {
    menuEpoch: number;
    activeCompiled: HeldCompiled | null;
  },
  nextCatalog: MenuCatalogSnapshot,
): {
  menuEpoch: number;
  activeCompiled: HeldCompiled | null;
  /** True when active slug is absent from the new catalog (hold last good). */
  holdingMissing: boolean;
} {
  const deck = previous.activeCompiled?.deck;
  const slug = previous.activeCompiled?.slug;
  let holdingMissing = false;
  if (deck && slug) {
    const entries = nextCatalog.decks[deck] ?? [];
    holdingMissing = activeSlugStatus(slug, entries) === 'missing';
  }
  return {
    menuEpoch: nextCatalog.epoch,
    // Explicit: menu epoch changes do not touch the held compiled payload.
    activeCompiled: previous.activeCompiled,
    holdingMissing,
  };
}

/**
 * Accept a newly fetched compiled wire as last-known-good for a deck.
 * Rejects empty slug; always replaces the previous hold for that deck.
 */
export function holdCompiled(
  deck: DeckId,
  slug: string,
  epoch: number,
  wire: unknown,
): HeldCompiled | null {
  const trimmed = slug.trim();
  if (!trimmed || wire == null) return null;
  return { deck, slug: trimmed, epoch, wire };
}

/** Parse a public catalog JSON body into a menu snapshot (defensive). */
export function parsePublicCatalog(raw: unknown): MenuCatalogSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const epoch = Number(o.epoch);
  if (!Number.isInteger(epoch) || epoch < 1) return null;
  const decks = o.decks;
  if (!decks || typeof decks !== 'object') return null;
  const d = decks as Record<string, unknown>;
  const a = Array.isArray(d['deck-a']) ? d['deck-a'] : null;
  const b = Array.isArray(d['deck-b']) ? d['deck-b'] : null;
  if (!a || !b) return null;

  const mapEntry = (item: unknown): MenuCatalogEntry | null => {
    if (!item || typeof item !== 'object') return null;
    const e = item as Record<string, unknown>;
    if (typeof e.slug !== 'string' || e.slug.trim() === '') return null;
    const out: MenuCatalogEntry = { slug: e.slug.trim() };
    if (typeof e.id === 'string') out.id = e.id;
    if (typeof e.label === 'string') out.label = e.label;
    if (typeof e.uiGroup === 'string' && e.uiGroup.trim() !== '') out.uiGroup = e.uiGroup.trim();
    if (typeof e.source === 'string') out.source = e.source;
    if (e.legacyIndex !== undefined && Number.isFinite(Number(e.legacyIndex))) {
      out.legacyIndex = Math.floor(Number(e.legacyIndex));
    }
    return out;
  };

  return {
    epoch,
    scannedAt: typeof o.scannedAt === 'string' ? o.scannedAt : undefined,
    contentHash: typeof o.contentHash === 'string' ? o.contentHash : undefined,
    decks: {
      'deck-a': a.map(mapEntry).filter((e): e is MenuCatalogEntry => e !== null),
      'deck-b': b.map(mapEntry).filter((e): e is MenuCatalogEntry => e !== null),
    },
  };
}

export function deckIdFromSide(side: 'A' | 'B'): DeckId {
  return side === 'A' ? 'deck-a' : 'deck-b';
}

export function holdingBannerText(slug: string): string {
  return `Holding last compiled: ${slug}`;
}
