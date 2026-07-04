// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { hash21 } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 6, fn: 'glitch_variant' } as const;

export const glitchVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let blk_size = 0.12;
    let blk_id = std.floor(uv / blk_size);
    let blk_seed = hash21(blk_id + vec2f(std.floor(time * 6.0) * 0.013, 0.0));
    let blk_active = std.step(0.78 - high * 0.30, blk_seed);
    let blk_shift = (blk_seed * 2.0 - 1.0) * blk_active * (0.30 + bass * 0.40);
    let shifted = uv + vec2f(blk_shift, 0.0);

    let scan = 0.55 + 0.45 * std.step(0.5, std.fract(uv.y * 90.0 + time * 0.4));

    let bar_a = std.fract(shifted.y * 6.0 + time * 0.6 + blk_seed);
    let bar_b = std.fract(shifted.x * 4.0 - time * 0.4 + blk_seed * 1.7);
    let bars = std.step(0.5, bar_a) * 0.6 + std.step(0.5, bar_b) * 0.4;

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let split = 0.18 + 0.25 * blk_active + 0.20 * bass;
    let h_base = bars + shifted.x * 0.1 + time * 0.07;
    let r_col = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), h_base - split, sat, bri).r;
    let g_col = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), h_base,         sat, bri).g;
    let b_col = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), h_base + split, sat, bri).b;

    let color = vec3f(r_col, g_col, b_col) * scan;
    let intensity = bars * (0.5 + 0.5 * blk_active) + 0.2 * pulse;
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    let alpha = std.clamp(intensity * enabled, 0.0, 1.0);
    return vec4f(color.mul(enabled), alpha);
});
