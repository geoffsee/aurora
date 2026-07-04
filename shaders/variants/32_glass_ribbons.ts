// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { fbm } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 32, fn: 'glass_ribbons_variant' } as const;

export const glass_ribbonsVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let warp = fbm(p * 1.35 + vec2f(time * 0.055, -time * 0.04));
    let wave_a = std.sin(p.y * (2.4 + mid * 4.5) + time * (0.5 + bass * 0.8) + warp * 2.6) * (0.24 + bass * 0.12);
    let wave_b = std.cos((p.y + p.x * 0.35) * (3.4 + high * 5.0) - time * (0.4 + mid * 0.7) + warp * 1.8) * (0.18 + mid * 0.1);
    let width = 0.08 + bass * 0.055 + pulse * 0.035;
    let ribbon_a = 1.0 - std.smoothstep(0.0, width, std.abs(p.x - wave_a));
    let ribbon_b = 1.0 - std.smoothstep(0.0, width * 0.85, std.abs(p.x + wave_b));
    let moire = 1.0 - std.smoothstep(0.0, 0.13 + high * 0.06, std.abs(std.fract((p.x + p.y + warp * 0.35) * (9.0 + mid * 8.0) + time * 0.1) - 0.5) * 2.0);
    let glint = std.pow(std.max(0.0, 1.0 - std.abs(p.x - wave_a) / std.max(width, 0.001)), 3.0 + high * 4.0) * (0.35 + high * 1.1);
    let depth = std.exp(-std.abs(p.y) * 0.45) * (0.18 + energy * 0.35);
    let layer = ribbon_a * (0.55 + glint) + ribbon_b * (0.42 + mid * 0.45) + moire * (ribbon_a + ribbon_b) * 0.24 + depth;

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.15 + warp * 0.5 + p.y * 0.12 + time * 0.015, 0.68 * sat, bri);
    let highlight = std.clamp(vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.15 + warp * 0.5 + 0.28, sat, bri) * 1.28 + vec3f(0.12), vec3f(0.0), vec3f(1.0));
    let color = std.mix(base, highlight, std.clamp(glint + moire * 0.3, 0.0, 1.0)) * std.clamp(layer, 0.0, 1.75);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * enabled, std.clamp(layer * 0.72 * enabled, 0.0, 1.0));
});
