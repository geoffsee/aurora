// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { hash21 } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 23, fn: 'scanlab_holo_variant' } as const;

export const scanlab_holoVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);

    let wobble = std.sin(p.y * 22.0 + time * 6.0) * (0.003 + bass * 0.01);
    let slip = std.sin(time * 0.8) * (0.02 + bass * 0.03);
    let y = p.y + wobble + slip;

    let scan = 0.6 + 0.4 * std.step(0.5, std.fract(y * 38.0 + time * 1.4));
    let band = 0.7 + 0.3 * std.step(0.5, std.fract(y * 5.5 + time * 0.3));

    // RGB split grows with highs
    let split = (0.004 + high * 0.018) * (1.0 + pulse * 0.5);
    let r = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), p.x * 0.1 + y * 0.6 + time * 0.02 - split, palette_extra.x, palette_extra.y).r;
    let g = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), p.x * 0.1 + y * 0.6 + time * 0.02, palette_extra.x, palette_extra.y).g;
    let b = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), p.x * 0.1 + y * 0.6 + time * 0.02 + split, palette_extra.x, palette_extra.y).b;

    let glitch = std.step(0.82 - high * 0.35, hash21(std.floor(vec2f(p.x * 9.0, y * 11.0) + std.floor(time * 7.0) * 0.07)));
    let tear = (1.0 - std.smoothstep(0.0, 0.03, std.abs(y + 0.1 - std.fract(time * 1.7) * 2.2))) * glitch * high;

    let col = vec3f(r, g, b) * scan * band + vec3f(tear * 0.8);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    let alpha = std.clamp((0.55 + 0.45 * scan) * enabled, 0.0, 1.0);
    return vec4f(col.mul(enabled), alpha);
});
