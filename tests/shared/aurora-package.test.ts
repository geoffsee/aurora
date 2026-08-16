import { describe, expect, test } from 'vitest';
import {
  AURORA_PACKAGE_SCHEMA_VERSION,
  auroraPackageFileName,
  auroraPackageToModePreset,
  auroraPackageWgslFileName,
  buildAuroraPackageArchive,
  buildManifest,
  buildThreeManifest,
  PACK_V1_AUTHORING_TEMPLATE,
  PACK_V1_SHOW_TEMPLATE,
  parseAuroraPackageArchive,
  remapAuthoringWgslToShow,
  slugifyPackageLabel,
  validateBundle,
  validateThreeImports,
} from '../../shared/aurora-package.ts';
import { unzipTextEntries, zipStore } from '../../shared/zip-store.ts';

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

  test('remaps a multiline authoring entry with a trailing parameter comma', () => {
    const multiline = PACK_V1_AUTHORING_TEMPLATE.replace(
      'fn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>)',
      `fn fragment(
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
)`,
    );
    const show = remapAuthoringWgslToShow(multiline);
    expect(show).toContain('fn fragment(frag: VertexOutput)');
    expect(show).toContain('let uv = frag.uv');
    expect(show).not.toContain('@builtin(position)');
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

describe('Three.js schema v2', () => {
  test('round-trips executable source and binary assets', () => {
    const asset = new Uint8Array([0, 1, 2, 255]);
    const manifest = buildThreeManifest({
      slug: 'three-orbit',
      label: 'Three Orbit',
      renderer: 'webgl2',
      assets: [
        {
          path: 'assets/pixel.bin',
          mediaType: 'application/octet-stream',
          bytes: asset.byteLength,
        },
      ],
    });
    const archive = buildAuroraPackageArchive({
      manifest,
      source: 'export default async function create(ctx) { return { render() {} }; }',
      javascript: 'export default async function create(ctx) { return { render() {} }; }',
      sourceMap: '{}',
      assets: { 'assets/pixel.bin': asset },
      defaults: { intensity: 0.8 },
    });
    const parsed = parseAuroraPackageArchive(archive);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.bundle.manifest.target !== 'threejs') return;
    expect(parsed.bundle.manifest.runtime).toBe('three-v1');
    expect(parsed.bundle.assets?.['assets/pixel.bin']).toEqual(asset);
    const preset = auroraPackageToModePreset(parsed.bundle);
    expect(preset.layers[0]?.kind).toBe('threejs');
    expect(preset.engineMinCapabilities).toContain('threejs-runtime-v1');
  });

  test('rejects arbitrary, relative, URL, and dynamic imports', () => {
    for (const source of [
      `import x from 'lodash'; export default x`,
      `import x from './local.js'; export default x`,
      `import x from 'https://example.com/x.js'; export default x`,
      `export default () => import('three')`,
    ])
      expect(validateThreeImports(source).length).toBeGreaterThan(0);
    expect(
      validateThreeImports(`import * as THREE from 'three'; export default () => ({})`),
    ).toEqual([]);
  });

  test('rejects unsafe paths, duplicate entries, and bad CRCs', () => {
    expect(() =>
      zipStore([
        { name: 'same', data: new Uint8Array([1]) },
        { name: 'same', data: new Uint8Array([2]) },
      ]),
    ).toThrow(/duplicate/);
    const unsafe = zipStore([{ name: '../manifest.json', data: new Uint8Array([1]) }]);
    expect(parseAuroraPackageArchive(unsafe).ok).toBe(false);
    const valid = buildAuroraPackageArchive({
      manifest: buildManifest({ slug: 'crc-test', label: 'CRC Test', wgslForm: 'show' }),
      wgsl: PACK_V1_SHOW_TEMPLATE,
    });
    const marker = new TextEncoder().encode('#import');
    let sourceOffset = -1;
    for (let index = 0; index <= valid.length - marker.length; index += 1) {
      if (marker.every((byte, offset) => valid[index + offset] === byte)) {
        sourceOffset = index;
        break;
      }
    }
    expect(sourceOffset).toBeGreaterThan(0);
    valid[sourceOffset] = 0x24;
    const bad = parseAuroraPackageArchive(valid);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]?.message).toMatch(/CRC/);
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
