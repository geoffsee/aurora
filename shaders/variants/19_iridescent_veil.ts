// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { fbm } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 19, fn: 'iridescent_veil_variant' } as const;

export const iridescent_veilVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let r = std.length(p);
    let a = std.atan2(p.y, p.x);

    let warp = fbm(p * 1.2 + vec2f(time * 0.08, time * -0.05)) + mid * 0.3;
    let folds = std.sin((p.y + p.x * 0.6) * (9.0 + high * 14.0) + time * 3.2) * (0.5 + high * 0.6);
    let depth = 1.8 + bass * 1.4 + warp * 0.8;

    // Thin film: oscillate hue by optical path difference
    let film = std.sin(depth * 6.2 + a * 1.3 + time * 1.1) * 0.5 + 0.5;
    let rim = std.pow(1.0 - std.clamp(r * 0.72, 0.0, 1.0), 1.6 + bass * 0.8);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    // Shift through three adjacent hues in the chosen palette family
    let h0 = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), film * 0.6 + time * 0.01, sat, bri);
    let h1 = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), film * 0.6 + 0.22, sat * 0.95, bri);
    let h2 = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), film * 0.6 + 0.46, sat, bri * 0.95);
    let irid = std.mix(std.mix(h0, h1, film), h2, std.clamp(folds * 0.5 + 0.5, 0.0, 1.0));

    let veil = (0.45 + 0.55 * film) * (0.5 + 0.5 * rim) + pulse * 0.25;
    let layer = veil * (0.7 + bass * 0.3) + folds * high * 0.2;

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(irid * layer * enabled, std.clamp(layer * 0.85 * enabled, 0.0, 1.0));
});
