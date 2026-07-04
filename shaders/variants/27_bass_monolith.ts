// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { crispRing, fbm } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 27, fn: 'bass_monolith_variant' } as const;

export const bass_monolithVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let r = std.length(p);
    let drive = std.clamp(std.max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
    let wobble = fbm(vec2f(p.y * 0.8, time * 0.08)) * (0.08 + drive * 0.14);
    let center_width = 0.22 + drive * 0.16 + wobble;
    let core_slab = 1.0 - std.smoothstep(center_width, center_width + 0.055 + high * 0.04, std.abs(p.x));
    let side_dist = std.abs(std.abs(p.x) - (0.42 + drive * 0.14));
    let side_slab = 1.0 - std.smoothstep(0.06 + drive * 0.03, 0.16 + high * 0.05, side_dist);
    let strata_wave = std.abs(std.fract((p.y + time * (0.18 + drive * 0.42)) * (4.0 + drive * 9.0)) - 0.5) * 2.0;
    let strata = 1.0 - std.smoothstep(0.0, 0.16 + drive * 0.1, strata_wave);
    let impact = crispRing(r, std.fract(time * (0.75 + drive * 1.55)) * 0.92 + 0.04, 0.018 + drive * 0.035, 0.045) * pulse * 1.65;
    let glow = std.exp(-r * (2.1 - drive * 0.9)) * (0.18 + drive * 0.72);
    let layer = core_slab * (0.78 + drive * 1.1) + side_slab * (0.35 + drive * 0.55) + strata * core_slab * 0.42 + impact + glow;

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.12 + p.y * 0.17 + drive * 0.18, 0.78 * sat, bri);
    let edge = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.12 + r * 0.42 + 0.25 + high * 0.1, sat, bri);
    let color = std.mix(base * 0.55, edge, std.clamp(strata + side_slab + impact, 0.0, 1.0)) * std.clamp(layer, 0.0, 1.85);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * enabled, std.clamp(layer * 0.68 * enabled, 0.0, 1.0));
});
