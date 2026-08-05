import { describe, expect, test } from 'vitest';
import {
  addSketch,
  createSketch,
  duplicateSketch,
  emptyDocument,
  getActiveSketch,
  parseStudioDocument,
  removeSketch,
  uniqueSlug,
  updateSketch,
} from '../../web/studio/lib/sketch-store.ts';

describe('uniqueSlug', () => {
  test('returns base when free', () => {
    expect(uniqueSlug('Glass Drift', [])).toBe('glass-drift');
  });

  test('suffixes on collision', () => {
    expect(uniqueSlug('Glass Drift', ['glass-drift'])).toBe('glass-drift-2');
    expect(uniqueSlug('Glass Drift', ['glass-drift', 'glass-drift-2'])).toBe('glass-drift-3');
  });
});

describe('sketch document ops', () => {
  test('emptyDocument has one active sketch', () => {
    const doc = emptyDocument();
    expect(doc.sketches.length).toBe(1);
    expect(getActiveSketch(doc)?.id).toBe(doc.activeId);
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

    expect(doc.activeId).toBeTruthy();
    const removeId = doc.activeId as string;
    doc = removeSketch(doc, removeId);
    expect(doc.sketches.find((s) => s.id === removeId)).toBeUndefined();
    expect(doc.sketches.length).toBe(2);
  });

  test('parseStudioDocument recovers from junk', () => {
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
});
