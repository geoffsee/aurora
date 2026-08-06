import { describe, expect, test } from 'vitest';
import {
  AURORA_PACKAGE_SCHEMA_VERSION,
  auroraPackageFileName,
  auroraPackageToModePreset,
  auroraPackageWgslFileName,
  buildAuroraPackageArchive,
  buildManifest,
  PACK_V1_AUTHORING_TEMPLATE,
  PACK_V1_SHOW_TEMPLATE,
  parseAuroraPackageArchive,
  remapAuthoringWgslToShow,
  slugifyPackageLabel,
  validateBundle,
} from '../../shared/aurora-package.ts';
import { unzipTextEntries } from '../../shared/zip-store.ts';

describe('slugifyPackageLabel', () => {
  test('kebab-cases labels', () => {
    expect(slugifyPackageLabel('Glass Drift')).toBe('glass-drift');
    expect(slugifyPackageLabel('  Foo_Bar  ')).toBe('foo-bar');
  });
});

describe('remapAuthoringWgslToShow', () => {
  test('moves group 0 to group 2 and adds VertexOutput entry', () => {
    const show = remapAuthoringWgslToShow(PACK_V1_AUTHORING_TEMPLATE);
    expect(show).toContain('#import bevy_sprite::mesh2d_vertex_output::VertexOutput');
    expect(show).toContain('@group(2)');
    expect(show).not.toMatch(/@group\(\s*0\s*\)/);
    expect(show).toContain('fn fragment(frag: VertexOutput)');
    expect(show).toContain('let uv = frag.uv');
    expect(show).toContain('pack_drive');
  });
});

describe('build + parse archive', () => {
  test('round-trips show-form package', () => {
    const manifest = buildManifest({
      slug: 'glass-drift',
      label: 'Glass Drift',
      character: 'test',
      wgslForm: 'show',
    });
    expect(manifest.schemaVersion).toBe(AURORA_PACKAGE_SCHEMA_VERSION);

    const archive = buildAuroraPackageArchive({
      manifest,
      wgsl: PACK_V1_SHOW_TEMPLATE,
      defaults: { intensity: 0.7, depth: 0.4 },
    });
    expect(archive.byteLength).toBeGreaterThan(100);
    expect(auroraPackageFileName(manifest.slug)).toBe('glass-drift.aurora-package');

    const files = unzipTextEntries(archive);
    expect(files['manifest.json']).toBeDefined();
    expect(files['package.wgsl']).toBeDefined();
    expect(files['defaults.json']).toBeDefined();

    const parsed = parseAuroraPackageArchive(archive);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.manifest.slug).toBe('glass-drift');
    expect(parsed.bundle.manifest.wgslForm).toBe('show');
    expect(parsed.bundle.defaults?.intensity).toBe(0.7);
    expect(parsed.bundle.wgsl).toContain('@group(2)');
  });

  test('authoring form remaps on parse by default', () => {
    const manifest = buildManifest({
      slug: 'soft-blob',
      label: 'Soft Blob',
      wgslForm: 'authoring',
    });
    const archive = buildAuroraPackageArchive({
      manifest,
      wgsl: PACK_V1_AUTHORING_TEMPLATE,
    });
    const parsed = parseAuroraPackageArchive(archive);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.manifest.wgslForm).toBe('show');
    expect(parsed.bundle.wgsl).toContain('VertexOutput');
    expect(parsed.bundle.wgsl).toContain('@group(2)');
  });

  test('rejects missing pack uniform names', () => {
    const manifest = buildManifest({ slug: 'bad', label: 'Bad', wgslForm: 'show' });
    const result = validateBundle({
      manifest,
      wgsl: `${PACK_V1_SHOW_TEMPLATE.replace(/pack_drive/g, 'nope')}`,
    });
    expect(result.ok).toBe(false);
  });

  test('rejects bad slug', () => {
    const result = validateBundle({
      manifest: {
        ...buildManifest({ slug: 'Not_Valid', label: 'X', wgslForm: 'show' }),
        slug: 'Not_Valid',
      },
      wgsl: PACK_V1_SHOW_TEMPLATE,
    });
    expect(result.ok).toBe(false);
  });
});

describe('auroraPackageToModePreset', () => {
  test('builds fullscreen-primary preset with dual-fullscreen capability', () => {
    const manifest = buildManifest({ slug: 'glass-drift', label: 'Glass Drift', wgslForm: 'show' });
    const preset = auroraPackageToModePreset({
      manifest,
      wgsl: PACK_V1_SHOW_TEMPLATE,
    });
    expect(preset.slug).toBe('glass-drift');
    expect(preset.disposition).toBe('fullscreen-primary');
    expect(preset.suppressLegacyField).toBe(true);
    expect(preset.layers[0]).toEqual({ kind: 'fullscreen', ref: 'glass_drift.wgsl' });
    expect(preset.engineMinCapabilities).toContain('dual-fullscreen');
    expect(auroraPackageWgslFileName('glass-drift')).toBe('glass_drift.wgsl');
  });
});
