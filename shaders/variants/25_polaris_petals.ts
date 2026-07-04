// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { crispRing, hash21 } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 25, fn: 'polaris_petals_variant' } as const;

export const polaris_petalsVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let r = std.max(std.length(p), 0.001);
    let a = std.atan2(p.y, p.x);

    let petals = 5.0 + std.floor(mid * 7.0);
    let open = 0.6 + bass * 0.9 + pulse * 0.3;
    let lobe = std.pow(std.abs(std.cos(a * petals + time * (0.6 + bass * 0.8))), 1.6 / open);
    let petal = 1.0 - std.smoothstep(0.35, 0.95 + high * 0.2, r / (0.55 + lobe * 0.45));

    // Shear / twist
    let twist = std.sin(a * 2.0 + time * 1.1) * (0.2 + mid * 0.5);
    let shear = 1.0 - std.smoothstep(0.0, 0.08 + high * 0.06, std.abs(std.fract((a + twist) / TAU * (petals * 2.0)) - 0.5) * 2.0);

    // Shatter on pulse
    let crack = std.step(0.6 - pulse * 0.7, hash21(std.floor(vec2f(a * 9.0, r * 11.0) + std.floor(time * 4.0))));
    let burst = crispRing(r, std.fract(time * 1.8) * 0.9 + 0.05, 0.01 + pulse * 0.04, 0.05) * pulse * 1.8;

    let corona = std.exp(-r * (4.0 - high * 2.0)) * (0.4 + high * 0.8);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let hue_phase = a * 0.08 + time * 0.025 + r * 0.5;
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase, 0.9 * sat, bri);
    let layer = petal * 0.9 + shear * 0.5 + corona + burst + crack * pulse * 0.6;
    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(base * layer * enabled, std.clamp(layer * 0.7 * enabled, 0.0, 1.0));
});
