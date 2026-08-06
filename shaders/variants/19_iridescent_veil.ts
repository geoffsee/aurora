// @ts-nocheck
import { std } from 'typegpu';
import { vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { fbm } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 19, fn: 'iridescent_veil_variant' } as const;

export const iridescent_veilVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const r = std.length(p);
    const a = std.atan2(p.y, p.x);

    const warp = fbm(p * 1.2 + vec2f(time * 0.08, time * -0.05)) + mid * 0.3;
    const folds =
      std.sin((p.y + p.x * 0.6) * (9.0 + high * 14.0) + time * 3.2) * (0.5 + high * 0.6);
    const depth = 1.8 + bass * 1.4 + warp * 0.8;

    // Thin film: oscillate hue by optical path difference
    const film = std.sin(depth * 6.2 + a * 1.3 + time * 1.1) * 0.5 + 0.5;
    const rim = std.pow(1.0 - std.clamp(r * 0.72, 0.0, 1.0), 1.6 + bass * 0.8);

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    // Shift through three adjacent hues in the chosen palette family
    const h0 = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      film * 0.6 + time * 0.01,
      sat,
      bri,
    );
    const h1 = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      film * 0.6 + 0.22,
      sat * 0.95,
      bri,
    );
    const h2 = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      film * 0.6 + 0.46,
      sat,
      bri * 0.95,
    );
    const irid = std.mix(std.mix(h0, h1, film), h2, std.clamp(folds * 0.5 + 0.5, 0.0, 1.0));

    const veil = (0.45 + 0.55 * film) * (0.5 + 0.5 * rim) + pulse * 0.25;
    const layer = veil * (0.7 + bass * 0.3) + folds * high * 0.2;

    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(irid * layer * enabled, std.clamp(layer * 0.85 * enabled, 0.0, 1.0));
  },
);
