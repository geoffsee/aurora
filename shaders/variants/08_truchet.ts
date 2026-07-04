// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { hash21 } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 8, fn: 'truchet_variant' } as const;

export const truchetVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let tile_size = 0.22 - bass * 0.05;
    let cell = std.floor(uv / tile_size);
    let local = (uv / tile_size) - cell - vec2f(0.5);

    let h = hash21(cell + vec2f(std.floor(time * 0.3) * 0.017, 0.0));
    let flip = std.step(0.5, h);
    let lp = vec2f(local.x, std.mix(local.y, -local.y, flip));

    let d1 = std.abs(std.length(lp - vec2f(0.5,  0.5)) - 0.5);
    let d2 = std.abs(std.length(lp - vec2f(-0.5, -0.5)) - 0.5);
    let arc_d = std.min(d1, d2);

    let line_w = 0.04 + high * 0.08 + pulse * 0.05;
    let arc = 1.0 - std.smoothstep(line_w, line_w + 0.04, arc_d);

    let in_c1 = std.step(std.length(lp - vec2f(0.5,  0.5)),  0.5);
    let in_c2 = std.step(std.length(lp - vec2f(-0.5, -0.5)), 0.5);
    let fill_mask = std.max(in_c1, in_c2);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let hue_a = (cell.x + cell.y * 1.7) * 0.13 + time * 0.04;
    let line_col = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_a + h * 0.3, sat, bri);
    let fill_col = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_a + 0.5 + h * 0.2, 0.5 * sat, 0.6 * bri);

    let intensity = arc + fill_mask * (0.2 + 0.15 * pulse);
    let color = std.mix(fill_col, line_col, arc);

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    let alpha = std.clamp(intensity * enabled, 0.0, 1.0);
    return vec4f(color.mul(enabled), alpha);
});
