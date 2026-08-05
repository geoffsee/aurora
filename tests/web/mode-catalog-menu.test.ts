import { describe, expect, test } from 'vitest';
import { deckPresetSlugPatch, deckReloadActivePatch } from '../../web/controls/lib/deck-mode.ts';
import {
  activeSlugStatus,
  applyMenuCatalogUpdate,
  groupCatalogByUiGroup,
  holdCompiled,
  holdingBannerText,
  legacyFallbackMenuEntries,
  type MenuCatalogEntry,
  type MenuCatalogSnapshot,
  parsePublicCatalog,
} from '../../web/controls/lib/mode-catalog-menu.ts';

const sampleEntries: MenuCatalogEntry[] = [
  { slug: 'beams', label: 'Beams', uiGroup: 'field-motion', legacyIndex: 0 },
  { slug: 'tunnel', label: 'Tunnel', uiGroup: 'field-motion', legacyIndex: 1 },
  { slug: 'figure', label: 'Figure', uiGroup: 'figure', legacyIndex: 24 },
  { slug: 'custom-pack', label: 'Custom', uiGroup: 'operator-special' },
  { slug: 'no-group', label: 'Ungrouped' },
];

describe('groupCatalogByUiGroup', () => {
  test('groups by uiGroup and orders known categories first', () => {
    const groups = groupCatalogByUiGroup(sampleEntries);
    expect(groups.map((g) => g.key)).toEqual([
      'field-motion',
      'figure',
      'operator-special',
      'other',
    ]);
    const field = groups.find((g) => g.key === 'field-motion');
    expect(field?.entries.map((e) => e.slug)).toEqual(['beams', 'tunnel']);
    expect(field?.label).toBe('Field Motion');
    expect(groups.find((g) => g.key === 'other')?.entries[0]?.slug).toBe('no-group');
  });

  test('empty catalog yields empty groups', () => {
    expect(groupCatalogByUiGroup([])).toEqual([]);
  });

  test('strict per-deck: only provided entries appear', () => {
    const deckAOnly = sampleEntries.filter((e) => e.slug !== 'custom-pack');
    const groups = groupCatalogByUiGroup(deckAOnly);
    const slugs = groups.flatMap((g) => g.entries.map((e) => e.slug));
    expect(slugs).not.toContain('custom-pack');
    expect(slugs).toContain('beams');
  });
});

describe('activeSlugStatus / hold last good', () => {
  test('ok when slug is present', () => {
    expect(activeSlugStatus('beams', sampleEntries)).toBe('ok');
  });

  test('missing when slug removed from catalog', () => {
    expect(activeSlugStatus('gone', sampleEntries)).toBe('missing');
  });

  test('empty when no selection', () => {
    expect(activeSlugStatus('', sampleEntries)).toBe('empty');
    expect(activeSlugStatus(null, sampleEntries)).toBe('empty');
  });

  test('holding banner text', () => {
    expect(holdingBannerText('supernova')).toBe('Holding last compiled: supernova');
  });
});

describe('applyMenuCatalogUpdate', () => {
  const held = holdCompiled('deck-a', 'beams', 3, { wireVersion: 1, slug: 'beams' });
  const nextCatalog: MenuCatalogSnapshot = {
    epoch: 4,
    decks: {
      'deck-a': [{ slug: 'tunnel', label: 'Tunnel' }],
      'deck-b': [],
    },
  };

  test('epoch bump refreshes menu only — does not clear activeCompiled', () => {
    const result = applyMenuCatalogUpdate({ menuEpoch: 3, activeCompiled: held }, nextCatalog);
    expect(result.menuEpoch).toBe(4);
    expect(result.activeCompiled).toBe(held);
    expect(result.activeCompiled?.wire).toEqual({ wireVersion: 1, slug: 'beams' });
    expect(result.holdingMissing).toBe(true);
  });

  test('when slug still present, holdingMissing is false', () => {
    const catalogWithBeams: MenuCatalogSnapshot = {
      epoch: 5,
      decks: {
        'deck-a': [{ slug: 'beams' }, { slug: 'tunnel' }],
        'deck-b': [],
      },
    };
    const result = applyMenuCatalogUpdate({ menuEpoch: 4, activeCompiled: held }, catalogWithBeams);
    expect(result.holdingMissing).toBe(false);
    expect(result.activeCompiled).toBe(held);
  });
});

describe('holdCompiled', () => {
  test('rejects empty slug', () => {
    expect(holdCompiled('deck-a', '', 1, { ok: true })).toBeNull();
    expect(holdCompiled('deck-b', '  ', 1, { ok: true })).toBeNull();
  });

  test('stores wire + epoch + slug', () => {
    const h = holdCompiled('deck-b', 'tunnel', 2, { slug: 'tunnel' });
    expect(h).toEqual({
      deck: 'deck-b',
      slug: 'tunnel',
      epoch: 2,
      wire: { slug: 'tunnel' },
    });
  });
});

describe('parsePublicCatalog', () => {
  test('parses a valid public catalog', () => {
    const snap = parsePublicCatalog({
      epoch: 2,
      contentHash: 'abc',
      decks: {
        'deck-a': [{ slug: 'beams', label: 'Beams', uiGroup: 'field-motion', legacyIndex: 0 }],
        'deck-b': [{ slug: 'tunnel', uiGroup: 'field-motion' }],
      },
    });
    expect(snap?.epoch).toBe(2);
    expect(snap?.decks['deck-a'][0]?.uiGroup).toBe('field-motion');
    expect(snap?.decks['deck-b']).toHaveLength(1);
  });

  test('rejects invalid payloads', () => {
    expect(parsePublicCatalog(null)).toBeNull();
    expect(parsePublicCatalog({ epoch: 0, decks: { 'deck-a': [], 'deck-b': [] } })).toBeNull();
    expect(parsePublicCatalog({ epoch: 1, decks: { 'deck-a': [] } })).toBeNull();
  });
});

describe('legacyFallbackMenuEntries', () => {
  test('covers all visual modes with synthetic slugs', () => {
    const entries = legacyFallbackMenuEntries();
    expect(entries.length).toBeGreaterThan(40);
    const first = entries[0];
    expect(first?.slug).toBe('legacy-0');
    expect(first?.legacyIndex).toBe(0);
    expect(first?.uiGroup).toBeTruthy();
  });
});

describe('deck patches for launchpad', () => {
  test('slug patch and reload-active bump', () => {
    expect(deckPresetSlugPatch('A', 'supernova')).toEqual({ deckAPresetSlug: 'supernova' });
    expect(deckReloadActivePatch('A', 2)).toEqual({ deckAReloadActiveVersion: 3 });
    expect(deckReloadActivePatch('B', 0)).toEqual({ deckBReloadActiveVersion: 1 });
  });
});
