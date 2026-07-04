// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { fbm } from '../shared/math.ts';
import { duotoneAccent } from '../shared/duotone.ts';

export const meta = { index: 7, fn: 'fluid_variant' } as const;

export const fluidVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let t = time * 0.06;
    let p = uv * 0.6;
    let q = vec2f(fbm(p + vec2f(0.0, 0.0)), fbm(p + vec2f(3.1, 7.2)));
    let r = vec2f(
      fbm(p + 2.4 * q + vec2f(t,  1.7)),
      fbm(p + 2.4 * q + vec2f(-t, 8.3))
    );
    let s = vec2f(
      fbm(p + 3.6 * r + vec2f(t * 1.3 + bass * 0.5, 5.5)),
      fbm(p + 3.6 * r + vec2f(high * 0.4, t * 1.7))
    );
    let field = fbm(p + 4.5 * s + pulse * 0.6);

    let base = vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z);
    let accent = duotoneAccent(base);
    let raw = std.mix(base, accent, field);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let gray = vec3f(std.dot(raw, vec3f(0.299, 0.587, 0.114)));
    let color = std.mix(gray, raw, sat) * bri;

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    let alpha = std.clamp((0.65 + 0.35 * field) * enabled, 0.0, 1.0);
    return vec4f(color.mul(enabled), alpha);
});
