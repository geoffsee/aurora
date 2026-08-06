// @ts-nocheck
import { std } from 'typegpu';
import { vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { hash21 } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 6, fn: 'glitch_variant' } as const;

export const glitchVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, _mid, high) => {
    'use gpu';
    const _params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const blk_size = 0.12;
    const blk_id = std.floor(uv / blk_size);
    const blk_seed = hash21(blk_id + vec2f(std.floor(time * 6.0) * 0.013, 0.0));
    const blk_active = std.step(0.78 - high * 0.3, blk_seed);
    const blk_shift = (blk_seed * 2.0 - 1.0) * blk_active * (0.3 + bass * 0.4);
    const shifted = uv + vec2f(blk_shift, 0.0);

    const scan = 0.55 + 0.45 * std.step(0.5, std.fract(uv.y * 90.0 + time * 0.4));

    const bar_a = std.fract(shifted.y * 6.0 + time * 0.6 + blk_seed);
    const bar_b = std.fract(shifted.x * 4.0 - time * 0.4 + blk_seed * 1.7);
    const bars = std.step(0.5, bar_a) * 0.6 + std.step(0.5, bar_b) * 0.4;

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const split = 0.18 + 0.25 * blk_active + 0.2 * bass;
    const h_base = bars + shifted.x * 0.1 + time * 0.07;
    const r_col = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      h_base - split,
      sat,
      bri,
    ).r;
    const g_col = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), h_base, sat, bri).g;
    const b_col = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      h_base + split,
      sat,
      bri,
    ).b;

    const color = vec3f(r_col, g_col, b_col) * scan;
    const intensity = bars * (0.5 + 0.5 * blk_active) + 0.2 * pulse;
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    const alpha = std.clamp(intensity * enabled, 0.0, 1.0);
    return vec4f(color.mul(enabled), alpha);
  },
);
