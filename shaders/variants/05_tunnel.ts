// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 5, fn: 'tunnel_variant' } as const;

export const tunnelVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const _params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const r = std.max(std.length(uv), 0.001);
    const a = std.atan2(uv.y, uv.x);
    const u = a / TAU + time * 0.04;
    const depth = 1.0 / r + time * (0.5 + bass * 0.9);

    const band = std.abs(std.fract(depth * 1.5) - 0.5) * 2.0;
    const band_glow = 1.0 - std.smoothstep(0.0, 0.22 + high * 0.22, band);

    const spoke_count = 12.0 + std.floor(bass * 16.0);
    const spoke = std.abs(std.fract(u * spoke_count) - 0.5) * 2.0;
    const spoke_glow = 1.0 - std.smoothstep(0.0, 0.18 + mid * 0.14, spoke);

    const neon = std.max(band_glow, spoke_glow * 0.85);
    const fog = std.clamp(r * 1.15, 0.0, 1.0);
    const core = std.exp(-r * 1.5) * (0.9 + 0.1 * pulse);
    const layer = neon * (1.0 - fog * 0.6) + core * 0.55;

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const hue_phase = depth * 0.05 + u * 0.4 + time * 0.04;
    const base = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_phase,
      0.85 * sat,
      bri,
    );
    const accent = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_phase + 0.5,
      sat,
      bri,
    );
    const color = std.mix(base, accent, neon).mul(std.clamp(0.2 + layer, 0.0, 1.6));

    const enabled = std.select(1.0, 0.0, energy < 0.0);
    const alpha = std.clamp(layer * (0.6 + 0.4 * pulse) * enabled, 0.0, 1.0);
    return vec4f(color.mul(enabled), alpha);
  },
);
