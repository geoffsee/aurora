// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { crispRing, fbm } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 30, fn: 'solar_flare_variant' } as const;

export const solar_flareVariant = paletteVariantShell(
  (uv, time, hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const r = std.max(std.length(p), 0.001);
    const a = std.atan2(p.y, p.x);
    const drive = std.clamp(std.max(pulse, energy * 0.45 + bass * 0.45), 0.0, 1.0);
    const arms = 4.0 + std.floor(mid * 8.0);
    const arc_phase = (a / TAU) * arms + r * (2.2 + bass * 2.8) - time * (0.22 + drive * 0.75);
    const arcs =
      1.0 - std.smoothstep(0.0, 0.12 + high * 0.06, std.abs(std.fract(arc_phase) - 0.5) * 2.0);
    const rays = std.pow(
      0.5 + 0.5 * std.cos(a * (10.0 + high * 18.0) + time * (0.8 + bass * 1.5)),
      4.0 - high * 1.6,
    );
    const corona = std.exp(-r * (1.9 - drive * 0.7)) * (0.28 + drive * 1.05);
    const bloom =
      crispRing(
        r,
        std.fract(time * (0.55 + drive * 1.1)) * 0.75 + 0.1,
        0.022 + pulse * 0.045,
        0.055,
      ) *
      pulse *
      1.9;
    const granules = fbm(p * (4.0 + high * 5.0) + vec2f(time * 0.12, -time * 0.08));
    const layer =
      corona +
      arcs * (0.5 + drive * 0.8) +
      rays * (0.22 + high * 0.55) +
      bloom +
      granules * drive * 0.18;

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const core = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_shift * 0.2 + r * 0.35 + time * 0.02,
      0.82 * sat,
      bri,
    );
    const hot = std.clamp(core * 1.35 + vec3f(0.22, 0.18, 0.1), vec3f(0.0), vec3f(1.0));
    const color =
      std.mix(core, hot, std.clamp(corona + bloom, 0.0, 1.0)) * std.clamp(layer, 0.0, 1.95);
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(
      color * enabled,
      std.clamp(layer * (1.0 - std.smoothstep(0.95, 1.45, r)) * enabled, 0.0, 1.0),
    );
  },
);
