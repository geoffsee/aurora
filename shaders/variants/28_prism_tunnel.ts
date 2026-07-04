// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { kaleidoscope } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 28, fn: 'prism_tunnel_variant' } as const;

export const prism_tunnelVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p0 = vec2f(uv.x * aspect, uv.y);
    let slices = 5.0 + std.floor(mid * 9.0);
    let p = kaleidoscope(p0, slices, time * (0.08 + bass * 0.12));
    let r = std.max(std.length(p), 0.001);
    let a = std.atan2(p.y, p.x);
    let depth = 1.0 / r + time * (0.55 + bass * 1.15);
    let facet = 1.0 - std.smoothstep(0.0, 0.08 + high * 0.05, std.abs(std.fract(a / TAU * slices + depth * 0.16) - 0.5) * 2.0);
    let rings = 1.0 - std.smoothstep(0.0, 0.17 + bass * 0.08, std.abs(std.fract(depth * (1.45 + mid * 0.8)) - 0.5) * 2.0);
    let prism = 1.0 - std.smoothstep(0.0, 0.12 + high * 0.07, std.abs(std.fract((p.x - p.y) * (4.0 + high * 8.0) + time * 0.16) - 0.5) * 2.0);
    let core = std.exp(-r * (1.25 - bass * 0.35)) * (0.22 + pulse * 0.55 + energy * 0.25);
    let layer = std.max(facet * 0.85, rings) * (0.65 + bass * 0.75) + prism * high * 0.42 + core;

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.16 + depth * 0.045 + a * 0.18, 0.88 * sat, bri);
    let accent = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.16 + depth * 0.055 + 0.33 + high * 0.12, sat, bri);
    let color = std.mix(base, accent, std.clamp(prism + facet * 0.45, 0.0, 1.0)) * std.clamp(layer * (0.75 + energy * 0.35), 0.0, 1.8);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * enabled, std.clamp(layer * (1.0 - r * 0.22) * enabled, 0.0, 1.0));
});
