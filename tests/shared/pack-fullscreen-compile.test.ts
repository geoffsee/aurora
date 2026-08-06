/**
 * Pack fullscreen compile: layer limit, size caps, WGSL attach, dual-deck independence.
 * GLSL→WGSL (naga) is exercised only when naga-cli is on PATH; otherwise fail-closed
 * still returns a structured error (soft UX, Shadertoy-aligned).
 */

import { describe, expect, test } from 'vitest';
import {
  compileModePreset,
  MAX_FULLSCREEN_LAYERS_PER_PACK,
  MAX_PACK_SHADER_SOURCE_BYTES,
  type ModePreset,
  validateAndCompileModePreset,
} from '../../shared/mode-preset-schema.ts';
import {
  compilePackFullscreenSource,
  enrichPackFullscreenLayers,
  firstFullscreenWgsl,
  isPackGlslRef,
  isPackWgslRef,
  validatePackShaderSource,
} from '../../shared/pack-fullscreen-compile.ts';
import { nagaVersion } from '../../shared/shadertoy-import.ts';

const CTX = {
  epoch: 1,
  deck: 'deck-a' as const,
  assetBase: '/api/data/e/1/decks/deck-a/plasma/',
};

const MINIMAL_WGSL = `#import bevy_sprite::mesh2d_vertex_output::VertexOutput
@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.5, palette_extra.w);
}
`;

function fullscreenPreset(layers: ModePreset['layers']): ModePreset {
  return {
    schemaVersion: 1,
    id: 'plasma',
    slug: 'plasma',
    label: 'Plasma',
    disposition: 'fullscreen-primary',
    suppressLegacyField: true,
    layers,
  };
}

describe('MAX_FULLSCREEN_LAYERS_PER_PACK', () => {
  test('constant is 1 (N=2 engine slots = one per deck)', () => {
    expect(MAX_FULLSCREEN_LAYERS_PER_PACK).toBe(1);
  });

  test('pure compile accepts a single fullscreen layer', () => {
    const r = compileModePreset(
      fullscreenPreset([{ kind: 'fullscreen', ref: 'shader.wgsl' }]),
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.layers).toHaveLength(1);
    expect(r.value.layers[0]?.kind).toBe('fullscreen');
    expect(r.value.suppressLegacyField).toBe(true);
    // Pure compile does not attach wgsl (bridge enrichment does).
    expect(r.value.layers[0]?.wgsl).toBeUndefined();
  });

  test('third fullscreen layer rejected at pure compile (second in one pack)', () => {
    const r = compileModePreset(
      fullscreenPreset([
        { kind: 'fullscreen', ref: 'a.wgsl' },
        { kind: 'fullscreen', ref: 'b.wgsl' },
      ]),
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('fullscreen layer'))).toBe(true);
  });

  test('mesh + one fullscreen is allowed', () => {
    const r = validateAndCompileModePreset(
      {
        schemaVersion: 1,
        id: 'combo',
        slug: 'combo',
        label: 'Combo',
        disposition: 'fullscreen-primary',
        suppressLegacyField: true,
        layers: [
          { kind: 'mesh', ref: 'human-female' },
          { kind: 'fullscreen', ref: 'package.wgsl' },
        ],
      },
      CTX,
    );
    expect(r.ok).toBe(true);
  });
});

describe('size caps', () => {
  test('empty source fails', () => {
    const r = validatePackShaderSource('');
    expect(r.ok).toBe(false);
  });

  test('oversize source fails closed', () => {
    const huge = 'x'.repeat(MAX_PACK_SHADER_SOURCE_BYTES + 1);
    const r = validatePackShaderSource(huge, { label: 'test' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/size cap/);
  });

  test('in-cap source ok', () => {
    const r = validatePackShaderSource(MINIMAL_WGSL);
    expect(r.ok).toBe(true);
  });
});

describe('compilePackFullscreenSource', () => {
  test('wgsl pass-through attaches body', async () => {
    const r = await compilePackFullscreenSource('assets/shader.wgsl', MINIMAL_WGSL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wgsl).toContain('fn fragment');
  });

  test('wgsl without fragment entry fails', async () => {
    const r = await compilePackFullscreenSource('x.wgsl', 'fn main() {}');
    expect(r.ok).toBe(false);
  });

  test('extension helpers', () => {
    expect(isPackWgslRef('a.wgsl')).toBe(true);
    expect(isPackGlslRef('a.frag')).toBe(true);
    expect(isPackGlslRef('a.glsl')).toBe(true);
    expect(isPackWgslRef('a.frag')).toBe(false);
  });

  test('GLSL path fail-closed when naga missing or compile fails', async () => {
    const version = await nagaVersion();
    const r = await compilePackFullscreenSource(
      'shader.frag',
      'void mainImage(out vec4 o, in vec2 p) { o = vec4(1.0); }',
    );
    if (version === null) {
      // Soft failure — clear message, no throw (Shadertoy-aligned).
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.toLowerCase()).toMatch(/naga|not found|failed/);
      }
    } else {
      // With naga present, simple mainImage should compile.
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.wgsl).toContain('fragment');
    }
  });
});

describe('enrichPackFullscreenLayers + dual-deck independence', () => {
  test('attaches wgsl from readAsset for deck-a and deck-b independently', async () => {
    const base = compileModePreset(
      fullscreenPreset([{ kind: 'fullscreen', ref: 'package.wgsl' }]),
      CTX,
    );
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const wireA = {
      ...base.value,
      deck: 'deck-a' as const,
      slug: 'plasma-a',
    };
    const wireB = {
      ...base.value,
      deck: 'deck-b' as const,
      slug: 'plasma-b',
      assetBase: '/api/data/e/1/decks/deck-b/plasma/',
    };

    const enA = await enrichPackFullscreenLayers(wireA, async () => ({
      ok: true,
      text: MINIMAL_WGSL.replace('1.0, 0.0, 0.5', '1.0, 0.0, 0.0'),
      bytes: 100,
    }));
    const enB = await enrichPackFullscreenLayers(wireB, async () => ({
      ok: true,
      text: MINIMAL_WGSL.replace('1.0, 0.0, 0.5', '0.0, 0.0, 1.0'),
      bytes: 100,
    }));
    expect(enA.ok && enB.ok).toBe(true);
    if (!enA.ok || !enB.ok) return;

    const wgslA = firstFullscreenWgsl(enA.wire);
    const wgslB = firstFullscreenWgsl(enB.wire);
    expect(wgslA).toBeDefined();
    expect(wgslB).toBeDefined();
    expect(wgslA).not.toEqual(wgslB);
    expect(wgslA).toContain('1.0, 0.0, 0.0');
    expect(wgslB).toContain('0.0, 0.0, 1.0');
  });

  test('missing asset fails closed with banner-class error', async () => {
    const base = compileModePreset(
      fullscreenPreset([{ kind: 'fullscreen', ref: 'missing.wgsl' }]),
      CTX,
    );
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const en = await enrichPackFullscreenLayers(base.value, async (ref) => ({
      ok: false,
      error: `fullscreen layer ref ${ref}: asset missing or escapes preset root`,
    }));
    expect(en.ok).toBe(false);
    if (en.ok) return;
    expect(en.errors[0]).toMatch(/missing/);
  });
});
