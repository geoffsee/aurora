// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 5, fn: 'tunnel_variant' } as const;

export const tunnelVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let r = std.max(std.length(uv), 0.001);
    let a = std.atan2(uv.y, uv.x);
    let u = a / TAU + time * 0.04;
    let depth = 1.0 / r + time * (0.5 + bass * 0.9);

    let band = std.abs(std.fract(depth * 1.5) - 0.5) * 2.0;
    let band_glow = 1.0 - std.smoothstep(0.0, 0.22 + high * 0.22, band);

    let spoke_count = 12.0 + std.floor(bass * 16.0);
    let spoke = std.abs(std.fract(u * spoke_count) - 0.5) * 2.0;
    let spoke_glow = 1.0 - std.smoothstep(0.0, 0.18 + mid * 0.14, spoke);

    let neon = std.max(band_glow, spoke_glow * 0.85);
    let fog = std.clamp(r * 1.15, 0.0, 1.0);
    let core = std.exp(-r * 1.5) * (0.9 + 0.1 * pulse);
    let layer = neon * (1.0 - fog * 0.6) + core * 0.55;

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let hue_phase = depth * 0.05 + u * 0.4 + time * 0.04;
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase, 0.85 * sat, bri);
    let accent = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase + 0.5, sat, bri);
    let color = std.mix(base, accent, neon).mul(std.clamp(0.2 + layer, 0.0, 1.6));

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    let alpha = std.clamp(layer * (0.6 + 0.4 * pulse) * enabled, 0.0, 1.0);
    return vec4f(color.mul(enabled), alpha);
});
