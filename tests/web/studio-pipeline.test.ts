/**
 * Studio app pipeline: sketch document → preview WGSL → package export →
 * Publish (Console/Pages) → optional bridge import.
 *
 * Covers the product path without mounting React / WebGPU.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  PACK_V1_AUTHORING_TEMPLATE,
  parseAuroraPackageArchive,
} from '../../shared/aurora-package.ts';
import {
  clearAuthoredPackagesForTests,
  compiledWireFromAuthoredPackage,
  getAuthoredPackage,
} from '../../shared/package-channel.ts';
import {
  exportSketchToPackage,
  importPackageToBridge,
  publishSketchToChannel,
} from '../../web/studio/lib/export-package.ts';
import { preparePreviewWgsl } from '../../web/studio/lib/prepare-preview-wgsl.ts';
import {
  addSketch,
  createSketch,
  emptyDocument,
  getActiveSketch,
  loadStudioDocument,
  STUDIO_STORAGE_KEY,
  saveStudioDocument,
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

describe('studio authoring pipeline', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createLocalStorage();
    vi.stubGlobal('localStorage', storage);
    clearAuthoredPackagesForTests();
  });

  afterEach(() => {
    clearAuthoredPackagesForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('document → preview → export → publish → console wire', () => {
    // 1. Author a sketch in the studio document
    let doc = emptyDocument();
    doc = addSketch(
      doc,
      createSketch(
        {
          label: 'Dot Terrain',
          character: 'dotted wave field',
          wgsl: PACK_V1_AUTHORING_TEMPLATE,
          knobs: { intensity: 0.7, hue: 0.42, demoAudio: true },
        },
        doc.sketches.map((s) => s.slug),
      ),
    );
    const sketch = getActiveSketch(doc);
    expect(sketch).toBeTruthy();
    if (!sketch) return;
    expect(sketch.slug).toBe('dot-terrain');

    // 2. Preview adapts authoring WGSL for WebGPU
    const preview = preparePreviewWgsl(sketch.wgsl);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.wgsl).toContain('fn vs_main');
    expect(preview.wgsl).toContain('@group(0)');

    // 3. Export produces a loadable .aurora-package
    const exported = exportSketchToPackage(sketch);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.fileName).toBe('dot-terrain.aurora-package');
    const parsed = parseAuroraPackageArchive(exported.bytes, { remapAuthoring: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.wgsl).toContain('@group(2)');
    expect(parsed.bundle.defaults?.intensity).toBe(0.7);

    // 4. Publish lands in authored store for Console/Pages
    const published = publishSketchToChannel(sketch);
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    const authored = getAuthoredPackage('dot-terrain');
    expect(authored).toBeTruthy();
    if (!authored) return;
    expect(authored.label).toBe('Dot Terrain');
    expect(authored.character).toBe('dotted wave field');

    // 5. Console can build a compiled wire from the authored package
    const wire = compiledWireFromAuthoredPackage('deck-a', authored, 1);
    expect(wire.slug).toBe('dot-terrain');
    expect(wire.layers[0]?.kind).toBe('fullscreen');
    expect(wire.layers[0]?.wgsl).toContain('@fragment');
  });

  test('sketch list persists across reload and knobs stay applied on export', () => {
    let doc = emptyDocument();
    const id = doc.activeId as string;
    doc = updateSketch(doc, id, {
      label: 'Saved Wave',
      knobs: { intensity: 0.55, depth: 0.2, feedback: 0.1 },
    });
    saveStudioDocument(doc, storage);
    expect(storage.getItem(STUDIO_STORAGE_KEY)).toBeTruthy();

    const reloaded = loadStudioDocument(storage);
    const active = getActiveSketch(reloaded);
    expect(active).toBeTruthy();
    if (!active) return;
    expect(active.label).toBe('Saved Wave');
    expect(active.knobs.intensity).toBe(0.55);

    const exported = exportSketchToPackage(active);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.bundle.defaults).toMatchObject({
      intensity: 0.55,
      depth: 0.2,
      feedback: 0.1,
    });
  });

  test('publish then bridge-import uses the same archive bytes', async () => {
    const sketch = createSketch({
      label: 'Dual Path',
      wgsl: PACK_V1_AUTHORING_TEMPLATE,
    });
    sketch.slug = 'dual-path';

    const published = publishSketchToChannel(sketch);
    expect(published.ok).toBe(true);

    const exported = exportSketchToPackage(sketch);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        // Server-side would parse the same zip; here we re-parse client-side.
        const body = init?.body as Blob;
        const buf = new Uint8Array(await body.arrayBuffer());
        const again = parseAuroraPackageArchive(buf, { remapAuthoring: true });
        expect(again.ok).toBe(true);
        return new Response(
          JSON.stringify({
            ok: true,
            slug: 'dual-path',
            overwritten: false,
            catalog: { epoch: 2, contentHash: 'h' },
          }),
          { status: 200 },
        );
      }),
    );

    const imported = await importPackageToBridge(exported.bytes, {
      bridgeOrigin: 'http://127.0.0.1:3000',
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.slug).toBe('dual-path');
    expect(getAuthoredPackage('dual-path')).toBeTruthy();
  });
});
