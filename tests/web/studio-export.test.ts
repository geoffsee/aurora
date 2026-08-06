import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  PACK_V1_AUTHORING_TEMPLATE,
  PACK_V1_SHOW_TEMPLATE,
  parseAuroraPackageArchive,
} from '../../shared/aurora-package.ts';
import {
  clearAuthoredPackagesForTests,
  getAuthoredPackage,
  loadAuthoredPackages,
} from '../../shared/package-channel.ts';
import {
  detectWgslForm,
  downloadPackageArchive,
  exportSketchToPackage,
  importPackageToBridge,
  publishSketchToChannel,
} from '../../web/studio/lib/export-package.ts';
import { preparePreviewWgsl } from '../../web/studio/lib/prepare-preview-wgsl.ts';
import {
  createSketch,
  defaultKnobs,
  knobsToLookDefaults,
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

describe('detectWgslForm', () => {
  test('authoring vs show templates', () => {
    expect(detectWgslForm(PACK_V1_AUTHORING_TEMPLATE)).toBe('authoring');
    expect(detectWgslForm(PACK_V1_SHOW_TEMPLATE)).toBe('show');
  });

  test('ignores @group(2) inside comments', () => {
    const commented = `
// example show form uses @group(2) + VertexOutput
@group(0) @binding(0) var<uniform> u: vec4<f32>;
@fragment
fn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4(uv, 0.0, 1.0);
}
`;
    expect(detectWgslForm(commented)).toBe('authoring');
  });

  test('detects show form via VertexOutput + @group(2)', () => {
    const show = `
struct VertexOutput { @location(0) uv: vec2<f32> }
@group(2) @binding(0) var<uniform> u: vec4<f32>;
@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  return vec4(frag.uv, 0.0, 1.0);
}
`;
    expect(detectWgslForm(show)).toBe('show');
  });

  test('detects show form via bevy import', () => {
    const show = `
#import bevy_sprite::mesh2d_vertex_output::VertexOutput
@group(0) @binding(0) var<uniform> u: vec4<f32>;
@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  return vec4(1.0);
}
`;
    expect(detectWgslForm(show)).toBe('show');
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

  test('rejects invalid slug / empty wgsl via archive builder', () => {
    const sketch = createSketch({ label: 'Bad', wgsl: 'not a fragment' });
    sketch.slug = '';
    sketch.wgsl = '';
    const result = exportSketchToPackage(sketch);
    // Empty WGSL should fail validation in the archive path.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('carries character and uiGroup into manifest', () => {
    const sketch = createSketch({
      label: 'Character Pack',
      character: 'neon ribbon',
      uiGroup: 'particles',
      wgsl: PACK_V1_AUTHORING_TEMPLATE,
    });
    sketch.slug = 'character-pack';
    const result = exportSketchToPackage(sketch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.manifest.character).toBe('neon ribbon');
    expect(result.bundle.manifest.uiGroup).toBe('particles');
  });
});

describe('publishSketchToChannel', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorage());
    clearAuthoredPackagesForTests();
  });

  afterEach(() => {
    clearAuthoredPackagesForTests();
    vi.unstubAllGlobals();
  });

  test('upserts authored package for Console/Pages path', () => {
    const sketch = createSketch({
      label: 'Publish Me',
      wgsl: PACK_V1_AUTHORING_TEMPLATE,
      knobs: { ...defaultKnobs(), intensity: 0.77 },
    });
    sketch.slug = 'publish-me';

    const result = publishSketchToChannel(sketch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slug).toBe('publish-me');
    expect(result.label).toBe('Publish Me');

    const stored = getAuthoredPackage('publish-me');
    expect(stored).toBeTruthy();
    expect(stored?.wgsl).toContain('@fragment');
    expect(stored?.defaults?.intensity).toBe(0.77);
    expect(loadAuthoredPackages()).toHaveLength(1);
  });

  test('overwrites previous authored package with same slug', () => {
    const a = createSketch({ label: 'V1', wgsl: PACK_V1_AUTHORING_TEMPLATE });
    a.slug = 'same-slug';
    const b = createSketch({
      label: 'V2 Updated',
      wgsl: PACK_V1_AUTHORING_TEMPLATE,
      knobs: { ...defaultKnobs(), depth: 0.99 },
    });
    b.slug = 'same-slug';

    expect(publishSketchToChannel(a).ok).toBe(true);
    expect(publishSketchToChannel(b).ok).toBe(true);
    expect(loadAuthoredPackages()).toHaveLength(1);
    expect(getAuthoredPackage('same-slug')?.label).toBe('V2 Updated');
    expect(getAuthoredPackage('same-slug')?.defaults?.depth).toBe(0.99);
  });

  test('fails cleanly when export is invalid', () => {
    const sketch = createSketch({ label: 'Nope', wgsl: '' });
    sketch.slug = '';
    sketch.wgsl = '';
    const result = publishSketchToChannel(sketch);
    expect(result.ok).toBe(false);
  });
});

describe('importPackageToBridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('POSTs archive and parses success payload', async () => {
    const sketch = createSketch({
      label: 'Bridge Pack',
      wgsl: PACK_V1_AUTHORING_TEMPLATE,
    });
    sketch.slug = 'bridge-pack';
    const built = exportSketchToPackage(sketch);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://127.0.0.1:3000/api/packages/import');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'content-type': 'application/zip' });
      expect(init?.body).toBeInstanceOf(Blob);
      return new Response(
        JSON.stringify({
          ok: true,
          slug: 'bridge-pack',
          label: 'Bridge Pack',
          overwritten: false,
          catalog: { epoch: 7, contentHash: 'abc' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await importPackageToBridge(built.bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slug).toBe('bridge-pack');
    expect(result.catalog?.epoch).toBe(7);
    expect(result.catalog?.contentHash).toBe('abc');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('uses custom bridge origin', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true, slug: 'x' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await importPackageToBridge(new Uint8Array([1, 2, 3]), {
      bridgeOrigin: 'http://192.168.1.5:3000/',
    });
    expect(String((fetchMock.mock.calls as unknown[][])[0]?.[0])).toBe(
      'http://192.168.1.5:3000/api/packages/import',
    );
  });

  test('maps network failure to status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    const result = await importPackageToBridge(new Uint8Array([1]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(0);
    expect(result.errors[0]?.message).toMatch(/Failed to fetch/);
  });

  test('maps HTTP error payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            ok: false,
            errors: [{ path: 'manifest.slug', message: 'invalid slug' }],
          }),
          { status: 400 },
        );
      }),
    );
    const result = await importPackageToBridge(new Uint8Array([1]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.errors[0]?.path).toBe('manifest.slug');
  });

  test('maps non-JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('gateway timeout', { status: 504 });
      }),
    );
    const result = await importPackageToBridge(new Uint8Array([1]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(504);
    expect(result.errors[0]?.message).toMatch(/non-JSON/);
  });
});

describe('downloadPackageArchive', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('creates an anchor click download', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      const el = node as HTMLAnchorElement;
      // Patch click/remove so we don't navigate.
      el.click = click;
      el.remove = remove;
      return node;
    });

    downloadPackageArchive(new Uint8Array([80, 75]), 'demo.aurora-package');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(appendSpy).toHaveBeenCalled();

    const anchor = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('demo.aurora-package');
    expect(anchor.href).toContain('blob:');
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

  test('rejects source without fragment entry', () => {
    const r = preparePreviewWgsl('@group(0) var<uniform> u: vec4<f32>;');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/fragment/i);
  });

  test('does not duplicate vs_main when already present', () => {
    const source = `
@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  return vec4(0.0);
}
@fragment
fn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4(uv, 0.0, 1.0);
}
`;
    const r = preparePreviewWgsl(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const matches = r.wgsl.match(/\bfn\s+vs_main\b/g) ?? [];
    expect(matches.length).toBe(1);
  });

  test('rewrites frag.uv references for show-form', () => {
    const show = `
@group(2) @binding(0) var<uniform> u: vec4<f32>;
@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  return vec4(frag.uv, 0.5, 1.0);
}
`;
    const r = preparePreviewWgsl(show);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wgsl).not.toContain('frag.uv');
    expect(r.wgsl).toContain('return vec4(uv, 0.5, 1.0)');
    expect(r.wgsl).toContain('@group(0)');
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

  test('does not leak audio sim knobs into package defaults', () => {
    const d = knobsToLookDefaults({
      ...defaultKnobs(),
      bass: 1,
      mid: 1,
      high: 1,
      energy: 0.8,
      demoAudio: false,
      pulse: 0.9,
      alpha: 0.5,
    });
    expect(d).not.toHaveProperty('bass');
    expect(d).not.toHaveProperty('energy');
    expect(d).not.toHaveProperty('demoAudio');
    expect(d).not.toHaveProperty('pulse');
    expect(d).not.toHaveProperty('alpha');
  });
});
