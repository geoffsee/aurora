// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { crispRing } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 16, fn: 'crystal_core_variant' } as const;

export const crystal_coreVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let r = std.length(p);
    let a = std.atan2(p.y, p.x);
    let drive = std.clamp(std.max(bass, energy * 0.5 + pulse * 0.5), 0.0, 1.0);
    let facets = 6.0 + std.floor(high * 18.0);
    let fa = std.abs(std.fract(a / TAU * facets + time * (0.3 + drive * 0.6)) - 0.5) * 2.0;
    let crystal = 1.0 - std.smoothstep(0.0, 0.06 + high * 0.05, fa);
    let ring = crispRing(r, 0.38 + drive * 0.18 + std.sin(time * 0.7) * 0.02, 0.03 + drive * 0.02, 0.03);
    let core = std.exp(-r * r * (7.0 - drive * 4.0)) * (0.3 + 1.1 * drive);
    let layer = crystal * (0.45 + high * 0.7) + ring * (0.6 + drive) + core;

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let hue_phase = a / TAU * 0.2 + r * 0.6 + time * 0.02 + drive * 0.15;
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase, 0.9 * sat, bri);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(base * layer * enabled, std.clamp(layer * enabled, 0.0, 1.0));
});
