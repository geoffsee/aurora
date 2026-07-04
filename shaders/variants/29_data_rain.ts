// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { hash21 } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 29, fn: 'data_rain_variant' } as const;

export const data_rainVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect * 0.72 + 0.5, uv.y * 0.5 + 0.5);
    let columns = 24.0 + std.floor(high * 22.0);
    let rows = 30.0 + std.floor(mid * 18.0);
    let column = std.floor(p.x * columns);
    let column_seed = hash21(vec2f(column, 3.7));
    let speed = 0.8 + bass * 3.8 + column_seed * 1.4;
    let fall = time * speed + column_seed * rows;
    let grid = vec2f(p.x * columns, p.y * rows + fall);
    let cell = std.floor(grid);
    let local = std.fract(grid) - vec2f(0.5);
    let seed = hash21(cell + vec2f(0.0, std.floor(time * 0.75)));
    let live = std.step(0.57 - energy * 0.18 - high * 0.2, seed);
    let head_pos = std.fract(p.y * 0.18 + time * (0.18 + bass * 0.42) + column_seed);
    let row_phase = std.fract(grid.y / rows);
    let head_band = 1.0 - std.smoothstep(0.0, 0.065 + pulse * 0.035, std.abs(row_phase - head_pos));
    let trail = std.exp(-std.fract(row_phase - head_pos + 1.0) * (5.0 - bass * 1.8)) * (0.3 + energy * 0.45);
    let box_mask = (1.0 - std.smoothstep(0.34, 0.47, std.abs(local.x))) *
      (1.0 - std.smoothstep(0.34, 0.47, std.abs(local.y)));
    let vertical = (1.0 - std.smoothstep(0.04, 0.09 + high * 0.03, std.abs(local.x))) *
      (1.0 - std.smoothstep(0.12, 0.44, std.abs(local.y)));
    let horizontal = (1.0 - std.smoothstep(0.04, 0.09 + high * 0.03, std.abs(local.y - (seed - 0.5) * 0.36))) *
      (1.0 - std.smoothstep(0.1, 0.4, std.abs(local.x)));
    let corner = std.step(0.86 - high * 0.18, seed) *
      (1.0 - std.smoothstep(0.08, 0.22, std.length(std.abs(local) - vec2f(0.32))));
    let glyph = box_mask * (vertical * 0.5 + horizontal * 0.55 + corner * 0.45);
    let sparkle = std.step(0.96 - high * 0.24 - pulse * 0.16, hash21(cell + vec2f(std.floor(time * 12.0) * 0.07, 4.2)));
    let scanline = 0.76 + 0.24 * std.step(0.5, std.fract((p.y + time * 0.05) * 90.0));
    let layer = live * glyph * (trail + head_band * (0.95 + pulse * 0.7)) * scanline + sparkle * (0.65 + pulse);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.14 + column_seed * 0.22 + p.y * 0.18, 0.78 * sat, bri);
    let hot = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.14 + seed * 0.34 + 0.31, sat, bri);
    let color = std.mix(base * 0.32, hot, std.clamp(head_band + sparkle, 0.0, 1.0)) *
      std.clamp(layer * 1.35, 0.0, 1.85);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * enabled, std.clamp(layer * 0.8 * enabled, 0.0, 1.0));
});
