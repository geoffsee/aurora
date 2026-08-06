// @ts-nocheck
import { std } from 'typegpu';
import { vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { fbm } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 22, fn: 'inkbloom_variant' } as const;

export const inkbloomVariant = paletteVariantShell(
  (uv, time, _hue_shift, _pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const r = std.length(p);
    const t = time * 0.35;

    // Large scale flow
    const flow =
      vec2f(fbm(p * 0.7 + vec2f(t * 0.4, 0.0)) - 0.5, fbm(p * 0.7 + vec2f(0.0, t * 0.33)) - 0.5) *
      (0.6 + bass * 1.0);

    // Mid-frequency plumes
    const plume = fbm(p * 2.4 + flow * 1.5 + vec2f(t * 0.6, -t * 0.5) + mid * 0.8);

    // Fine sediment
    const sediment = fbm(p * 7.0 + flow * 3.0 + vec2f(-t * 1.1, t * 0.8)) * (0.4 + high * 0.9);

    const density = std.clamp(plume * 1.1 + sediment * 0.6 - r * 0.3, 0.0, 1.6);
    const edge = 1.0 - std.smoothstep(0.6, 1.1, density);

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const hue_phase = density * 0.8 + time * 0.02 + flow.x * 0.5;
    const base = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_phase,
      0.9 * sat,
      bri,
    );
    const color = std.mix(base * 0.2, base, edge);

    const enabled = std.select(1.0, 0.0, energy < 0.0);
    const alpha = std.clamp((0.55 + 0.45 * density) * (0.6 + bass * 0.3) * enabled, 0.0, 1.0);
    return vec4f(color.mul(enabled), alpha);
  },
);
