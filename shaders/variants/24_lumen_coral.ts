// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 24, fn: 'lumen_coral_variant' } as const;

export const lumen_coralVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let r = std.length(p);
    let a = std.atan2(p.y, p.x);

    // Curved space for branching
    let bend = 0.6 + bass * 0.8;
    p = vec2f(p.x * std.cos(p.y * bend), p.y);

    let acc = 0.0;
    let tip = 0.0;
    let q = p * 1.8;
    for (let i = 0; i < 5; i++) {
      let ang = a * (1.0 + f32(i) * 0.3) + time * (0.2 + f32(i) * 0.07) + mid * 0.6;
      let rad = 0.08 + f32(i) * 0.025 + bass * 0.02;
      let d = std.abs(std.length(q - vec2f(std.sin(ang) * 0.6, std.cos(ang * 1.3) * 0.3)) - rad);
      acc += 1.0 - std.smoothstep(0.0, 0.035 + high * 0.02, d);
      // Tip brightening
      tip += (1.0 - std.smoothstep(0.0, 0.02 + high * 0.03, d)) * (0.6 + high * 0.8);
      q = q * 1.6 + vec2f(std.sin(time * 0.4 + f32(i)), std.cos(time * 0.5)) * 0.15;
    }

    let core = std.exp(-r * (3.2 - bass * 1.0)) * (0.4 + pulse * 0.6);
    let layer = std.clamp(acc * 0.7 + tip * 0.9 + core, 0.0, 2.2);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let hue_phase = a * 0.15 + time * 0.03 + layer * 0.2;
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase, 0.85 * sat, bri);
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(base * layer * enabled, std.clamp((0.4 + 0.6 * layer) * enabled, 0.0, 1.0));
});
