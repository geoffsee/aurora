/**
 * Resolve deck selection between legacy int modes and pack slugs.
 *
 * Rules (issue #238):
 * - Non-empty slug wins; legacy int from entry.legacyIndex, or -1 if none.
 * - Int-only (VST/MIDI/launchpad): map via deck catalog when legacyIndex matches;
 *   when no pack has that index, apply the int and clear the slug (legacy VisualMode
 *   path still works; never invent a non-legacy slug from an int).
 * - Both present in the patch: slug wins.
 * - Empty slug string is treated as absent.
 *
 * VST/MIDI only address packs that declare `legacyIndex` — they cannot select
 * non-legacy (slug-only) packs. See data/README.md.
 */

export type DeckId = 'deck-a' | 'deck-b';

/** Minimal catalog row needed for resolution (public or host snapshot). */
export type CatalogLikeEntry = {
  slug: string;
  legacyIndex?: number;
};

export type DeckSelectionPatch = {
  deckAMode?: number;
  deckBMode?: number;
  deckAPresetSlug?: string;
  deckBPresetSlug?: string;
};

export type PreviousDeckSelection = {
  mode: number;
  slug: string;
};

export type ResolvedDeck = {
  /** Legacy control-bus int; -1 when a non-legacy slug has no legacyIndex. */
  mode: number;
  slug: string;
  source: 'slug' | 'int' | 'previous' | 'fallback';
  warning?: string;
};

export type DeckCatalogs = {
  'deck-a': readonly CatalogLikeEntry[];
  'deck-b': readonly CatalogLikeEntry[];
};

const MODE_KEY = { 'deck-a': 'deckAMode', 'deck-b': 'deckBMode' } as const;
const SLUG_KEY = { 'deck-a': 'deckAPresetSlug', 'deck-b': 'deckBPresetSlug' } as const;

/** Legacy VisualMode bus range (plus -1 for non-legacy slug-only packs). */
export const DECK_MODE_MIN = -1;
export const DECK_MODE_MAX = 48;

export function isNonEmptySlug(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function normalizePresetSlug(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function findBySlug(
  catalog: readonly CatalogLikeEntry[],
  slug: string,
): CatalogLikeEntry | undefined {
  return catalog.find((e) => e.slug === slug);
}

function findByLegacyIndex(
  catalog: readonly CatalogLikeEntry[],
  legacyIndex: number,
): CatalogLikeEntry | undefined {
  return catalog.find((e) => e.legacyIndex === legacyIndex);
}

function clampDeckModeInt(raw: number): number {
  if (raw === -1) return -1;
  if (!Number.isFinite(raw)) return 0;
  const n = Math.floor(raw);
  if (n < 0) return 0;
  if (n > DECK_MODE_MAX) return DECK_MODE_MAX;
  return n;
}

/**
 * Pure patch-based resolution. Only keys present on `patch` participate;
 * empty slug strings are ignored (treated as absent).
 */
export function resolveDeckSelection(
  deck: DeckId,
  patch: DeckSelectionPatch,
  previous: PreviousDeckSelection,
  catalog: readonly CatalogLikeEntry[],
): ResolvedDeck {
  const modeKey = MODE_KEY[deck];
  const slugKey = SLUG_KEY[deck];

  const rawSlug = patch[slugKey];
  const hasSlug = isNonEmptySlug(rawSlug);
  const rawMode = patch[modeKey];
  const hasMode = rawMode !== undefined && rawMode !== null && Number.isFinite(Number(rawMode));

  // Slug wins when non-empty (including when both slug and int are present).
  if (hasSlug) {
    const slug = rawSlug.trim();
    const entry = findBySlug(catalog, slug);
    if (entry) {
      const mode =
        entry.legacyIndex !== undefined && Number.isFinite(entry.legacyIndex)
          ? clampDeckModeInt(entry.legacyIndex)
          : -1;
      return { mode, slug, source: 'slug' };
    }
    // Accept unknown slug so overlay/epoch lag cannot stomp an intentional pick.
    return {
      mode: -1,
      slug,
      source: 'slug',
      warning: `Unknown ${deck} preset slug "${slug}" — mode set to -1 until catalog lists it`,
    };
  }

  if (hasMode) {
    const modeInt = clampDeckModeInt(Number(rawMode));
    const entry = findByLegacyIndex(catalog, modeInt);
    if (entry) {
      return { mode: modeInt, slug: entry.slug, source: 'int' };
    }
    // No pack for this legacy index yet (e.g. builtins not materialized): apply
    // the int for the legacy VisualMode path and clear slug so we never invent
    // a non-legacy identity from an integer alone.
    return {
      mode: modeInt,
      slug: '',
      source: 'int',
      warning:
        modeInt === previous.mode && previous.slug
          ? undefined
          : `No ${deck} catalog pack with legacyIndex ${modeInt}; kept int without slug`,
    };
  }

  // Nothing in patch — keep previous. If slug empty but mode maps, fill slug.
  if (!previous.slug) {
    const entry = findByLegacyIndex(catalog, previous.mode);
    if (entry) {
      return { mode: previous.mode, slug: entry.slug, source: 'fallback' };
    }
  }
  return {
    mode: previous.mode,
    slug: previous.slug,
    source: 'previous',
  };
}

/**
 * Build an effective patch from a full-state source so carried-over slug fields
 * do not mask an intentional int-only change (VST / MIDI / launchpad republish).
 *
 * - Mode changed, slug unchanged (or empty) → int-only patch
 * - Slug changed (or only slug present) → slug participates; slug wins if both
 * - Neither changed → pass through present fields so empty slug can still be filled
 */
export function effectiveDeckPatch(
  deck: DeckId,
  source: DeckSelectionPatch,
  previous: PreviousDeckSelection,
): DeckSelectionPatch {
  const modeKey = MODE_KEY[deck];
  const slugKey = SLUG_KEY[deck];

  const rawSlug = source[slugKey];
  const slugNonEmpty = isNonEmptySlug(rawSlug);
  const slugVal = slugNonEmpty ? rawSlug.trim() : undefined;

  const rawMode = source[modeKey];
  const modeProvided =
    rawMode !== undefined && rawMode !== null && Number.isFinite(Number(rawMode));
  const modeVal = modeProvided ? clampDeckModeInt(Number(rawMode)) : undefined;

  const modeChanged = modeProvided && modeVal !== previous.mode;
  const slugChanged = slugNonEmpty && slugVal !== previous.slug;

  // Full-state republish: mode moved, slug field was only carried from previous.
  if (modeChanged && !slugChanged) {
    return { [modeKey]: modeVal };
  }

  const out: DeckSelectionPatch = {};
  if (slugNonEmpty) out[slugKey] = slugVal;
  if (modeProvided) out[modeKey] = modeVal;
  return out;
}

export function resolveDeckSelectionFromState(
  deck: DeckId,
  source: DeckSelectionPatch,
  previous: PreviousDeckSelection,
  catalog: readonly CatalogLikeEntry[],
): ResolvedDeck {
  return resolveDeckSelection(deck, effectiveDeckPatch(deck, source, previous), previous, catalog);
}

export type DeckSlugFields = {
  deckAMode: number;
  deckBMode: number;
  deckAPresetSlug: string;
  deckBPresetSlug: string;
};

/**
 * Resolve both decks from a (possibly int-only) control-state fragment.
 * Used by session/show-preset migration and bridge coerce.
 */
export function resolveBothDeckSelections(
  source: DeckSelectionPatch,
  previous: { deckA: PreviousDeckSelection; deckB: PreviousDeckSelection },
  catalogs: DeckCatalogs,
): DeckSlugFields & { warnings: string[] } {
  const a = resolveDeckSelectionFromState('deck-a', source, previous.deckA, catalogs['deck-a']);
  const b = resolveDeckSelectionFromState('deck-b', source, previous.deckB, catalogs['deck-b']);
  const warnings: string[] = [];
  if (a.warning) warnings.push(a.warning);
  if (b.warning) warnings.push(b.warning);
  return {
    deckAMode: a.mode,
    deckBMode: b.mode,
    deckAPresetSlug: a.slug,
    deckBPresetSlug: b.slug,
    warnings,
  };
}

/**
 * Migrate int-only show/session state to include slugs when the catalog can
 * map them. Unmapped ints are kept (fallback); warnings are returned for banners.
 */
export function migrateDeckSlugsInState(
  state: DeckSelectionPatch & { deckAMode?: number; deckBMode?: number },
  catalogs: DeckCatalogs,
  defaults: DeckSlugFields = {
    deckAMode: 0,
    deckBMode: 1,
    deckAPresetSlug: '',
    deckBPresetSlug: '',
  },
): DeckSlugFields & { warnings: string[] } {
  const prevA: PreviousDeckSelection = {
    mode: defaults.deckAMode,
    slug: defaults.deckAPresetSlug,
  };
  const prevB: PreviousDeckSelection = {
    mode: defaults.deckBMode,
    slug: defaults.deckBPresetSlug,
  };
  // Prefer explicit ints from the saved preset; empty slug forces int path.
  const source: DeckSelectionPatch = {
    deckAMode:
      state.deckAMode !== undefined && Number.isFinite(Number(state.deckAMode))
        ? Number(state.deckAMode)
        : defaults.deckAMode,
    deckBMode:
      state.deckBMode !== undefined && Number.isFinite(Number(state.deckBMode))
        ? Number(state.deckBMode)
        : defaults.deckBMode,
  };
  if (isNonEmptySlug(state.deckAPresetSlug)) {
    source.deckAPresetSlug = state.deckAPresetSlug.trim();
  }
  if (isNonEmptySlug(state.deckBPresetSlug)) {
    source.deckBPresetSlug = state.deckBPresetSlug.trim();
  }
  return resolveBothDeckSelections(source, { deckA: prevA, deckB: prevB }, catalogs);
}
