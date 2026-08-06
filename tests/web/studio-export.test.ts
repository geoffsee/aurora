import { describe, expect, test } from 'vitest';
import {
  PACK_V1_AUTHORING_TEMPLATE,
  PACK_V1_SHOW_TEMPLATE,
  parseAuroraPackageArchive,
} from '../../shared/aurora-package.ts';
import { detectWgslForm, exportSketchToPackage } from '../../web/studio/lib/export-package.ts';
import { preparePreviewWgsl } from '../../web/studio/lib/prepare-preview-wgsl.ts';
import {
  createSketch,
  defaultKnobs,
  knobsToLookDefaults,
} from '../../web/studio/lib/sketch-store.ts';

describe('detectWgslForm', () => {
  test('authoring vs show', () => {
    expect(detectWgslForm(PACK_V1_AUTHORING_TEMPLATE)).toBe('authoring');
    expect(detectWgslForm(PACK_V1_SHOW_TEMPLATE)).toBe('show');
  });
});

describe('exportSketchToPackage', () => {
  test('builds a valid archive from a sketch', () => {
    const sketch = createSketch({
      label: 'Glass Drift',
      character: 'soft glass',
      wgsl: PACK_V1_AUTHORING_TEMPLATE,
      knobs: { ...defaultKnobs(), intensity: 0.8, depth: 0.3 },
    });
    // Force slug for stable name.
    sketch.slug = 'glass-drift';

    const result = exportSketchToPackage(sketch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.fileName).toBe('glass-drift.aurora-package');
    expect(result.bytes.byteLength).toBeGreaterThan(100);

    const parsed = parseAuroraPackageArchive(result.bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.manifest.slug).toBe('glass-drift');
    expect(parsed.bundle.manifest.wgslForm).toBe('show'); // remapped on parse
    expect(parsed.bundle.defaults?.intensity).toBe(0.8);
    expect(parsed.bundle.wgsl).toContain('@group(2)');
  });

  test('show-form sketch exports without double-remap issues', () => {
    const sketch = createSketch({
      label: 'Show Pack',
      wgsl: PACK_V1_SHOW_TEMPLATE,
    });
    sketch.slug = 'show-pack';
    const result = exportSketchToPackage(sketch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.manifest.wgslForm).toBe('show');
    const parsed = parseAuroraPackageArchive(result.bytes);
    expect(parsed.ok).toBe(true);
  });
});

describe('preparePreviewWgsl', () => {
  test('prepends vertex and keeps authoring fragment', () => {
    const r = preparePreviewWgsl(PACK_V1_AUTHORING_TEMPLATE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wgsl).toContain('fn vs_main');
    expect(r.wgsl).toContain('fn fragment');
    expect(r.wgsl).toContain('@group(0)');
  });

  test('adapts show-form for browser preview', () => {
    const r = preparePreviewWgsl(PACK_V1_SHOW_TEMPLATE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wgsl).not.toContain('#import');
    expect(r.wgsl).toContain('@group(0)');
    expect(r.wgsl).not.toMatch(/@group\(\s*2\s*\)/);
    expect(r.wgsl).toContain('@location(0) uv');
  });

  test('rejects empty', () => {
    expect(preparePreviewWgsl('').ok).toBe(false);
  });
});

describe('knobsToLookDefaults', () => {
  test('maps performance axes', () => {
    const d = knobsToLookDefaults({
      ...defaultKnobs(),
      intensity: 0.5,
      depth: 0.25,
      feedback: 0.1,
      speed: 0.9,
      hue: 0.2,
      sat: 0.7,
      bright: 1.1,
    });
    expect(d).toEqual({
      intensity: 0.5,
      depth: 0.25,
      feedback: 0.1,
      speed: 0.9,
      hue: 0.2,
      sat: 0.7,
      bright: 1.1,
    });
  });
});
