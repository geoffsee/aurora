import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addSketch,
  createSketch,
  defaultKnobs,
  duplicateSketch,
  emptyDocument,
  getActiveSketch,
  loadStudioDocument,
  parseStudioDocument,
  removeSketch,
  STUDIO_STORAGE_KEY,
  saveStudioDocument,
  uniqueSlug,
  updateSketch,
} from '../../web/studio/lib/sketch-store.ts';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe('uniqueSlug', () => {
  test('returns base when free', () => {
    expect(uniqueSlug('Glass Drift', [])).toBe('glass-drift');
  });

  test('suffixes on collision', () => {
    expect(uniqueSlug('Glass Drift', ['glass-drift'])).toBe('glass-drift-2');
    expect(uniqueSlug('Glass Drift', ['glass-drift', 'glass-drift-2'])).toBe('glass-drift-3');
  });

  test('slugifies punctuation and case', () => {
    expect(uniqueSlug('  Dot Terrain!! ', [])).toBe('dot-terrain');
  });
});

describe('defaultKnobs / createSketch', () => {
  test('default knobs include demo audio and idle energy', () => {
    const k = defaultKnobs();
    expect(k.demoAudio).toBe(true);
    expect(k.energy).toBe(-1);
    expect(k.intensity).toBeGreaterThan(0);
    expect(k.alpha).toBe(1);
  });

  test('createSketch merges partial knobs over defaults', () => {
    const s = createSketch({
      label: 'Partial Knobs',
      knobs: { intensity: 0.12, demoAudio: false },
    });
    expect(s.knobs.intensity).toBe(0.12);
    expect(s.knobs.demoAudio).toBe(false);
    expect(s.knobs.depth).toBe(defaultKnobs().depth);
    expect(s.slug).toBe('partial-knobs');
    expect(s.uiGroup).toBe('field-motion');
  });

  test('createSketch avoids slug collisions via existing list', () => {
    const a = createSketch({ label: 'Same' }, []);
    const b = createSketch({ label: 'Same' }, [a.slug]);
    expect(a.slug).toBe('same');
    expect(b.slug).toBe('same-2');
  });
});

describe('sketch document ops', () => {
  test('emptyDocument has one active sketch', () => {
    const doc = emptyDocument();
    expect(doc.sketches.length).toBe(1);
    expect(getActiveSketch(doc)?.id).toBe(doc.activeId);
    expect(getActiveSketch(doc)?.label).toBe('Point Cloud Waves');
  });

  test('updateSketch patches label and refreshes slug', () => {
    const doc = emptyDocument();
    expect(doc.activeId).toBeTruthy();
    const id = doc.activeId as string;
    const next = updateSketch(doc, id, { label: 'Wave Rim' });
    const s = getActiveSketch(next);
    expect(s).toBeTruthy();
    expect(s?.label).toBe('Wave Rim');
    expect(s?.slug).toBe('wave-rim');
  });

  test('updateSketch merges knobs without dropping other axes', () => {
    const doc = emptyDocument();
    const id = doc.activeId as string;
    const next = updateSketch(doc, id, { knobs: { intensity: 0.9, hue: 0.1 } });
    const k = getActiveSketch(next)?.knobs;
    expect(k?.intensity).toBe(0.9);
    expect(k?.hue).toBe(0.1);
    expect(k?.depth).toBe(defaultKnobs().depth);
    expect(k?.demoAudio).toBe(true);
  });

  test('updateSketch unique-slugs against siblings when label changes', () => {
    let doc = emptyDocument();
    const firstId = doc.activeId as string;
    doc = addSketch(
      doc,
      createSketch(
        { label: 'Alpha' },
        doc.sketches.map((s) => s.slug),
      ),
    );
    const secondId = doc.activeId as string;
    // Rename first sketch to collide with second's slug base.
    doc = updateSketch(doc, firstId, { label: 'Alpha' });
    const first = doc.sketches.find((s) => s.id === firstId);
    const second = doc.sketches.find((s) => s.id === secondId);
    expect(second?.slug).toBe('alpha');
    expect(first?.slug).toBe('alpha-2');
  });

  test('updateSketch respects explicit slug patch', () => {
    const doc = emptyDocument();
    const id = doc.activeId as string;
    const next = updateSketch(doc, id, { slug: 'Custom_Slug!!' });
    expect(getActiveSketch(next)?.slug).toBe('custom-slug');
  });

  test('add / duplicate / remove', () => {
    let doc = emptyDocument();
    expect(doc.activeId).toBeTruthy();
    const firstId = doc.activeId as string;
    doc = addSketch(
      doc,
      createSketch(
        { label: 'Second' },
        doc.sketches.map((s) => s.slug),
      ),
    );
    expect(doc.sketches.length).toBe(2);
    expect(doc.activeId).not.toBe(firstId);
    expect(doc.activeId).toBeTruthy();

    doc = duplicateSketch(doc, doc.activeId as string);
    expect(doc.sketches.length).toBe(3);
    expect(getActiveSketch(doc)?.label).toMatch(/Copy/);
    expect(getActiveSketch(doc)?.wgsl).toBe(doc.sketches.find((s) => s.label === 'Second')?.wgsl);

    expect(doc.activeId).toBeTruthy();
    const removeId = doc.activeId as string;
    doc = removeSketch(doc, removeId);
    expect(doc.sketches.find((s) => s.id === removeId)).toBeUndefined();
    expect(doc.sketches.length).toBe(2);
  });

  test('removeSketch of last sketch yields a fresh empty document', () => {
    let doc = emptyDocument();
    const onlyId = doc.activeId as string;
    doc = removeSketch(doc, onlyId);
    expect(doc.sketches.length).toBe(1);
    expect(doc.activeId).not.toBe(onlyId);
    expect(getActiveSketch(doc)?.label).toBe('Point Cloud Waves');
  });

  test('removeSketch of non-active keeps activeId', () => {
    let doc = emptyDocument();
    const firstId = doc.activeId as string;
    doc = addSketch(
      doc,
      createSketch(
        { label: 'Keep Me' },
        doc.sketches.map((s) => s.slug),
      ),
    );
    const active = doc.activeId as string;
    doc = removeSketch(doc, firstId);
    expect(doc.activeId).toBe(active);
    expect(doc.sketches.length).toBe(1);
  });

  test('duplicateSketch of missing id is a no-op', () => {
    const doc = emptyDocument();
    const next = duplicateSketch(doc, 'does-not-exist');
    expect(next).toEqual(doc);
  });

  test('getActiveSketch falls back when activeId is stale', () => {
    const doc = emptyDocument();
    const stale = { ...doc, activeId: 'gone' };
    expect(getActiveSketch(stale)?.id).toBe(doc.sketches[0]?.id);
  });
});

describe('parseStudioDocument', () => {
  test('recovers from junk', () => {
    const bad = parseStudioDocument({ sketches: [{ no: 'id' }] });
    expect(bad.sketches.length).toBe(1);

    const good = parseStudioDocument({
      version: 1,
      activeId: 'a',
      sketches: [
        {
          id: 'a',
          label: 'Test',
          slug: 'test',
          wgsl: '// hi',
          knobs: { intensity: 0.5 },
        },
      ],
    });
    expect(good.sketches[0]?.label).toBe('Test');
    expect(good.sketches[0]?.knobs.intensity).toBe(0.5);
    expect(good.activeId).toBe('a');
  });

  test('clamps knobs and preserves energy idle sentinel', () => {
    const doc = parseStudioDocument({
      version: 1,
      activeId: 'a',
      sketches: [
        {
          id: 'a',
          label: 'Clamp',
          slug: 'clamp',
          wgsl: 'fn fragment() {}',
          knobs: {
            intensity: 9,
            depth: -3,
            bright: 1.4,
            energy: -1,
            demoAudio: false,
          },
        },
      ],
    });
    const k = doc.sketches[0]?.knobs;
    expect(k?.intensity).toBe(1);
    expect(k?.depth).toBe(0);
    // bright uses clamp01 — over-range falls to 1 (not 1.4)
    expect(k?.bright).toBe(1);
    expect(k?.energy).toBe(-1);
    expect(k?.demoAudio).toBe(false);
  });

  test('clamps energy into [-1, 1]', () => {
    const doc = parseStudioDocument({
      version: 1,
      activeId: 'a',
      sketches: [
        {
          id: 'a',
          label: 'Energy',
          slug: 'energy',
          wgsl: 'x',
          knobs: { energy: 4 },
        },
      ],
    });
    expect(doc.sketches[0]?.knobs.energy).toBe(1);
  });

  test('null / non-object raw yields empty document', () => {
    expect(parseStudioDocument(null).sketches.length).toBe(1);
    expect(parseStudioDocument('nope').sketches.length).toBe(1);
    expect(parseStudioDocument({ sketches: 'bad' }).sketches.length).toBe(1);
  });

  test('falls back activeId when missing from sketches', () => {
    const doc = parseStudioDocument({
      version: 1,
      activeId: 'missing',
      sketches: [{ id: 'only', label: 'Only', slug: 'only', wgsl: 'x' }],
    });
    expect(doc.activeId).toBe('only');
  });
});

describe('loadStudioDocument / saveStudioDocument', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createLocalStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('load returns empty document when storage is empty', () => {
    const doc = loadStudioDocument(storage);
    expect(doc.sketches.length).toBe(1);
    expect(getActiveSketch(doc)?.label).toBe('Point Cloud Waves');
  });

  test('save + load round-trips sketches', () => {
    let doc = emptyDocument();
    const id = doc.activeId as string;
    doc = updateSketch(doc, id, { label: 'Persisted Pack', knobs: { intensity: 0.33 } });
    saveStudioDocument(doc, storage);

    const raw = storage.getItem(STUDIO_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).sketches[0].label).toBe('Persisted Pack');

    const loaded = loadStudioDocument(storage);
    expect(loaded.sketches[0]?.label).toBe('Persisted Pack');
    expect(loaded.sketches[0]?.knobs.intensity).toBe(0.33);
    expect(loaded.activeId).toBe(id);
  });

  test('load recovers from corrupt JSON', () => {
    storage.setItem(STUDIO_STORAGE_KEY, '{not-json');
    const doc = loadStudioDocument(storage);
    expect(doc.sketches.length).toBe(1);
  });

  test('load with null storage returns empty document', () => {
    expect(loadStudioDocument(null).sketches.length).toBe(1);
  });

  test('save with null storage is a no-op', () => {
    expect(() => saveStudioDocument(emptyDocument(), null)).not.toThrow();
  });
});
