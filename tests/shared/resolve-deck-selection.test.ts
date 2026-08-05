import { describe, expect, test } from 'vitest';
import {
  effectiveDeckPatch,
  migrateDeckSlugsInState,
  resolveBothDeckSelections,
  resolveDeckSelection,
  resolveDeckSelectionFromState,
  type CatalogLikeEntry,
} from '../../shared/resolve-deck-selection.ts';

const DECK_A: CatalogLikeEntry[] = [
  { slug: 'beams', legacyIndex: 0 },
  { slug: 'tunnel', legacyIndex: 1 },
  { slug: 'wash', legacyIndex: 4 },
  // Non-legacy overlay pack — no VST int mapping.
  { slug: 'supernova' },
];

const DECK_B: CatalogLikeEntry[] = [
  { slug: 'beams', legacyIndex: 0 },
  { slug: 'tunnel', legacyIndex: 1 },
  { slug: 'mirror', legacyIndex: 3 },
];

const prev = (mode: number, slug: string) => ({ mode, slug });

describe('resolveDeckSelection — slug path', () => {
  test('non-empty slug wins and derives legacy int from legacyIndex', () => {
    const r = resolveDeckSelection(
      'deck-a',
      { deckAPresetSlug: 'tunnel', deckAMode: 0 },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(r).toMatchObject({ mode: 1, slug: 'tunnel', source: 'slug' });
  });

  test('non-legacy slug with no legacyIndex → mode -1', () => {
    const r = resolveDeckSelection(
      'deck-a',
      { deckAPresetSlug: 'supernova' },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(r).toMatchObject({ mode: -1, slug: 'supernova', source: 'slug' });
  });

  test('empty slug string is treated as absent (falls through to int)', () => {
    const r = resolveDeckSelection(
      'deck-a',
      { deckAPresetSlug: '  ', deckAMode: 4 },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(r).toMatchObject({ mode: 4, slug: 'wash', source: 'int' });
  });

  test('both present: slug wins over int', () => {
    const r = resolveDeckSelection(
      'deck-a',
      { deckAPresetSlug: 'beams', deckAMode: 4 },
      prev(4, 'wash'),
      DECK_A,
    );
    expect(r.slug).toBe('beams');
    expect(r.mode).toBe(0);
    expect(r.source).toBe('slug');
  });

  test('unknown slug is accepted with mode -1 and a warning', () => {
    const r = resolveDeckSelection(
      'deck-a',
      { deckAPresetSlug: 'not-in-catalog' },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(r.mode).toBe(-1);
    expect(r.slug).toBe('not-in-catalog');
    expect(r.source).toBe('slug');
    expect(r.warning).toMatch(/Unknown/);
  });
});

describe('resolveDeckSelection — int path (VST/MIDI)', () => {
  test('int maps to slug via legacyIndex', () => {
    const r = resolveDeckSelection(
      'deck-a',
      { deckAMode: 1 },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(r).toMatchObject({ mode: 1, slug: 'tunnel', source: 'int' });
  });

  test('int without catalog pack keeps int and clears slug (no invented non-legacy)', () => {
    const r = resolveDeckSelection(
      'deck-a',
      { deckAMode: 12 },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(r.mode).toBe(12);
    expect(r.slug).toBe('');
    expect(r.source).toBe('int');
  });

  test('VST/MIDI cannot select non-legacy packs via int path', () => {
    // supernova has no legacyIndex — only reachable by slug.
    const viaInt = resolveDeckSelection(
      'deck-a',
      { deckAMode: -1 },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(viaInt.slug).not.toBe('supernova');
    expect(viaInt.slug).toBe('');

    const viaSlug = resolveDeckSelection(
      'deck-a',
      { deckAPresetSlug: 'supernova' },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(viaSlug.slug).toBe('supernova');
    expect(viaSlug.mode).toBe(-1);
  });

  test('out-of-range int is clamped into the legacy bus range', () => {
    const r = resolveDeckSelection(
      'deck-a',
      { deckAMode: 99 },
      prev(0, 'beams'),
      DECK_A,
    );
    expect(r.mode).toBe(48);
  });
});

describe('resolveDeckSelection — previous / fallback', () => {
  test('empty patch keeps previous', () => {
    const r = resolveDeckSelection('deck-b', {}, prev(3, 'mirror'), DECK_B);
    expect(r).toMatchObject({ mode: 3, slug: 'mirror', source: 'previous' });
  });

  test('empty patch fills slug from previous mode when slug empty', () => {
    const r = resolveDeckSelection('deck-a', {}, prev(0, ''), DECK_A);
    expect(r).toMatchObject({ mode: 0, slug: 'beams', source: 'fallback' });
  });
});

describe('effectiveDeckPatch / resolveDeckSelectionFromState', () => {
  test('mode change with carried slug is treated as int-only', () => {
    const previous = prev(0, 'beams');
    const source = { deckAMode: 4, deckAPresetSlug: 'beams' };
    expect(effectiveDeckPatch('deck-a', source, previous)).toEqual({ deckAMode: 4 });

    const r = resolveDeckSelectionFromState('deck-a', source, previous, DECK_A);
    expect(r).toMatchObject({ mode: 4, slug: 'wash', source: 'int' });
  });

  test('slug change wins even when mode also changes', () => {
    const previous = prev(0, 'beams');
    const source = { deckAMode: 4, deckAPresetSlug: 'supernova' };
    const r = resolveDeckSelectionFromState('deck-a', source, previous, DECK_A);
    expect(r).toMatchObject({ mode: -1, slug: 'supernova', source: 'slug' });
  });

  test('unchanged full state re-resolves consistently', () => {
    const previous = prev(1, 'tunnel');
    const source = { deckAMode: 1, deckAPresetSlug: 'tunnel' };
    const r = resolveDeckSelectionFromState('deck-a', source, previous, DECK_A);
    expect(r).toMatchObject({ mode: 1, slug: 'tunnel', source: 'slug' });
  });
});

describe('resolveBothDeckSelections / migrateDeckSlugsInState', () => {
  test('resolves both decks independently', () => {
    const r = resolveBothDeckSelections(
      { deckAMode: 0, deckBMode: 1 },
      {
        deckA: prev(0, ''),
        deckB: prev(1, ''),
      },
      { 'deck-a': DECK_A, 'deck-b': DECK_B },
    );
    expect(r.deckAPresetSlug).toBe('beams');
    expect(r.deckBPresetSlug).toBe('tunnel');
    expect(r.deckAMode).toBe(0);
    expect(r.deckBMode).toBe(1);
  });

  test('int-only show preset migrates slugs when catalog maps them', () => {
    const r = migrateDeckSlugsInState(
      { deckAMode: 4, deckBMode: 3 },
      { 'deck-a': DECK_A, 'deck-b': DECK_B },
    );
    expect(r.deckAMode).toBe(4);
    expect(r.deckAPresetSlug).toBe('wash');
    expect(r.deckBMode).toBe(3);
    expect(r.deckBPresetSlug).toBe('mirror');
    expect(r.warnings).toHaveLength(0);
  });

  test('int-only show preset falls back cleanly when catalog lacks the index', () => {
    const r = migrateDeckSlugsInState(
      { deckAMode: 12, deckBMode: 7 },
      { 'deck-a': DECK_A, 'deck-b': DECK_B },
    );
    expect(r.deckAMode).toBe(12);
    expect(r.deckAPresetSlug).toBe('');
    expect(r.deckBMode).toBe(7);
    expect(r.deckBPresetSlug).toBe('');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  test('slug on show preset wins over int', () => {
    const r = migrateDeckSlugsInState(
      { deckAMode: 0, deckAPresetSlug: 'supernova', deckBMode: 1 },
      { 'deck-a': DECK_A, 'deck-b': DECK_B },
    );
    expect(r.deckAMode).toBe(-1);
    expect(r.deckAPresetSlug).toBe('supernova');
    expect(r.deckBPresetSlug).toBe('tunnel');
  });
});
