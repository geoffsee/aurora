// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { crispRing, fbm } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 18, fn: 'mercury_lake_variant' } as const;

export const mercury_lakeVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let r = std.length(p);
    let a = std.atan2(p.y, p.x);

    // Low-frequency surface displacement from bass
    let surface = fbm(p * 1.6 + vec2f(time * 0.11, -time * 0.07)) * (0.6 + bass * 1.4);
    let dent = bass * 0.28 * std.sin(a * 3.0 + time * 1.2) + bass * 0.18 * std.cos(r * 7.0 - time * 0.9);
    let h = 0.04 * surface + dent;

    // Normal from height field for specular
    let eps = 0.012;
    let hx = fbm((p + vec2f(eps, 0.0)) * 1.6 + vec2f(time * 0.11, -time * 0.07)) * (0.6 + bass * 1.4) * 0.04 + dent;
    let hy = fbm((p + vec2f(0.0, eps)) * 1.6 + vec2f(time * 0.11, -time * 0.07)) * (0.6 + bass * 1.4) * 0.04 + dent;
    let n = std.normalize(vec3f(-(hx - h) / eps, -(hy - h) / eps, 1.0));

    // View direction (ortho-ish) + animated light
    let view = std.normalize(vec3f(p * 0.6, 1.4));
    let lpos = vec3f(std.cos(time * 0.7) * (0.6 + mid * 0.4), std.sin(time * 0.9) * 0.5 + high * 0.2, 1.2);
    let ldir = std.normalize(lpos - vec3f(p, 0.0));
    let spec = std.pow(std.max(std.dot(std.reflect(-ldir, n), view), 0.0), 28.0 + high * 24.0);

    // Ripples on top (highs)
    let ripple = crispRing(r, std.fract(time * (1.6 + high * 2.2)) * 0.9 + 0.12, 0.008 + high * 0.012, 0.03);
    let ripple2 = crispRing(r, std.fract(time * (2.3 + mid * 1.1) + 1.7) * 0.7 + 0.3, 0.006, 0.02);
    let caustic = (ripple + ripple2 * 0.6) * (0.3 + high * 0.7);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let hue_phase = a * 0.06 + r * 0.2 + time * 0.015 + h * 3.2;
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase, 0.7 * sat, bri);
    let metal = std.mix(base, vec3f(1.0), std.clamp(spec * (0.6 + pulse * 0.5) + caustic * 0.5, 0.0, 0.9));
    let layer = (0.35 + 0.9 * (spec + caustic * 0.7)) * (0.6 + bass * 0.3);

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(metal * layer * enabled, std.clamp((layer * 0.9 + spec * 0.6) * enabled, 0.0, 1.0));
});
