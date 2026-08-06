// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { crispRing } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 12, fn: 'kick_rings_variant' } as const;

export const kick_ringsVariant = paletteVariantShell(
  (uv, time, hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const r = std.length(p);
    const a = std.atan2(p.y, p.x);
    const drive = std.clamp(std.max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
    const wave = std.fract(r * (5.0 + drive * 8.0) - time * (0.75 + drive * 1.7));
    const rings = 1.0 - std.smoothstep(0.0, 0.12 + drive * 0.12, std.abs(wave - 0.5) * 2.0);
    const burst_r = 0.12 + std.fract(time * 0.42) * 0.74;
    const burst = crispRing(r, burst_r, 0.018 + drive * 0.04, 0.04) * pulse * (1.0 - burst_r);
    const spokes =
      1.0 -
      std.smoothstep(
        0.0,
        0.08 + high * 0.08,
        std.abs(std.fract((a / TAU) * (10.0 + std.floor(mid * 14.0))) - 0.5) * 2.0,
      );
    const layer = rings * (0.35 + 0.95 * drive) + burst * (1.0 + pulse) + spokes * drive * 0.35;
    const vignette = 1.0 - std.smoothstep(0.72, 1.35, r);

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const color =
      vjDuotone(
        vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
        hue_shift * 0.3 + r * 0.42 + time * 0.03 + drive * 0.18,
        sat,
        bri,
      ) * std.clamp(layer * (0.75 + drive), 0.0, 1.7);
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * vignette * enabled, std.clamp(layer * vignette * enabled, 0.0, 1.0));
  },
);
