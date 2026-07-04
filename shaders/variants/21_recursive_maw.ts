// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 21, fn: 'recursive_maw_variant' } as const;

export const recursive_mawVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let r0 = std.length(p);
    let acc = 0.0;
    let wsum = 0.0;
    let cbase = vec2f(-0.72, 0.18) + vec2f(std.sin(time * 0.1) * 0.06, std.cos(time * 0.13) * 0.05);
    let cmod = vec2f(high * 0.18, mid * 0.12) * std.sin(time * 0.7);
    let c = cbase + cmod;

    for (let i = 0; i < 6; i++) {
      let z = p * (1.6 + bass * 0.6);
      let z2 = std.dot(z, z);
      let inv = 1.0 / std.max(z2, 0.02);
      p = vec2f(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) * inv + c;
      let contrib = std.exp(-z2 * (0.7 + f32(i) * 0.15)) * (0.8 + 0.4 * pulse);
      acc += contrib;
      wsum += 1.0;
    }
    let field = std.clamp(acc / wsum, 0.0, 2.0);

    let depth = 1.0 / std.max(r0, 0.001) + time * (1.2 + bass * 2.0);
    let ring = 1.0 - std.smoothstep(0.0, 0.14 + bass * 0.1, std.abs(std.fract(depth) - 0.5) * 2.0);
    let spokes = 1.0 - std.smoothstep(0.0, 0.05 + high * 0.08, std.abs(std.fract(std.atan2(p.y, p.x) / TAU * (6.0 + mid * 8.0) + time * 0.3) - 0.5) * 2.0);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let hue_phase = std.atan2(p.y, p.x) * 0.3 + depth * 0.03 + field * 0.4;
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase, 0.85 * sat, bri);
    let layer = field * 0.9 + ring * (0.6 + bass * 0.6) + spokes * (0.35 + high * 0.5);

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(base * layer * enabled, std.clamp(layer * 0.75 * enabled, 0.0, 1.0));
});
