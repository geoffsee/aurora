// @ts-nocheck
import { std } from 'typegpu';
import { vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { crispRing, fbm } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 18, fn: 'mercury_lake_variant' } as const;

export const mercury_lakeVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const r = std.length(p);
    const a = std.atan2(p.y, p.x);

    // Low-frequency surface displacement from bass
    const surface = fbm(p * 1.6 + vec2f(time * 0.11, -time * 0.07)) * (0.6 + bass * 1.4);
    const dent =
      bass * 0.28 * std.sin(a * 3.0 + time * 1.2) + bass * 0.18 * std.cos(r * 7.0 - time * 0.9);
    const h = 0.04 * surface + dent;

    // Normal from height field for specular
    const eps = 0.012;
    const hx =
      fbm((p + vec2f(eps, 0.0)) * 1.6 + vec2f(time * 0.11, -time * 0.07)) *
        (0.6 + bass * 1.4) *
        0.04 +
      dent;
    const hy =
      fbm((p + vec2f(0.0, eps)) * 1.6 + vec2f(time * 0.11, -time * 0.07)) *
        (0.6 + bass * 1.4) *
        0.04 +
      dent;
    const n = std.normalize(vec3f(-(hx - h) / eps, -(hy - h) / eps, 1.0));

    // View direction (ortho-ish) + animated light
    const view = std.normalize(vec3f(p * 0.6, 1.4));
    const lpos = vec3f(
      std.cos(time * 0.7) * (0.6 + mid * 0.4),
      std.sin(time * 0.9) * 0.5 + high * 0.2,
      1.2,
    );
    const ldir = std.normalize(lpos - vec3f(p, 0.0));
    const spec = std.pow(std.max(std.dot(std.reflect(-ldir, n), view), 0.0), 28.0 + high * 24.0);

    // Ripples on top (highs)
    const ripple = crispRing(
      r,
      std.fract(time * (1.6 + high * 2.2)) * 0.9 + 0.12,
      0.008 + high * 0.012,
      0.03,
    );
    const ripple2 = crispRing(
      r,
      std.fract(time * (2.3 + mid * 1.1) + 1.7) * 0.7 + 0.3,
      0.006,
      0.02,
    );
    const caustic = (ripple + ripple2 * 0.6) * (0.3 + high * 0.7);

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const hue_phase = a * 0.06 + r * 0.2 + time * 0.015 + h * 3.2;
    const base = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_phase,
      0.7 * sat,
      bri,
    );
    const metal = std.mix(
      base,
      vec3f(1.0),
      std.clamp(spec * (0.6 + pulse * 0.5) + caustic * 0.5, 0.0, 0.9),
    );
    const layer = (0.35 + 0.9 * (spec + caustic * 0.7)) * (0.6 + bass * 0.3);

    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(
      metal * layer * enabled,
      std.clamp((layer * 0.9 + spec * 0.6) * enabled, 0.0, 1.0),
    );
  },
);
