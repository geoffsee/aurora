// @ts-nocheck
import { std } from 'typegpu';
import { vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { crispRing, fbm } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 27, fn: 'bass_monolith_variant' } as const;

export const bass_monolithVariant = paletteVariantShell(
  (uv, time, hue_shift, pulse, energy, bass, _mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const r = std.length(p);
    const drive = std.clamp(std.max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
    const wobble = fbm(vec2f(p.y * 0.8, time * 0.08)) * (0.08 + drive * 0.14);
    const center_width = 0.22 + drive * 0.16 + wobble;
    const core_slab =
      1.0 - std.smoothstep(center_width, center_width + 0.055 + high * 0.04, std.abs(p.x));
    const side_dist = std.abs(std.abs(p.x) - (0.42 + drive * 0.14));
    const side_slab = 1.0 - std.smoothstep(0.06 + drive * 0.03, 0.16 + high * 0.05, side_dist);
    const strata_wave =
      std.abs(std.fract((p.y + time * (0.18 + drive * 0.42)) * (4.0 + drive * 9.0)) - 0.5) * 2.0;
    const strata = 1.0 - std.smoothstep(0.0, 0.16 + drive * 0.1, strata_wave);
    const impact =
      crispRing(
        r,
        std.fract(time * (0.75 + drive * 1.55)) * 0.92 + 0.04,
        0.018 + drive * 0.035,
        0.045,
      ) *
      pulse *
      1.65;
    const glow = std.exp(-r * (2.1 - drive * 0.9)) * (0.18 + drive * 0.72);
    const layer =
      core_slab * (0.78 + drive * 1.1) +
      side_slab * (0.35 + drive * 0.55) +
      strata * core_slab * 0.42 +
      impact +
      glow;

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const base = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_shift * 0.12 + p.y * 0.17 + drive * 0.18,
      0.78 * sat,
      bri,
    );
    const edge = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_shift * 0.12 + r * 0.42 + 0.25 + high * 0.1,
      sat,
      bri,
    );
    const color =
      std.mix(base * 0.55, edge, std.clamp(strata + side_slab + impact, 0.0, 1.0)) *
      std.clamp(layer, 0.0, 1.85);
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * enabled, std.clamp(layer * 0.68 * enabled, 0.0, 1.0));
  },
);
