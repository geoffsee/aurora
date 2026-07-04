// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 13, fn: 'laser_lattice_variant' } as const;

export const laser_latticeVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let drive = std.clamp(std.max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
    let sharpen = std.clamp(std.max(high, energy * 0.35 + pulse * 0.65), 0.0, 1.0);
    let y = uv.y + 0.72;
    let persp = 1.0 / std.max(y + 1.05, 0.18);
    let p = vec2f(uv.x * persp * (1.0 + drive), y * persp + time * (0.6 + drive * 1.5));
    let grid_x = std.abs(std.fract(p.x * (5.0 + mid * 9.0)) - 0.5) * 2.0;
    let grid_y = std.abs(std.fract(p.y * (4.0 + drive * 7.0)) - 0.5) * 2.0;
    let line_w = 0.028 + sharpen * 0.09 + pulse * 0.035;
    let beams = std.max(1.0 - std.smoothstep(0.0, line_w, grid_x), 1.0 - std.smoothstep(0.0, line_w, grid_y));
    let horizon = std.exp(-std.abs(uv.y + 0.34) * (7.0 - drive * 2.0));
    let sweep = 1.0 - std.smoothstep(0.0, 0.05 + sharpen * 0.04, std.abs(std.fract((uv.x + time * (0.2 + pulse * 0.25)) * 2.0) - 0.5) * 2.0);
    let layer = beams * (0.45 + 0.85 * drive) + horizon * (0.25 + pulse * 0.7) + sweep * sharpen * 0.5;

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), p.y * 0.08 + time * 0.03 + drive * 0.18, sat, bri);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(base * layer * enabled, std.clamp(layer * enabled, 0.0, 1.0));
});
