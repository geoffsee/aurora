// @ts-nocheck
import { std } from 'typegpu';
import { vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { hash21 } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 8, fn: 'truchet_variant' } as const;

export const truchetVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, _mid, high) => {
    'use gpu';
    const _params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const tile_size = 0.22 - bass * 0.05;
    const cell = std.floor(uv / tile_size);
    const local = uv / tile_size - cell - vec2f(0.5);

    const h = hash21(cell + vec2f(std.floor(time * 0.3) * 0.017, 0.0));
    const flip = std.step(0.5, h);
    const lp = vec2f(local.x, std.mix(local.y, -local.y, flip));

    const d1 = std.abs(std.length(lp - vec2f(0.5, 0.5)) - 0.5);
    const d2 = std.abs(std.length(lp - vec2f(-0.5, -0.5)) - 0.5);
    const arc_d = std.min(d1, d2);

    const line_w = 0.04 + high * 0.08 + pulse * 0.05;
    const arc = 1.0 - std.smoothstep(line_w, line_w + 0.04, arc_d);

    const in_c1 = std.step(std.length(lp - vec2f(0.5, 0.5)), 0.5);
    const in_c2 = std.step(std.length(lp - vec2f(-0.5, -0.5)), 0.5);
    const fill_mask = std.max(in_c1, in_c2);

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const hue_a = (cell.x + cell.y * 1.7) * 0.13 + time * 0.04;
    const line_col = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_a + h * 0.3,
      sat,
      bri,
    );
    const fill_col = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_a + 0.5 + h * 0.2,
      0.5 * sat,
      0.6 * bri,
    );

    const intensity = arc + fill_mask * (0.2 + 0.15 * pulse);
    const color = std.mix(fill_col, line_col, arc);

    const enabled = std.select(1.0, 0.0, energy < 0.0);
    const alpha = std.clamp(intensity * enabled, 0.0, 1.0);
    return vec4f(color.mul(enabled), alpha);
  },
);
