// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { hash21 } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 11, fn: 'high_spark_variant' } as const;

export const high_sparkVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, _bass, _mid, high) => {
    'use gpu';
    const _params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const sparkle = std.clamp(std.max(high, energy * 0.45 + pulse * 0.55), 0.0, 1.0);
    const p = uv + vec2f(time * 0.035, -time * 0.02);
    const scale = 14.0 + sparkle * 42.0;
    const cell = std.floor(p * scale);
    const local = std.fract(p * scale) - vec2f(0.5);
    const seed = hash21(cell);
    const twinkle = 0.5 + 0.5 * std.sin(time * (5.0 + sparkle * 12.0) + seed * TAU);
    const point = 1.0 - std.smoothstep(0.018 + sparkle * 0.018, 0.19, std.length(local));
    const visible = std.step(0.82 - sparkle * 0.45 - pulse * 0.2, seed);
    const streak =
      (1.0 - std.smoothstep(0.0, 0.05 + sparkle * 0.04, std.abs(local.y))) *
      (1.0 - std.smoothstep(0.0, 0.38, std.abs(local.x))) *
      std.step(0.88 - pulse * 0.3, seed);
    const glow = (point * (0.35 + 0.65 * twinkle) + streak * (0.45 + pulse * 0.5)) * visible;

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const color =
      vjDuotone(
        vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
        seed + time * 0.04 + sparkle * 0.12,
        sat,
        bri,
      ) *
      (0.45 + 1.1 * glow + sparkle * 0.35);
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * glow * enabled, std.clamp(glow * (0.55 + sparkle), 0.0, 1.0) * enabled);
  },
);
