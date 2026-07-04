// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { fbm } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 26, fn: 'aurora_curtains_variant' } as const;

export const aurora_curtainsVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let flow = fbm(p * 0.72 + vec2f(time * 0.035, -time * 0.028));
    let fold = std.sin(p.y * (2.2 + mid * 2.6) + time * (0.32 + high * 0.55) + flow * 2.8)
      * (0.18 + bass * 0.16 + mid * 0.08);
    let sheet_phase = (p.x + fold + flow * 0.24) * (2.7 + mid * 2.8);
    let sheets = std.pow(0.5 + 0.5 * std.cos(sheet_phase * TAU), 2.2 + high * 1.6);
    let lower_glow = std.smoothstep(-1.1, -0.15, p.y) * (1.0 - std.smoothstep(0.35, 1.25, p.y));
    let edge_light = 1.0 - std.smoothstep(0.0, 0.22 + high * 0.08, std.abs(std.fract(sheet_phase + 0.18 * flow) - 0.5) * 2.0);
    let silk = fbm(vec2f(sheet_phase * 0.35, p.y * 1.8 - time * 0.05));
    let layer = (sheets * (0.42 + energy * 0.5) + edge_light * high * 0.18 + silk * 0.16) *
      lower_glow * (0.7 + pulse * 0.25);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.18 + sheet_phase * 0.08 + flow * 0.48 + time * 0.012, 0.74 * sat, bri);
    let accent = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.18 + p.y * 0.16 + flow * 0.62 + 0.24, sat, bri);
    let color = std.mix(base * 0.55, accent, std.clamp(sheets + edge_light * 0.25, 0.0, 1.0)) *
      std.clamp(0.42 + layer * 1.35, 0.0, 1.58);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * enabled, std.clamp(layer * 0.82 * enabled, 0.0, 1.0));
});
